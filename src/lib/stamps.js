import { SYNCED_SETTINGS, emptyMeta } from './model.js';

// Wijzigingen bijhouden en twee versies samenvoegen (voor synchronisatie tussen apparaten).
//
// Elke rekening en elke maand is een los "record" met een tijdstip van laatste wijziging.
// Verwijderen laat een grafsteen achter (meta.del), zodat een verwijdering ook op andere
// apparaten doorkomt. Samenvoegen gebeurt per record; alleen als een record op beide
// apparaten is gewijzigd sinds de vorige synchronisatie is er een echt conflict.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const syncedSettings = (s) => Object.fromEntries(SYNCED_SETTINGS.map((k) => [k, s?.[k] ?? null]));

// Vergelijkt prev en next en zet tijdstempels voor alles wat veranderd is.
export function stampChanges(prev, next, now = Date.now()) {
  if (prev === next) return next;
  const meta = structuredClone(prev.meta || emptyMeta());

  const prevAcc = new Map(prev.accounts.map((a) => [a.id, a]));
  const nextAcc = new Map(next.accounts.map((a) => [a.id, a]));
  for (const [id, a] of nextAcc) {
    if (!prevAcc.has(id) || !same(prevAcc.get(id), a)) {
      meta.acc[id] = now;
      delete meta.del['a:' + id];
    }
  }
  for (const id of prevAcc.keys()) {
    if (!nextAcc.has(id)) {
      meta.del['a:' + id] = now;
      delete meta.acc[id];
    }
  }

  for (const [m, snap] of Object.entries(next.months)) {
    if (!prev.months[m] || !same(prev.months[m], snap)) {
      meta.mon[m] = now;
      delete meta.del['m:' + m];
    }
  }
  for (const m of Object.keys(prev.months)) {
    if (!next.months[m]) {
      meta.del['m:' + m] = now;
      delete meta.mon[m];
    }
  }

  if (!same(prev.accounts.map((a) => a.id), next.accounts.map((a) => a.id))) meta.order = now;
  if (!same(syncedSettings(prev.settings), syncedSettings(next.settings))) meta.set = now;

  return { ...next, meta };
}

// Vingerafdruk van alles wat gesynchroniseerd wordt.
export function fingerprint(state) {
  return JSON.stringify([state.accounts, state.months, syncedSettings(state.settings), state.meta]);
}

function version(state, kind, key) {
  const rec = kind === 'acc' ? state.accounts.find((a) => a.id === key) : state.months[key];
  const delKey = (kind === 'acc' ? 'a:' : 'm:') + key;
  if (rec) return { rec, t: state.meta[kind][key] || 0, deleted: false };
  if (state.meta.del[delKey]) return { rec: undefined, t: state.meta.del[delKey], deleted: true };
  return null;
}

function baseTime(base, kind, key) {
  if (!base) return 0;
  const delKey = (kind === 'acc' ? 'a:' : 'm:') + key;
  return Math.max(base[kind]?.[key] || 0, base.del?.[delKey] || 0);
}

// Voegt local en remote samen. base = meta van de laatst gesynchroniseerde versie (of null).
// Geeft { state, conflicts } terug. Bij een conflict wint de nieuwste versie; de andere wordt
// bewaard in conflicts zodat de gebruiker alsnog kan kiezen.
export function mergeStates(local, remote, base) {
  const meta = emptyMeta();
  const conflicts = [];
  const accounts = new Map();
  const months = {};

  const keysOf = (kind) => {
    const pre = kind === 'acc' ? 'a:' : 'm:';
    const keys = new Set();
    for (const s of [local, remote]) {
      if (kind === 'acc') s.accounts.forEach((a) => keys.add(a.id));
      else Object.keys(s.months).forEach((m) => keys.add(m));
      Object.keys(s.meta.del).filter((k) => k.startsWith(pre)).forEach((k) => keys.add(k.slice(2)));
    }
    return keys;
  };

  for (const kind of ['acc', 'mon']) {
    const pre = kind === 'acc' ? 'a:' : 'm:';
    for (const key of keysOf(kind)) {
      const L = version(local, kind, key);
      const R = version(remote, kind, key);
      let win;
      if (!L || !R) win = L || R;
      else if (same(L.rec, R.rec)) win = L.t >= R.t ? L : R;
      else {
        const bt = baseTime(base, kind, key);
        const lChanged = L.t > bt;
        const rChanged = R.t > bt;
        if (lChanged && !rChanged) win = L;
        else if (rChanged && !lChanged) win = R;
        else {
          win = R.t > L.t ? R : L;
          conflicts.push({
            kind,
            key,
            local: L.rec,
            remote: R.rec,
            localTime: L.t,
            remoteTime: R.t,
            chosen: win === L ? 'local' : 'remote',
          });
        }
      }
      if (!win) continue;
      if (win.deleted) meta.del[pre + key] = win.t;
      else {
        meta[kind][key] = win.t;
        if (kind === 'acc') accounts.set(key, win.rec);
        else months[key] = win.rec;
      }
    }
  }

  // Volgorde van rekeningen: van de versie waarin die het laatst is aangepast
  const primary = (remote.meta.order || 0) > (local.meta.order || 0) ? remote : local;
  const secondary = primary === local ? remote : local;
  const order = [];
  for (const a of [...primary.accounts, ...secondary.accounts]) {
    if (accounts.has(a.id) && !order.includes(a.id)) order.push(a.id);
  }
  meta.order = Math.max(local.meta.order || 0, remote.meta.order || 0);

  // Gesynchroniseerde instellingen: nieuwste wint; apparaat-instellingen blijven lokaal
  const setSrc = (remote.meta.set || 0) > (local.meta.set || 0) ? remote : local;
  const settings = { ...local.settings };
  for (const k of SYNCED_SETTINGS) if (setSrc.settings?.[k] !== undefined) settings[k] = setSrc.settings[k];
  meta.set = Math.max(local.meta.set || 0, remote.meta.set || 0);

  return {
    state: { ...local, accounts: order.map((id) => accounts.get(id)), months, settings, meta },
    conflicts,
  };
}

// Kiest bij een conflict alsnog de andere versie. Wordt als nieuwe wijziging gestempeld.
export function applyConflictChoice(state, conflict, choice) {
  const rec = choice === 'local' ? conflict.local : conflict.remote;
  if (conflict.kind === 'acc') {
    const exists = state.accounts.some((a) => a.id === conflict.key);
    let accounts;
    if (!rec) accounts = state.accounts.filter((a) => a.id !== conflict.key);
    else if (exists) accounts = state.accounts.map((a) => (a.id === conflict.key ? rec : a));
    else accounts = [...state.accounts, rec];
    return { ...state, accounts };
  }
  const months = { ...state.months };
  if (!rec) delete months[conflict.key];
  else months[conflict.key] = rec;
  return { ...state, months };
}

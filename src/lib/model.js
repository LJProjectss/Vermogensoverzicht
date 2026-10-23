// Datamodel voor het vermogensoverzicht.
//
// state = {
//   version: 1,
//   accounts: [{ id, name, type, liquid, track, archived, box3 }],
//   months: { 'YYYY-MM': { values: { [accountId]: number }, deposits: { [accountId]: number }, note: string } },
//   settings: { theme: 'auto' | 'light' | 'dark', lastExport: ISO-string | null, ... },
//   meta: { acc: { [id]: ts }, mon: { [month]: ts }, del: { ['a:id' | 'm:month']: ts }, order: ts, set: ts }
// }
//
// Schulden worden als positief bedrag opgeslagen en in berekeningen afgetrokken.
// meta bevat wijzigingstijdstippen per rekening/maand, nodig om tussen apparaten te synchroniseren.

export const CATEGORIES = [
  { id: 'cash', label: 'Cash & sparen' },
  { id: 'beleggingen', label: 'Beleggingen' },
  { id: 'pensioen', label: 'Pensioen' },
  { id: 'bezit', label: 'Woning & bezit' },
  { id: 'schulden', label: 'Schulden' },
];

export const ASSET_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'schulden');

// liquid = telt mee als "vrij besteedbaar"; track = inleg vs rendement bijhouden;
// box3 = telt standaard mee in box 3 (eigen woning, hypotheek, pensioen en auto voor eigen gebruik niet)
export const TYPES = {
  betaal:        { label: 'Betaalrekening',       cat: 'cash',        debt: false, liquid: true,  track: false, box3: true  },
  spaar:         { label: 'Spaarrekening',        cat: 'cash',        debt: false, liquid: true,  track: false, box3: true  },
  beleggen:      { label: 'Beleggingsrekening',   cat: 'beleggingen', debt: false, liquid: true,  track: true,  box3: true  },
  crypto:        { label: 'Crypto',               cat: 'beleggingen', debt: false, liquid: true,  track: true,  box3: true  },
  pensioen:      { label: 'Pensioen',             cat: 'pensioen',    debt: false, liquid: false, track: false, box3: false },
  vastgoed:      { label: 'Woning / vastgoed',    cat: 'bezit',       debt: false, liquid: false, track: false, box3: false },
  voertuig:      { label: 'Voertuig',             cat: 'bezit',       debt: false, liquid: false, track: false, box3: false },
  bezit_overig:  { label: 'Overig bezit',         cat: 'bezit',       debt: false, liquid: false, track: false, box3: true  },
  hypotheek:     { label: 'Hypotheek',            cat: 'schulden',    debt: true,  liquid: false, track: false, box3: false },
  studieschuld:  { label: 'Studieschuld',         cat: 'schulden',    debt: true,  liquid: true,  track: false, box3: true  },
  lening:        { label: 'Lening / krediet',     cat: 'schulden',    debt: true,  liquid: true,  track: false, box3: true  },
  schuld_overig: { label: 'Overige schuld',       cat: 'schulden',    debt: true,  liquid: true,  track: false, box3: true  },
};

export const typeOf = (acc) => TYPES[acc.type] || TYPES.bezit_overig;
export const isDebt = (acc) => typeOf(acc).debt;
export const catOf = (acc) => typeOf(acc).cat;

// Box 3-soort van een rekening: 'bank' | 'overig' | 'schuld' | null (telt niet mee).
// acc.box3: 'auto' (volgt het type) | 'ja' | 'nee'
export function box3Class(acc) {
  const include = acc.box3 === 'ja' ? true : acc.box3 === 'nee' ? false : typeOf(acc).box3;
  if (!include) return null;
  if (isDebt(acc)) return 'schuld';
  return catOf(acc) === 'cash' ? 'bank' : 'overig';
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function makeAccount(name, type) {
  const t = TYPES[type] || TYPES.bezit_overig;
  return { id: newId(), name: name.trim(), type, liquid: t.liquid, track: t.track, archived: false, box3: 'auto' };
}

// Instellingen die tussen apparaten worden gesynchroniseerd. De rest (thema, privacymodus,
// laatste back-up, inflatieweergave) hoort bij het apparaat.
export const SYNCED_SETTINGS = ['goal', 'projection', 'box3Partner', 'income', 'monthlyExpenses', 'targetInvestPct', 'fiRate', 'reminder'];

export function defaultSettings() {
  return {
    theme: 'auto',
    lastExport: null,
    backupSnoozeUntil: null,
    privacy: false,
    realTerms: false,
    goal: { amount: null, date: null },
    projection: { saving: null, investing: null, returnPct: 5 },
    box3Partner: false,
    income: null,
    monthlyExpenses: null, // uitgaven per maand: voor noodbuffer en financiële onafhankelijkheid
    targetInvestPct: null, // gewenst aandeel beleggingen in cash + beleggingen (0-100)
    fiRate: 4, // opnamepercentage per jaar voor het FI-getal
    reminder: { day: 1, time: '19:00' },
  };
}

export function emptyMeta() {
  return { acc: {}, mon: {}, del: {}, order: 0, set: 0 };
}

export function emptyState() {
  return { version: 1, accounts: [], months: {}, settings: defaultSettings(), meta: emptyMeta() };
}

function normalizeMeta(raw) {
  const m = emptyMeta();
  if (!raw || typeof raw !== 'object') return m;
  for (const k of ['acc', 'mon', 'del']) {
    if (raw[k] && typeof raw[k] === 'object') {
      for (const [id, ts] of Object.entries(raw[k])) if (Number.isFinite(+ts)) m[k][id] = +ts;
    }
  }
  m.order = Number.isFinite(+raw.order) ? +raw.order : 0;
  m.set = Number.isFinite(+raw.set) ? +raw.set : 0;
  return m;
}

// Maakt ingelezen data robuust (oude/handmatige bestanden, ontbrekende velden).
export function normalizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  if (Array.isArray(raw.accounts)) {
    s.accounts = raw.accounts
      .filter((a) => a && a.id && a.name)
      .map((a) => {
        const type = TYPES[a.type] ? a.type : 'bezit_overig';
        const t = TYPES[type];
        return {
          id: String(a.id),
          name: String(a.name),
          type,
          liquid: typeof a.liquid === 'boolean' ? a.liquid : t.liquid,
          track: typeof a.track === 'boolean' ? a.track : t.track,
          archived: !!a.archived,
          box3: a.box3 === 'ja' || a.box3 === 'nee' ? a.box3 : 'auto',
        };
      });
  }
  if (raw.months && typeof raw.months === 'object') {
    for (const [m, snap] of Object.entries(raw.months)) {
      if (!/^\d{4}-\d{2}$/.test(m) || !snap) continue;
      const values = {};
      const deposits = {};
      for (const [k, v] of Object.entries(snap.values || {})) if (Number.isFinite(+v)) values[k] = +v;
      for (const [k, v] of Object.entries(snap.deposits || {})) if (Number.isFinite(+v) && +v !== 0) deposits[k] = +v;
      s.months[m] = { values, deposits, note: typeof snap.note === 'string' ? snap.note : '' };
    }
  }
  if (raw.settings && typeof raw.settings === 'object') {
    const d = defaultSettings();
    s.settings = { ...d, ...raw.settings };
    s.settings.goal = { ...d.goal, ...(raw.settings.goal || {}) };
    s.settings.projection = { ...d.projection, ...(raw.settings.projection || {}) };
    s.settings.reminder = { ...d.reminder, ...(raw.settings.reminder || {}) };
  }
  s.meta = normalizeMeta(raw.meta);
  return s;
}

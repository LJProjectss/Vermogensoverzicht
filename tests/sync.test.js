// Synchronisatie met een nagebootste Google Drive en twee nagebootste apparaten.
// Uitvoeren: npm test
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- nep-localStorage per apparaat ----------
class Store {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
const devices = { A: new Store(), B: new Store() };
const use = (d) => { globalThis.localStorage = devices[d]; };
for (const d of Object.values(devices)) {
  d.setItem('vermogensoverzicht.gtoken', JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3600e3 }));
}

// ---------- nep-Google Drive (alleen de aanroepen die de app gebruikt) ----------
const files = new Map();
let nextId = 1;
let online = true;
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, opts = {}) => {
  if (!online) throw new TypeError('Failed to fetch');
  const u = new URL(url);
  const method = opts.method || 'GET';
  if (u.pathname.endsWith('/about')) return json({ user: { emailAddress: 'test@example.com' } });
  if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
    const parts = opts.body.split(/--vmo[a-z0-9]+/).filter((p) => p.includes('Content-Type'));
    const meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
    const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
    const id = 'f' + nextId++;
    files.set(id, { name: meta.name, content, version: 1 });
    return json({ id, name: meta.name, version: '1' });
  }
  const m = u.pathname.match(/files\/([^/]+)$/);
  const f = m && files.get(m[1]);
  if (!f) return json({ error: { message: 'not found' } }, 404);
  if (method === 'PATCH') { f.content = opts.body; f.version++; return json({ id: m[1], name: f.name, version: String(f.version) }); }
  if (u.searchParams.get('alt') === 'media') return new Response(f.content);
  return json({ id: m[1], name: f.name, version: String(f.version), trashed: false });
};

const { emptyState, makeAccount } = await import('../src/lib/model.js');
const { stampChanges } = await import('../src/lib/stamps.js');
const sync = await import('../src/lib/sync.js');

const edit = (s, fn) => stampChanges(s, fn(structuredClone(s)));
const setMonth = (s, m, id, v, note = '') =>
  edit(s, (x) => { x.months[m] = { values: { ...(x.months[m]?.values || {}), [id]: v }, deposits: {}, note }; return x; });
const tick = () => new Promise((r) => setTimeout(r, 5)); // zorgt voor oplopende tijdstempels

test('synchronisatie tussen twee apparaten', async (t) => {
  use('A');
  const acc = makeAccount('Spaar', 'spaar');
  let A = setMonth(edit(emptyState(), (x) => { x.accounts.push(acc); return x; }), '2026-01', acc.id, 1000);
  let B = emptyState();
  let cfgA;

  await t.test('A maakt een versleuteld bestand', async () => {
    cfgA = await sync.connectNew({ folderId: 'folder1', folderName: 'Financiën', password: 'geheim-wachtwoord', state: A });
    const f = files.get(cfgA.fileId);
    assert.ok(f.content.includes('"iv"'));
    assert.ok(!f.content.includes('Spaar'), 'bestand moet versleuteld zijn');
  });

  await t.test('B: verkeerd wachtwoord wordt geweigerd, juist wachtwoord geeft de data', async () => {
    use('B');
    await assert.rejects(sync.openExisting({ fileId: cfgA.fileId, password: 'fout' }), /Onjuist wachtwoord/);
    const o = await sync.openExisting({ fileId: cfgA.fileId, password: 'geheim-wachtwoord' });
    B = (await sync.finishExisting({ fileId: cfgA.fileId, fileName: 'x', ...o, local: B, mode: 'replace' })).state;
    assert.equal(B.months['2026-01'].values[acc.id], 1000);
  });

  await t.test('wijziging op A komt aan op B; zonder wijziging wordt niets geüpload', async () => {
    await tick();
    use('A');
    A = setMonth(A, '2026-02', acc.id, 1100);
    assert.equal((await sync.syncOnce(A)).state, null);
    use('B');
    B = (await sync.syncOnce(B)).state;
    assert.equal(B.months['2026-02'].values[acc.id], 1100);
    const v = files.get(cfgA.fileId).version;
    assert.equal((await sync.syncOnce(B)).state, null);
    assert.equal(files.get(cfgA.fileId).version, v);
  });

  await t.test('offline wijziging op B wordt later samengevoegd met die van A', async () => {
    await tick();
    online = false;
    B = setMonth(B, '2026-03', acc.id, 1200, 'offline op B');
    await assert.rejects(sync.syncOnce(B), TypeError);
    online = true;
    use('A');
    await tick();
    A = setMonth(A, '2026-04', acc.id, 1300);
    await sync.syncOnce(A);
    use('B');
    const r = await sync.syncOnce(B);
    B = r.state;
    assert.equal(B.months['2026-03'].note, 'offline op B');
    assert.equal(B.months['2026-04'].values[acc.id], 1300);
    assert.equal(r.conflicts.length, 0);
    use('A');
    A = (await sync.syncOnce(A)).state;
    assert.equal(A.months['2026-03'].note, 'offline op B');
  });

  await t.test('zelfde maand op beide apparaten: conflict, nieuwste wint', async () => {
    await tick();
    A = setMonth(A, '2026-01', acc.id, 5555);
    await sync.syncOnce(A);
    use('B');
    await tick();
    B = setMonth(B, '2026-01', acc.id, 7777);
    const r = await sync.syncOnce(B);
    B = r.state || B;
    assert.equal(r.conflicts.length, 1);
    assert.equal(B.months['2026-01'].values[acc.id], 7777);
  });

  await t.test('verwijdering op B komt door op A', async () => {
    await tick();
    B = edit(B, (x) => { delete x.months['2026-02']; return x; });
    await sync.syncOnce(B);
    use('A');
    A = (await sync.syncOnce(A)).state;
    assert.equal(A.months['2026-02'], undefined);
    assert.equal(A.months['2026-01'].values[acc.id], 7777);
  });

  await t.test('na lokaal wissen (pincode vergeten) komt de data terug uit de cloud', async () => {
    sync.resetSyncBase();
    const r = await sync.syncOnce(emptyState());
    assert.equal(Object.keys(r.state.months).length, 3);
    assert.equal((await sync.syncOnce(r.state)).state, null);
  });
});

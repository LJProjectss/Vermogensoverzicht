// Rekenlogica: samenvoegen, Box 3, analyses, inflatie, versleuteling, invoercontrole, agenda.
// Uitvoeren: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, makeAccount, normalizeState, box3Class } from '../src/lib/model.js';
import { stampChanges, mergeStates, fingerprint, applyConflictChoice } from '../src/lib/stamps.js';
import { computeBox3, box3Years } from '../src/lib/box3.js';
import {
  accountPerformance, accountSeries, fiNumber, project, rebalanceAmount, requiredInvesting, snapshotFigures, yearSummary,
} from '../src/lib/analysis.js';
import { buildSeries, suspicious } from '../src/lib/calc.js';
import { deflateRows, inflationFactor } from '../src/lib/cbs.js';
import { deriveKey, encryptJson, decryptJson, newKdf } from '../src/lib/crypto.js';
import { demoState } from '../src/lib/demo.js';
import { parseAmount } from '../src/lib/format.js';
import { reminderIcs } from '../src/lib/ics.js';

const month = (state, m, values, deposits = {}, note = '') => {
  state.months[m] = { values, deposits, note };
};

// ---------- wijzigingen en samenvoegen ----------
test('wijzigingen krijgen tijdstempels en verwijderingen grafstenen', () => {
  const spaar = makeAccount('Spaar', 'spaar');
  const s1 = stampChanges(emptyState(), { ...emptyState(), accounts: [spaar] }, 1000);
  assert.equal(s1.meta.acc[spaar.id], 1000);
  const s2 = stampChanges(s1, { ...s1, months: { '2026-01': { values: { [spaar.id]: 100 }, deposits: {}, note: '' } } }, 2000);
  assert.equal(s2.meta.mon['2026-01'], 2000);
  const s3 = stampChanges(s2, { ...s2, months: {} }, 3000);
  assert.equal(s3.meta.del['m:2026-01'], 3000);
  assert.equal(s3.meta.mon['2026-01'], undefined);
});

test('samenvoegen: losse wijzigingen, verwijderingen en conflicten', () => {
  const spaar = makeAccount('Spaar', 'spaar');
  const s1 = stampChanges(emptyState(), { ...emptyState(), accounts: [spaar] }, 1000);
  const base = stampChanges(s1, { ...s1, months: { '2026-01': { values: { [spaar.id]: 100 }, deposits: {}, note: '' } } }, 2000);
  const withMonth = (s, m, v, t) => stampChanges(s, { ...s, months: { ...s.months, [m]: { values: { [spaar.id]: v }, deposits: {}, note: '' } } }, t);

  const a = withMonth(base, '2026-02', 200, 4000);
  const b = withMonth(base, '2026-03', 300, 4500);
  const m1 = mergeStates(a, b, base.meta);
  assert.deepEqual(Object.keys(m1.state.months).sort(), ['2026-01', '2026-02', '2026-03']);
  assert.equal(m1.conflicts.length, 0);

  const del = stampChanges(base, { ...base, months: {} }, 5000);
  assert.equal(mergeStates(del, base, base.meta).state.months['2026-01'], undefined);
  assert.equal(mergeStates(base, del, base.meta).state.months['2026-01'], undefined);

  const cA = withMonth(base, '2026-01', 111, 6000);
  const cB = withMonth(base, '2026-01', 222, 7000);
  const m4 = mergeStates(cA, cB, base.meta);
  assert.equal(m4.conflicts.length, 1);
  assert.equal(m4.state.months['2026-01'].values[spaar.id], 222);
  const fixed = stampChanges(m4.state, applyConflictChoice(m4.state, m4.conflicts[0], 'local'), 8000);
  assert.equal(fixed.months['2026-01'].values[spaar.id], 111);

  assert.equal(fingerprint(mergeStates(cB, cB, cB.meta).state), fingerprint(cB));
  assert.equal(mergeStates(emptyState(), cB, null).state.months['2026-01'].values[spaar.id], 222);
});

test('instellingen: gedeelde nieuwste wint, apparaat-instellingen blijven lokaal', () => {
  const base = emptyState();
  const a = stampChanges(base, { ...base, settings: { ...base.settings, theme: 'dark', monthlyExpenses: 1000 } }, 9000);
  const b = stampChanges(base, { ...base, settings: { ...base.settings, theme: 'light', monthlyExpenses: 2000 } }, 9500);
  const m = mergeStates(a, b, base.meta);
  assert.equal(m.state.settings.monthlyExpenses, 2000);
  assert.equal(m.state.settings.theme, 'dark');
});

test('oude back-ups (zonder meta en nieuwe instellingen) laden', () => {
  const r = normalizeState({ accounts: [{ id: 'x', name: 'A', type: 'spaar' }], months: {}, settings: { theme: 'light', lastExport: null } });
  assert.equal(r.settings.projection.returnPct, 5);
  assert.equal(r.settings.fiRate, 4);
  assert.deepEqual(r.settings.reminder, { day: 1, time: '19:00' });
  assert.equal(r.accounts[0].box3, 'auto');
  assert.deepEqual(r.meta.acc, {});
});

// ---------- Box 3 ----------
test('box 3-soort per rekeningtype', () => {
  assert.equal(box3Class(makeAccount('x', 'spaar')), 'bank');
  assert.equal(box3Class(makeAccount('x', 'beleggen')), 'overig');
  assert.equal(box3Class(makeAccount('x', 'hypotheek')), null);
  assert.equal(box3Class(makeAccount('x', 'studieschuld')), 'schuld');
  assert.equal(box3Class({ ...makeAccount('x', 'vastgoed'), box3: 'ja' }), 'overig');
});

test('box 3-berekening 2026', () => {
  const st = emptyState();
  const b = makeAccount('Bank', 'spaar');
  const i = makeAccount('IBKR', 'beleggen');
  const d = makeAccount('DUO', 'studieschuld');
  const h = makeAccount('Hyp', 'hypotheek');
  st.accounts = [b, i, d, h];
  month(st, '2025-12', { [b.id]: 50000, [i.id]: 100000, [d.id]: 13800, [h.id]: 300000 });
  const r = computeBox3(st, 2026, false);
  assert.equal(r.schuld, 10000); // 13.800 min drempel 3.800
  assert.ok(Math.abs(r.rendement - (640 + 6000 - 270)) < 1e-6);
  const expected = (140000 - 59357) * ((640 + 6000 - 270) / 140000) * 0.36;
  assert.ok(Math.abs(r.belasting - expected) < 1e-6);
  assert.equal(computeBox3(st, 2026, true).hvv, 118714);
  assert.deepEqual(box3Years(st), [2026]);
  month(st, '2026-12', st.months['2025-12'].values);
  assert.equal(computeBox3(st, 2027, false).params.estimated, true);
});

// ---------- analyses ----------
function etfState() {
  const st = emptyState();
  const a = makeAccount('ETF', 'beleggen');
  st.accounts = [a];
  let v = 1000;
  for (let k = 0; k <= 24; k++) {
    const m = `${2024 + Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
    month(st, m, { [a.id]: v }, k ? { [a.id]: 100 } : {});
    v = v * 1.01 + 100;
  }
  return { st, a };
}

test('jaarrendement (IRR) per rekening', () => {
  const { st } = etfState();
  const p = accountPerformance(st)[0];
  assert.ok(Math.abs(p.annual - (Math.pow(1.01, 12) - 1)) < 1e-4);
  assert.equal(p.deposited, 1000 + 24 * 100);
});

test('verloop per rekening met cumulatieve inleg', () => {
  const { st, a } = etfState();
  const s = accountSeries(st, a.id);
  assert.equal(s.length, 25);
  assert.equal(s[0].cumDeposit, 1000);
  assert.equal(s[24].cumDeposit, 1000 + 2400);
});

test('jaaroverzicht telt op tot de totale groei', () => {
  const { st } = etfState();
  const rows = buildSeries(st);
  const ys = yearSummary(rows, null, 3000);
  assert.equal(ys.length, 3);
  assert.ok(Math.abs(ys.reduce((s, y) => s + y.delta, 0) - (rows.at(-1).net - rows[0].net)) < 1e-6);
  assert.ok(Math.abs(ys[1].saving - 1200) < 1e-6);
});

test('prognose en benodigde inleg zijn consistent', () => {
  const last = { month: '2026-01', net: 10000, beleggingen: 10000, pensioen: 0 };
  const opts = { saving: 500, investing: 500, returnPct: 6 };
  const goal = project(last, { ...opts, months: 120 })[119].projected;
  assert.ok(Math.abs(requiredInvesting(last, opts, goal, 120) - 500) < 1e-6);
});

test('noodbuffer, verdeling, woning en FI-getal', () => {
  const st = emptyState();
  const b = makeAccount('Bank', 'betaal');
  const s = makeAccount('Spaar', 'spaar');
  const i = makeAccount('ETF', 'beleggen');
  const w = makeAccount('Huis', 'vastgoed');
  const h = makeAccount('Hyp', 'hypotheek');
  st.accounts = [b, s, i, w, h];
  month(st, '2026-08', { [b.id]: 2000, [s.id]: 8000, [i.id]: 30000, [w.id]: 400000, [h.id]: 300000 });
  const f = snapshotFigures(st);
  assert.equal(f.cash, 10000);
  assert.equal(f.invest, 30000);
  assert.equal(f.equity, 100000);
  assert.equal(f.ltv, 0.75);
  assert.equal(f.investShare, 0.75);
  assert.equal(rebalanceAmount(f, 80), 2000); // 80% van 40k = 32k beleggen
  assert.equal(fiNumber(2500, 4), 750000);
  assert.equal(fiNumber(null, 4), null);
});

// ---------- invoer ----------
test('typefout-controle', () => {
  assert.match(suspicious(125000, 12500), /10× hoger/);
  assert.match(suspicious(1250, 12500), /10× lager/);
  assert.equal(suspicious(13000, 12500), null);
  assert.equal(suspicious(0, 12500), null); // opgeheven
  assert.equal(suspicious(500, 20), null); // kleine bedragen
  assert.equal(suspicious(100, null), null);
});

test('bedragen invoeren in Nederlandse notatie', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('€ 1.234'), 1234);
  assert.equal(parseAmount('1234.56'), 1234.56);
  assert.equal(parseAmount('-500'), -500);
  assert.equal(parseAmount('abc'), null);
});

// ---------- inflatie ----------
test('inflatiecorrectie', () => {
  const cpi = { series: { '2024-01': 100, '2025-01': 104 }, first: '2024-01', latest: '2025-01' };
  assert.ok(Math.abs(inflationFactor(cpi, '2024-01', '2025-06') - 1.04) < 1e-9);
  const row = (m, v) => ({ month: m, net: v, cash: v, beleggingen: 0, pensioen: 0, bezit: 0, schulden: 0, debtsNeg: 0, assets: v, debts: 0, trackedValue: 0, deposit: 0, ret: 0 });
  const d = deflateRows([row('2024-01', 1000), row('2025-01', 1040)], cpi);
  assert.ok(Math.abs(d[1].delta) < 1e-9); // 4% nominaal = 0% reëel
});

// ---------- versleuteling ----------
test('versleutelen en verkeerd wachtwoord', async () => {
  const kdf = { ...newKdf(), iterations: 1000 };
  const key = await deriveKey('geheim123', kdf.salt, kdf.iterations);
  const env = await encryptJson(key, demoState(), kdf);
  assert.equal((await decryptJson(key, env)).accounts.length, 8);
  const wrong = await deriveKey('fout', kdf.salt, kdf.iterations);
  await assert.rejects(decryptJson(wrong, env));
});

// ---------- agenda ----------
test('agendaherinnering (.ics)', () => {
  const ics = reminderIcs({ day: 3, time: '20:30', url: 'https://example.netlify.app/' });
  assert.match(ics, /RRULE:FREQ=MONTHLY;BYMONTHDAY=3/);
  assert.match(ics, /DTSTART;TZID=Europe\/Amsterdam:\d{8}T203000/);
  assert.match(ics, /DTEND;TZID=Europe\/Amsterdam:\d{8}T204500/);
  assert.match(ics, /URL:https:\/\/example.netlify.app\//);
  assert.ok(ics.includes('\r\n'));
});

test('voorbeelddata door alle analyses', () => {
  const st = demoState();
  const rows = buildSeries(st);
  assert.equal(accountPerformance(st).length, 1);
  assert.ok(yearSummary(rows, null, null).length >= 5);
  assert.ok(snapshotFigures(st).hasHome);
});

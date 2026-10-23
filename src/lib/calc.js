import { CATEGORIES, catOf, isDebt } from './model.js';
import { addMonths } from './format.js';

// Bouwt per ingevulde maand een rij met totalen.
//
// Inleg vs rendement (alleen rekeningen met track = true):
//   rendement_maand = waarde_nu − waarde_vorige_snapshot − inleg_maand
//   De eerste keer dat een rekening een waarde heeft, telt die waarde als
//   "beginwaarde" (onderdeel van de inleg), niet als rendement.
//
// Groeisplitsing van het netto vermogen:
//   Δ netto = rendement + overig (sparen, aflossen, waardeverandering bezit, nieuwe rekeningen)
export function buildSeries(state, { liquidOnly = false } = {}) {
  const accounts = state.accounts.filter((a) => !liquidOnly || a.liquid);
  const monthKeys = Object.keys(state.months).sort();
  const rows = [];
  let prevSnap = null;
  let prevRow = null;
  let cumDeposit = 0;
  let cumReturn = 0;

  for (const m of monthKeys) {
    const snap = state.months[m];
    const cats = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
    let assets = 0;
    let debts = 0;
    let deposit = 0; // netto inleg deze maand (incl. beginwaarden van nieuwe rekeningen)
    let ret = 0;
    let trackedValue = 0;
    let hasTracked = false;

    for (const a of accounts) {
      const v = snap.values[a.id];
      if (v == null) continue;
      if (isDebt(a)) {
        debts += v;
        cats.schulden += v;
      } else {
        assets += v;
        cats[catOf(a)] += v;
      }
      if (a.track && !isDebt(a)) {
        hasTracked = true;
        trackedValue += v;
        const pv = prevSnap ? prevSnap.values[a.id] : undefined;
        const d = snap.deposits?.[a.id] || 0;
        if (pv == null) {
          deposit += v; // beginwaarde
        } else {
          deposit += d;
          ret += v - pv - d;
        }
      }
    }

    cumDeposit += deposit;
    cumReturn += ret;
    const net = assets - debts;
    const delta = prevRow ? net - prevRow.net : null;

    const row = {
      month: m,
      note: snap.note || '',
      ...cats,
      debtsNeg: -debts,
      assets,
      debts,
      net,
      delta,
      deltaPct: prevRow && prevRow.net > 0 ? delta / prevRow.net : null,
      ret: prevRow ? ret : 0,
      other: delta != null ? delta - ret : null,
      deposit,
      cumDeposit,
      cumReturn,
      trackedValue,
      hasTracked,
    };
    rows.push(row);
    prevSnap = snap;
    prevRow = row;
  }
  return rows;
}

export function filterRange(rows, range) {
  if (!rows.length || range === 'all') return rows;
  const months = range === '1y' ? 12 : range === '5y' ? 60 : 36;
  const last = rows[rows.length - 1].month;
  const from = addMonths(last, -(months - 1));
  return rows.filter((r) => r.month >= from);
}

// Vergelijking met (zo dicht mogelijk bij) 12 maanden eerder
export function yearAgo(rows) {
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const target = addMonths(last.month, -12);
  let best = null;
  for (const r of rows) if (r.month <= target) best = r;
  return best;
}

// Groei opgesplitst per maand, of per jaar bij lange periodes
export function growthBuckets(rows) {
  const withDelta = rows.filter((r) => r.delta != null);
  if (withDelta.length <= 24) {
    return withDelta.map((r) => ({ key: r.month, ret: r.ret, other: r.other, delta: r.delta, byYear: false }));
  }
  const map = new Map();
  for (const r of withDelta) {
    const y = r.month.slice(0, 4);
    const b = map.get(y) || { key: y, ret: 0, other: 0, delta: 0, byYear: true };
    b.ret += r.ret;
    b.other += r.other;
    b.delta += r.delta;
    map.set(y, b);
  }
  return [...map.values()];
}

// Totalen voor inleg en rendement binnen een periode (rijen), plus dit kalenderjaar
export function periodTotals(rows) {
  const s = { ret: 0, other: 0, delta: 0 };
  for (const r of rows) {
    if (r.delta == null) continue;
    s.ret += r.ret;
    s.other += r.other;
    s.delta += r.delta;
  }
  return s;
}

// Waarschijnlijke typefout bij invoer: 8× of meer hoger/lager dan de vorige stand.
// Pas vanaf een vorige stand van € 50; € 0 (rekening opgeheven) is geen typefout.
const SUSPICIOUS_FACTOR = 8;
export function suspicious(v, pv) {
  if (v == null || pv == null || v === 0 || Math.abs(pv) < 50) return null;
  const ratio = Math.abs(v) / Math.abs(pv);
  if (ratio >= SUSPICIOUS_FACTOR) return `${Math.round(ratio)}× hoger dan vorige stand`;
  if (ratio <= 1 / SUSPICIOUS_FACTOR) return `${Math.round(1 / ratio)}× lager dan vorige stand`;
  return null;
}

// Waarde van het vorige snapshot vóór maand m (voor vooringevulde invoer)
export function previousMonthKey(state, m) {
  const keys = Object.keys(state.months).filter((k) => k < m).sort();
  return keys.length ? keys[keys.length - 1] : null;
}

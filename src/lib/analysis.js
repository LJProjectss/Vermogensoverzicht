import { isDebt } from './model.js';
import { addMonths } from './format.js';
import { inflationFactor } from './cbs.js';

// Interne rentevoet per maand voor een reeks kasstromen (bisectie; robuust en snel genoeg).
// flows: array van bedragen per maand (negatief = inleg, positief = waarde aan het eind).
function irrMonthly(flows) {
  const npv = (r) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, i), 0);
  let lo = -0.99;
  let hi = 1;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

// Rendement per rekening met "rendement volgen": inleg, waarde, rendement en jaarrendement (IRR).
export function accountPerformance(state) {
  const monthKeys = Object.keys(state.months).sort();
  const out = [];
  for (const a of state.accounts) {
    if (!a.track || isDebt(a)) continue;
    const present = monthKeys.filter((m) => state.months[m].values[a.id] != null);
    if (!present.length) continue;
    const first = present[0];
    const last = present[present.length - 1];
    const span = monthsBetween(first, last);
    const flows = new Array(span + 1).fill(0);
    flows[0] -= state.months[first].values[a.id];
    let deposited = state.months[first].values[a.id];
    for (const m of present.slice(1)) {
      const d = state.months[m].deposits?.[a.id] || 0;
      flows[monthsBetween(first, m)] -= d;
      deposited += d;
    }
    const value = state.months[last].values[a.id];
    flows[span] += value;
    const r = span >= 3 ? irrMonthly(flows) : null;
    out.push({
      id: a.id,
      name: a.name,
      archived: a.archived,
      first,
      last,
      deposited,
      value,
      ret: value - deposited,
      annual: r == null ? null : Math.pow(1 + r, 12) - 1,
    });
  }
  return out;
}

export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

// Geschat spaarbedrag in een maand: groei min rendement, min waardeverandering van bezit
// (woning, auto) en pensioen. Wat overblijft is wat je zelf hebt gespaard en afgelost.
function savingOf(row, prev) {
  if (!prev || row.delta == null) return null;
  return row.delta - row.ret - (row.bezit - prev.bezit) - (row.pensioen - prev.pensioen);
}

// Jaaroverzicht op basis van de maandrijen (rows uit buildSeries).
export function yearSummary(rows, cpi, income) {
  const years = new Map();
  rows.forEach((r, i) => {
    const y = r.month.slice(0, 4);
    const prev = i > 0 ? rows[i - 1] : null;
    let b = years.get(y);
    if (!b) {
      b = { year: y, startRow: prev || r, startIsPrevYear: !!prev, endRow: r, ret: 0, saving: 0, valueChange: 0, deposit: 0, months: 0 };
      years.set(y, b);
    }
    b.endRow = r;
    b.months++;
    if (r.delta != null) {
      b.ret += r.ret;
      b.deposit += r.deposit;
      const s = savingOf(r, prev);
      b.saving += s;
      b.valueChange += r.delta - r.ret - s;
    }
  });
  return [...years.values()].map((b) => {
    const start = b.startRow.net;
    const end = b.endRow.net;
    const delta = end - start;
    let real = null;
    if (cpi) {
      const f = inflationFactor(cpi, b.startRow.month, b.endRow.month);
      real = end - start * f;
    }
    return {
      year: b.year,
      start,
      startMonth: b.startRow.month,
      end,
      endMonth: b.endRow.month,
      delta,
      pct: start > 0 ? delta / start : null,
      ret: b.ret,
      saving: b.saving,
      valueChange: b.valueChange,
      deposit: b.deposit,
      real,
      realPct: real != null && start > 0 ? real / start : null,
      savingRate: income > 0 ? b.saving / (income * b.months) : null,
      months: b.months,
    };
  });
}

// Gemiddelden over de laatste 12 maanden, als startwaarden voor de prognose.
export function recentAverages(state, rows) {
  const recent = rows.slice(-13);
  let saving = 0;
  let n = 0;
  for (let i = 1; i < recent.length; i++) {
    const s = savingOf(recent[i], recent[i - 1]);
    if (s != null) { saving += s; n++; }
  }
  let investing = 0;
  const monthsSet = recent.slice(1).map((r) => r.month);
  for (const m of monthsSet) {
    for (const [id, d] of Object.entries(state.months[m]?.deposits || {})) {
      const a = state.accounts.find((x) => x.id === id);
      if (a && a.track && !isDebt(a)) investing += d;
    }
  }
  return {
    saving: n ? saving / n : 0,
    investing: monthsSet.length ? investing / monthsSet.length : 0,
  };
}

// Prognose: beleggingen en pensioen groeien met het verwachte rendement; maandelijkse inleg gaat
// naar beleggingen, het overige spaarbedrag naar cash/aflossen (zonder rendement).
// Woning en overig bezit blijven gelijk.
export function project(lastRow, { saving, investing, returnPct, months }) {
  const rm = Math.pow(1 + (returnPct || 0) / 100, 1 / 12) - 1;
  let growing = (lastRow.beleggingen || 0) + (lastRow.pensioen || 0);
  let rest = lastRow.net - growing;
  const extra = Math.max(0, (saving || 0) - (investing || 0));
  const points = [];
  for (let i = 1; i <= months; i++) {
    growing = growing * (1 + rm) + (investing || 0);
    rest += extra;
    points.push({ month: addMonths(lastRow.month, i), projected: growing + rest });
  }
  return points;
}

// Verloop van één rekening: waarde per ingevulde maand, plus cumulatieve inleg bij "rendement volgen".
export function accountSeries(state, id) {
  const acc = state.accounts.find((a) => a.id === id);
  if (!acc) return [];
  const tracked = acc.track && !isDebt(acc);
  let cum = null;
  const out = [];
  for (const m of Object.keys(state.months).sort()) {
    const snap = state.months[m];
    const v = snap.values[id];
    if (v == null) continue;
    if (tracked) cum = cum == null ? v : cum + (snap.deposits?.[id] || 0);
    out.push({ month: m, value: v, cumDeposit: tracked ? cum : null });
  }
  return out;
}

// Kerncijfers van de laatst ingevulde maand: buffer, verdeling en woning.
export function snapshotFigures(state) {
  const keys = Object.keys(state.months).sort();
  if (!keys.length) return null;
  const month = keys[keys.length - 1];
  const snap = state.months[month];
  const f = { month, cash: 0, invest: 0, home: 0, mortgage: 0, hasHome: false, hasMortgage: false };
  for (const a of state.accounts) {
    const v = snap.values[a.id];
    if (v == null) continue;
    const t = a.type;
    if (t === 'betaal' || t === 'spaar') f.cash += v;
    if (t === 'beleggen' || t === 'crypto') f.invest += v;
    if (t === 'vastgoed') { f.home += v; f.hasHome = true; }
    if (t === 'hypotheek') { f.mortgage += v; f.hasMortgage = true; }
  }
  f.equity = f.home - f.mortgage;
  f.ltv = f.home > 0 ? f.mortgage / f.home : null;
  const pot = f.cash + f.invest;
  f.investShare = pot > 0 ? f.invest / pot : null;
  return f;
}

// Hoeveel moet er van cash naar beleggingen (positief) of andersom (negatief) voor de gewenste verdeling
export function rebalanceAmount(f, targetPct) {
  const pot = f.cash + f.invest;
  return pot * (targetPct / 100) - f.invest;
}

// FI-getal: benodigd vermogen om van de opbrengst te leven (uitgaven per jaar / opnamepercentage)
export function fiNumber(monthlyExpenses, ratePct) {
  if (!(monthlyExpenses > 0) || !(ratePct > 0)) return null;
  return (monthlyExpenses * 12) / (ratePct / 100);
}

// Benodigde maandelijkse inleg (bovenop het overige sparen) om doel te halen in n maanden.
export function requiredInvesting(lastRow, { saving, investing, returnPct }, goal, n) {
  if (n <= 0) return null;
  const rm = Math.pow(1 + (returnPct || 0) / 100, 1 / 12) - 1;
  const growing = (lastRow.beleggingen || 0) + (lastRow.pensioen || 0);
  const rest = lastRow.net - growing;
  const extra = Math.max(0, (saving || 0) - (investing || 0));
  const g = Math.pow(1 + rm, n);
  const need = goal - rest - extra * n - growing * g;
  const annuity = rm === 0 ? n : (g - 1) / rm;
  return need / annuity;
}

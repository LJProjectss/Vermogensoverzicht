import { box3Class } from './model.js';

// Box 3-indicatie volgens de overbruggingswetgeving (forfaitaire rendementen per vermogenssoort).
// Bron: Belastingdienst, "Hoe wordt het box 3-inkomen berekend" (2023-2025) en Belastingplan 2026.
// Jaarlijks bijwerken: voeg een regel toe zodra de percentages voor een nieuw jaar bekend zijn.
export const BOX3_PARAMS = {
  2023: { bank: 0.0092, overig: 0.0617, schuld: 0.0246, hvv: 57000, drempel: 3400, tarief: 0.32, status: 'definitief' },
  2024: { bank: 0.0144, overig: 0.0604, schuld: 0.0261, hvv: 57000, drempel: 3700, tarief: 0.36, status: 'definitief' },
  2025: { bank: 0.0137, overig: 0.0588, schuld: 0.0270, hvv: 57684, drempel: 3800, tarief: 0.36, status: 'definitief' },
  2026: { bank: 0.0128, overig: 0.0600, schuld: 0.0270, hvv: 59357, drempel: 3800, tarief: 0.36, status: 'voorlopig (bank en schulden)' },
};

export const BOX3_YEARS = Object.keys(BOX3_PARAMS).map(Number);
const LAST_YEAR = Math.max(...BOX3_YEARS);

export function paramsFor(year) {
  if (BOX3_PARAMS[year]) return { ...BOX3_PARAMS[year], year, estimated: false };
  return { ...BOX3_PARAMS[LAST_YEAR], year: LAST_YEAR, estimated: true };
}

// Peildatum is 1 januari: de stand van december van het jaar ervoor, anders januari zelf.
export function peilMonth(state, year) {
  const dec = `${year - 1}-12`;
  const jan = `${year}-01`;
  if (state.months[dec]) return dec;
  if (state.months[jan]) return jan;
  return null;
}

// Jaren waarvoor een peildatum beschikbaar is
export function box3Years(state) {
  const years = new Set();
  for (const m of Object.keys(state.months)) {
    const [y, mo] = m.split('-').map(Number);
    if (mo === 12) years.add(y + 1);
    if (mo === 1) years.add(y);
  }
  return [...years].filter((y) => y >= 2023).sort((a, b) => b - a);
}

export function computeBox3(state, year, partner) {
  const month = peilMonth(state, year);
  if (!month) return null;
  const p = paramsFor(year);
  const snap = state.months[month];
  const lines = { bank: [], overig: [], schuld: [] };
  for (const a of state.accounts) {
    const v = snap.values[a.id];
    if (v == null || v === 0) continue;
    const cls = box3Class(a);
    if (cls) lines[cls].push({ name: a.name, value: v });
  }
  const sum = (arr) => arr.reduce((s, l) => s + l.value, 0);
  const bank = Math.max(0, sum(lines.bank));
  const overig = Math.max(0, sum(lines.overig));
  const schuldBruto = Math.max(0, sum(lines.schuld));
  const drempel = p.drempel * (partner ? 2 : 1);
  const schuld = Math.max(0, schuldBruto - drempel);
  const hvv = p.hvv * (partner ? 2 : 1);

  const rendement = bank * p.bank + overig * p.overig - schuld * p.schuld;
  const grondslagRendement = bank + overig - schuld; // rendementsgrondslag
  const grondslag = Math.max(0, grondslagRendement - hvv); // grondslag sparen en beleggen
  const pct = grondslagRendement > 0 ? Math.max(0, rendement / grondslagRendement) : 0;
  const voordeel = grondslag * pct;
  const belasting = voordeel * p.tarief;

  return { year, month, params: p, partner, lines, bank, overig, schuldBruto, drempel, schuld, hvv, rendement, grondslagRendement, grondslag, pct, voordeel, belasting };
}

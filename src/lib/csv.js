import { TYPES, makeAccount } from './model.js';
import { parseAmount } from './format.js';

const SEP = ';';

const q = (s) => {
  const str = String(s ?? '');
  return /[";\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};
const n = (v) => (v == null ? '' : String(v).replace('.', ','));

// Lang formaat: één regel per rekening per maand. Opent direct goed in Nederlandse Excel.
export function toCsv(state) {
  const lines = [['maand', 'rekening', 'type', 'waarde', 'inleg', 'notitie'].join(SEP)];
  const byId = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  for (const m of Object.keys(state.months).sort()) {
    const snap = state.months[m];
    let first = true;
    for (const [id, v] of Object.entries(snap.values)) {
      const a = byId[id];
      if (!a) continue;
      lines.push(
        [m, q(a.name), a.type, n(v), n(snap.deposits?.[id]), first ? q(snap.note) : ''].join(SEP)
      );
      first = false;
    }
  }
  return '﻿' + lines.join('\r\n');
}

function parseCsvText(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Voegt CSV-regels samen met de bestaande state. Rekeningen worden op naam gekoppeld
// en aangemaakt als ze nog niet bestaan. Geeft { state, stats } terug.
export function mergeCsv(state, text) {
  const rows = parseCsvText(text);
  if (!rows.length) throw new Error('Het bestand is leeg.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (names) => header.findIndex((h) => names.includes(h));
  const iM = col(['maand', 'month', 'datum']);
  const iA = col(['rekening', 'account', 'naam', 'post']);
  const iT = col(['type']);
  const iV = col(['waarde', 'value', 'saldo', 'bedrag']);
  const iD = col(['inleg', 'storting', 'deposit']);
  const iN = col(['notitie', 'note', 'opmerking']);
  if (iM < 0 || iA < 0 || iV < 0) {
    throw new Error('Kolommen "maand", "rekening" en "waarde" zijn verplicht.');
  }

  const next = structuredClone(state);
  const byName = new Map(next.accounts.map((a) => [a.name.toLowerCase(), a]));
  const stats = { rows: 0, newAccounts: 0, months: new Set(), skipped: 0 };

  for (const r of rows.slice(1)) {
    let m = (r[iM] || '').trim();
    // Accepteer ook 2024-3, 03-2024, 2024-03-01
    let mm = m.match(/^(\d{4})-(\d{1,2})/);
    if (!mm) { const alt = m.match(/^(\d{1,2})[-/](\d{4})$/); if (alt) mm = [null, alt[2], alt[1]]; }
    const name = (r[iA] || '').trim();
    const value = parseAmount(r[iV]);
    if (!mm || !name || value == null) { stats.skipped++; continue; }
    m = `${mm[1]}-${String(+mm[2]).padStart(2, '0')}`;

    let acc = byName.get(name.toLowerCase());
    if (!acc) {
      const t = iT >= 0 && TYPES[(r[iT] || '').trim()] ? r[iT].trim() : 'bezit_overig';
      acc = makeAccount(name, t);
      next.accounts.push(acc);
      byName.set(name.toLowerCase(), acc);
      stats.newAccounts++;
    }
    const snap = next.months[m] || (next.months[m] = { values: {}, deposits: {}, note: '' });
    snap.values[acc.id] = value;
    const dep = iD >= 0 ? parseAmount(r[iD]) : null;
    if (dep) snap.deposits[acc.id] = dep;
    const note = iN >= 0 ? (r[iN] || '').trim() : '';
    if (note) snap.note = note;
    stats.rows++;
    stats.months.add(m);
  }
  return { state: next, stats: { ...stats, months: stats.months.size } };
}

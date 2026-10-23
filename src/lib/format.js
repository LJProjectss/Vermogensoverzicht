const eur0 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num2 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const pct1 = new Intl.NumberFormat('nl-NL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Privacymodus: bedragen worden gemaskeerd (percentages blijven zichtbaar)
let hidden = false;
export const setPrivacy = (on) => { hidden = !!on; };
const MASK = '€ •••••';

export const fmtEur = (v) => (v == null || !Number.isFinite(v) ? '—' : hidden ? MASK : eur0.format(v));
export const fmtEur2 = (v) => (v == null || !Number.isFinite(v) ? '—' : hidden ? MASK : eur2.format(v));
export const fmtNum = (v) => (v == null || !Number.isFinite(v) ? '' : num2.format(v));

export const fmtSigned = (v) => {
  if (v == null || !Number.isFinite(v)) return '—';
  if (hidden) return MASK;
  const s = eur0.format(Math.abs(v));
  if (Math.round(v) === 0) return s;
  return (v > 0 ? '+' : '−') + s;
};

export const fmtPct = (v) => {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = pct1.format(Math.abs(v));
  return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
};

// Compacte as-labels: € 12k, € 1,2 mln
export const fmtCompact = (v) => {
  if (!Number.isFinite(v)) return '';
  if (hidden) return '€ •••';
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}€ ${(a / 1e6).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} mln`;
  if (a >= 1e3) return `${sign}€ ${(a / 1e3).toLocaleString('nl-NL', { maximumFractionDigits: a >= 1e5 ? 0 : 1 })}k`;
  return `${sign}€ ${Math.round(a)}`;
};

const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

export const monthShort = (m) => {
  const [y, mo] = m.split('-');
  return `${MONTHS_SHORT[+mo - 1]} '${y.slice(2)}`;
};
export const monthLong = (m) => {
  const [y, mo] = m.split('-');
  return `${MONTHS_LONG[+mo - 1]} ${y}`;
};

export function currentMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

// Accepteert "1.234,56", "1234,56", "1234.56", "€ 1.234", "-500"
export function parseAmount(input) {
  if (input == null) return null;
  let s = String(input).trim().replace(/[€\s]/g, '').replace(/−/g, '-');
  if (s === '' || s === '-') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

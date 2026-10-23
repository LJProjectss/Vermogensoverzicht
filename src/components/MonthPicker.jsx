import { MONTH_NAMES, currentMonth } from '../lib/format.js';

// Maandkeuze met Nederlandse maandnamen. Het standaard maandveld van de browser toont
// de maand in de taal van het systeem (vaak Engels) en ziet er per browser anders uit.
export default function MonthPicker({ value, onChange, fromYear, toYear }) {
  const [y, m] = value.split('-').map(Number);
  const nowYear = +currentMonth().slice(0, 4);
  const first = Math.min(fromYear ?? nowYear - 10, y);
  const last = Math.max(toYear ?? nowYear + 1, y);
  const years = [];
  for (let j = last; j >= first; j--) years.push(j);
  const set = (year, month) => onChange(`${year}-${String(month).padStart(2, '0')}`);
  return (
    <span className="month-picker">
      <select value={m} onChange={(e) => set(y, +e.target.value)} aria-label="Maand">
        {MONTH_NAMES.map((naam, i) => (
          <option key={naam} value={i + 1}>{naam}</option>
        ))}
      </select>
      <select value={y} onChange={(e) => set(+e.target.value, m)} aria-label="Jaar">
        {years.map((j) => (
          <option key={j} value={j}>{j}</option>
        ))}
      </select>
    </span>
  );
}

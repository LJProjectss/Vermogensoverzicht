import { emptyState, makeAccount } from './model.js';
import { addMonths, currentMonth } from './format.js';

// Genereert ~5 jaar voorbeelddata om de app mee uit te proberen.
export function demoState() {
  const s = emptyState();
  const acc = {
    betaal: makeAccount('Rabobank betaalrekening', 'betaal'),
    spaar: makeAccount('Spaarrekening', 'spaar'),
    ibkr: makeAccount('Interactive Brokers', 'beleggen'),
    pensioen: makeAccount('Pensioen (werkgever)', 'pensioen'),
    woning: makeAccount('Woning', 'vastgoed'),
    auto: makeAccount('Auto', 'voertuig'),
    hypotheek: makeAccount('Hypotheek', 'hypotheek'),
    studie: makeAccount('Studieschuld', 'studieschuld'),
  };
  s.accounts = Object.values(acc);

  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const end = addMonths(currentMonth(), -1);
  const start = addMonths(end, -59);
  let v = { betaal: 2400, spaar: 6000, ibkr: 0, pensioen: 18000, woning: 310000, auto: 16000, hypotheek: 262000, studie: 14000 };

  for (let i = 0; i < 60; i++) {
    const m = addMonths(start, i);
    const month = +m.slice(5);
    const note = [];
    const deposits = {};

    v.betaal = Math.max(800, v.betaal + (rnd() - 0.5) * 900);
    v.spaar += 350 + (rnd() - 0.4) * 150;
    if (month === 5) { v.spaar += 1800; note.push('Vakantiegeld'); }
    if (month === 12) { v.spaar += 2500; note.push('Eindejaarsbonus'); }

    if (i === 6) { deposits.ibkr = 0; v.ibkr = 5000; v.spaar -= 5000; note.push('Start met beleggen'); }
    else if (i > 6) {
      const inleg = i === 30 ? 4000 : 400;
      if (i === 30) { v.spaar -= 3600; note.push('Extra inleg IBKR'); }
      const marketRet = 0.008 + (rnd() - 0.5) * 0.05 + (i >= 20 && i <= 22 ? -0.035 : 0);
      v.ibkr = v.ibkr * (1 + marketRet) + inleg;
      deposits.ibkr = inleg;
    }

    v.pensioen = v.pensioen * (1 + 0.004 + (rnd() - 0.5) * 0.02) + 290;
    if (month === 1) v.woning *= 1 + 0.03 + rnd() * 0.05;
    v.auto = Math.max(4000, v.auto - 180);
    v.hypotheek -= 520;
    v.studie = Math.max(0, v.studie - 170);
    if (i === 41) { v.auto = 21000; v.spaar -= 9000; note.push('Auto ingeruild'); }

    const values = {};
    for (const [k, a] of Object.entries(acc)) {
      if (k === 'ibkr' && i < 6) continue;
      values[a.id] = Math.round(v[k] * 100) / 100;
    }
    s.months[m] = { values, deposits: Object.fromEntries(Object.entries(deposits).filter(([k]) => values[acc[k].id] != null).map(([k, d]) => [acc[k].id, d])), note: note.join(', ') };
  }
  return s;
}

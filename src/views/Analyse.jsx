import { useEffect, useMemo, useState } from 'react';
import { buildSeries } from '../lib/calc.js';
import { Printer } from 'lucide-react';
import {
  accountPerformance, accountSeries, fiNumber, monthsBetween, project, rebalanceAmount, recentAverages, requiredInvesting,
  snapshotFigures, yearSummary,
} from '../lib/analysis.js';
import { CATEGORIES, catOf, isDebt } from '../lib/model.js';
import { BOX3_PARAMS, box3Years, computeBox3 } from '../lib/box3.js';
import { useCpi } from '../lib/cbs.js';
import { addMonths, currentMonth, fmtEur, fmtNum, fmtPct, fmtSigned, monthLong, parseAmount } from '../lib/format.js';
import { AccountChart, ProjectionChart } from '../components/charts.jsx';

// Bedragveld dat pas bij verlaten (of Enter) opslaat; leeg = null
function AmountField({ value, onCommit, placeholder, suffix = '€', ariaLabel }) {
  const [text, setText] = useState(value == null ? '' : fmtNum(value));
  useEffect(() => setText(value == null ? '' : fmtNum(value)), [value]);
  const commit = () => {
    const n = text.trim() === '' ? null : parseAmount(text);
    if (n === null && text.trim() !== '') { setText(value == null ? '' : fmtNum(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <div className="money">
      <span>{suffix}</span>
      <input
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  );
}

export default function Analyse({ state, setSettings, chart, goTab }) {
  const rows = useMemo(() => buildSeries(state), [state]);
  const { cpi } = useCpi(true);

  if (rows.length < 2) {
    return (
      <div className="stack">
        <div className="page-head"><h1>Analyse</h1></div>
        <div className="empty card">
          <h2>Nog te weinig gegevens</h2>
          <p>Vul minstens twee maanden in om je jaaroverzicht, rendement, prognose en Box 3-indicatie te zien.</p>
          <button className="primary" onClick={() => goTab('invoer')}>Maand invullen</button>
        </div>
      </div>
    );
  }

  const printedOn = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Analyse</h1>
        <button className="no-print" onClick={() => window.print()}>
          <Printer size={16} /> Afdrukken / PDF
        </button>
        <p className="print-only muted small">Vermogensoverzicht · jaarrapport · afgedrukt op {printedOn}</p>
      </div>
      <YearOverview rows={rows} cpi={cpi} state={state} setSettings={setSettings} />
      <AccountReturns state={state} />
      <AccountHistory state={state} chart={chart} />
      <BufferAllocation state={state} setSettings={setSettings} />
      <HomeSection state={state} />
      <GoalProjection rows={rows} state={state} setSettings={setSettings} chart={chart} />
      <FinancialIndependence state={state} setSettings={setSettings} />
      <Box3Section state={state} setSettings={setSettings} goTab={goTab} />
    </div>
  );
}

// Startwaarden voor prognoses: eigen instellingen, anders het gemiddelde van de laatste 12 maanden
function projectionOptions(state, rows) {
  const avg = recentAverages(state, rows);
  const p = state.settings.projection;
  return {
    avg,
    opts: {
      saving: p.saving ?? Math.round(avg.saving),
      investing: p.investing ?? Math.round(avg.investing),
      returnPct: p.returnPct ?? 5,
    },
  };
}

function AccountHistory({ state, chart }) {
  const options = state.accounts.filter((a) => Object.values(state.months).some((m) => m.values[a.id] != null));
  const [picked, setPicked] = useState(null);
  const id = picked && options.some((a) => a.id === picked) ? picked : options[0]?.id;
  const data = useMemo(() => (id ? accountSeries(state, id) : []), [state, id]);
  if (!options.length) return null;
  const acc = options.find((a) => a.id === id);
  const first = data[0];
  const last = data[data.length - 1];
  const debt = isDebt(acc);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Verloop per rekening</h2>
        <select value={id} onChange={(e) => setPicked(e.target.value)} aria-label="Rekening" className="no-print">
          {CATEGORIES.map((c) => {
            const list = options.filter((a) => catOf(a) === c.id);
            return list.length ? (
              <optgroup key={c.id} label={c.label}>
                {list.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (gearchiveerd)' : ''}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <span className="print-only">{acc.name}</span>
      </div>
      <div className="mini-kpis">
        <div><span className="muted small">{debt ? 'Openstaand' : 'Waarde'} {monthLong(last.month)}</span><strong>{fmtEur(last.value)}</strong></div>
        <div><span className="muted small">Sinds {monthLong(first.month)}</span><strong>{fmtSigned(last.value - first.value)}</strong></div>
        {last.cumDeposit != null && (
          <div><span className="muted small">Rendement tot nu</span><strong>{fmtSigned(last.value - last.cumDeposit)}</strong></div>
        )}
      </div>
      <AccountChart data={data} chart={chart} debt={debt} />
    </section>
  );
}

function BufferAllocation({ state, setSettings }) {
  const f = useMemo(() => snapshotFigures(state), [state]);
  if (!f) return null;
  const expenses = state.settings.monthlyExpenses;
  const target = state.settings.targetInvestPct;
  const months = expenses > 0 ? f.cash / expenses : null;
  const level = months == null ? null : months < 3 ? 'down' : months <= 6 ? 'up' : '';
  const move = target != null && f.investShare != null ? rebalanceAmount(f, target) : null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Noodbuffer &amp; verdeling</h2>
        <span className="muted small">stand {monthLong(f.month)}</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="small">Uitgaven per maand <span className="muted">(alles bij elkaar)</span></span>
          <AmountField value={expenses} onCommit={(v) => setSettings({ monthlyExpenses: v })} placeholder="bijv. 2.500" ariaLabel="Uitgaven per maand" />
        </label>
        <label className="field">
          <span className="small">Gewenst aandeel beleggingen <span className="muted">(van cash + beleggingen)</span></span>
          <AmountField value={target} onCommit={(v) => setSettings({ targetInvestPct: v == null ? null : Math.min(100, Math.max(0, v)) })} suffix="%" placeholder="bijv. 70" ariaLabel="Gewenst aandeel beleggingen" />
        </label>
      </div>
      <div className="mini-kpis">
        <div>
          <span className="muted small">Noodbuffer (betaal- en spaarrekeningen)</span>
          <strong className={level || ''}>{months == null ? fmtEur(f.cash) : `${fmtNum(Math.round(months * 10) / 10)} maanden`}</strong>
          <span className="muted small">
            {months == null ? 'Vul je uitgaven in' : months < 3 ? 'Onder het advies van 3–6 maanden' : months <= 6 ? 'Binnen het advies van 3–6 maanden' : 'Ruim boven 6 maanden; overweeg (een deel) te beleggen'}
          </span>
        </div>
        <div>
          <span className="muted small">Verdeling nu</span>
          <strong>{f.investShare == null ? '—' : `${Math.round(f.investShare * 100)}% beleggen · ${Math.round((1 - f.investShare) * 100)}% cash`}</strong>
          <span className="muted small">{fmtEur(f.invest)} beleggen · {fmtEur(f.cash)} cash</span>
        </div>
        {move != null && (
          <div>
            <span className="muted small">Om op {Math.round(target)}% te komen</span>
            <strong>{Math.abs(move) < 100 ? 'Zit goed ✓' : move > 0 ? `${fmtEur(move)} naar beleggen` : `${fmtEur(-move)} naar cash`}</strong>
            {months != null && move > 0 && expenses > 0 && (f.cash - move) / expenses < 3 && (
              <span className="down small">Let op: dan zakt je buffer onder 3 maanden</span>
            )}
          </div>
        )}
      </div>
      <p className="muted small explain">
        Vuistregel van het Nibud: houd 3 tot 6 maanden aan uitgaven direct beschikbaar. Pensioen, woning en overig bezit tellen hier niet mee.
      </p>
    </section>
  );
}

function HomeSection({ state }) {
  const f = useMemo(() => snapshotFigures(state), [state]);
  if (!f || (!f.hasHome && !f.hasMortgage)) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Woning</h2>
        <span className="muted small">stand {monthLong(f.month)}</span>
      </div>
      <div className="mini-kpis">
        <div><span className="muted small">Woningwaarde</span><strong>{fmtEur(f.home)}</strong></div>
        <div><span className="muted small">Hypotheek</span><strong>{fmtEur(f.mortgage)}</strong></div>
        <div>
          <span className="muted small">Overwaarde</span>
          <strong className={f.equity >= 0 ? 'up' : 'down'}>{fmtSigned(f.equity)}</strong>
        </div>
        <div>
          <span className="muted small">Schuld t.o.v. woningwaarde</span>
          <strong>{f.ltv == null ? '—' : `${Math.round(f.ltv * 100)}%`}</strong>
          {f.ltv != null && <span className="muted small">{f.ltv > 1 ? 'onderwaarde' : f.ltv > 0.8 ? 'boven 80%' : 'onder 80%'}</span>}
        </div>
      </div>
      <p className="muted small explain">
        Veel banken geven een lagere rente als je hypotheek onder 80% of 60% van de woningwaarde komt; vraag je bank naar de risicoklassen.
        Werk elk jaar de woningwaarde bij met de nieuwe WOZ-waarde (of een taxatie).
      </p>
    </section>
  );
}

function FinancialIndependence({ state, setSettings }) {
  const liquid = useMemo(() => buildSeries(state, { liquidOnly: true }), [state]);
  const all = useMemo(() => buildSeries(state), [state]);
  const { opts } = projectionOptions(state, all);
  const expenses = state.settings.monthlyExpenses;
  const rate = state.settings.fiRate ?? 4;
  const target = fiNumber(expenses, rate);
  const last = liquid[liquid.length - 1];
  const points = useMemo(
    () => (last && target ? project(last, { ...opts, months: 60 * 12 }) : []),
    [last, target, opts.saving, opts.investing, opts.returnPct] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!last) return null;
  const idx = target ? (last.net >= target ? -1 : points.findIndex((p) => p.projected >= target)) : null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>Financiële onafhankelijkheid</h2>
        <span className="muted small">vrij besteedbaar vermogen</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="small">Uitgaven per maand</span>
          <AmountField value={expenses} onCommit={(v) => setSettings({ monthlyExpenses: v })} placeholder="bijv. 2.500" ariaLabel="Uitgaven per maand (FI)" />
        </label>
        <label className="field">
          <span className="small">Veilig opnamepercentage per jaar</span>
          <AmountField value={rate} onCommit={(v) => setSettings({ fiRate: v && v > 0 ? v : 4 })} suffix="%" placeholder="4" ariaLabel="Opnamepercentage" />
        </label>
      </div>
      {target ? (
        <div className="mini-kpis">
          <div><span className="muted small">Benodigd vermogen (FI-getal)</span><strong>{fmtEur(target)}</strong><span className="muted small">{fmtNum(Math.round(100 / rate * 10) / 10)}× je jaaruitgaven</span></div>
          <div><span className="muted small">Nu vrij besteedbaar</span><strong>{fmtEur(last.net)}</strong><span className="muted small">{fmtPct(Math.max(0, last.net / target)).replace('+', '')} van je FI-getal</span></div>
          <div>
            <span className="muted small">Verwacht bereikt</span>
            <strong>{idx === -1 ? 'Al bereikt 🎉' : idx >= 0 ? monthLong(points[idx].month) : 'Niet binnen 60 jaar'}</strong>
            {idx > 0 && <span className="muted small">over {Math.floor((idx + 1) / 12)} jaar en {(idx + 1) % 12} mnd</span>}
          </div>
        </div>
      ) : (
        <p className="muted">Vul je uitgaven per maand in om te zien hoeveel vermogen je nodig hebt om ervan te kunnen leven.</p>
      )}
      <p className="muted small explain">
        Vuistregel (“4%-regel”): als je per jaar niet meer dan zo’n 4% van je belegd vermogen opneemt, blijft het naar verwachting lang genoeg over.
        Gerekend met vrij besteedbaar vermogen (zonder woning en pensioen) en dezelfde aannames als bij Doel &amp; prognose (spaarbedrag, inleg en rendement).
        AOW en pensioen verlagen in de praktijk wat je nodig hebt.
      </p>
    </section>
  );
}

function YearOverview({ rows, cpi, state, setSettings }) {
  const income = state.settings.income;
  const years = useMemo(() => yearSummary(rows, cpi, income).reverse(), [rows, cpi, income]);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Jaaroverzicht</h2>
        <span className="muted small">per kalenderjaar</span>
      </div>
      <p className="muted small explain">
        <strong>Sparen &amp; aflossen</strong> is wat je zelf hebt opzijgezet: groei min rendement en min waardeverandering van woning, bezit en pensioen.
        <strong> Reële groei</strong> is de groei na aftrek van inflatie (CPI van het CBS){cpi ? '' : ' en verschijnt zodra de CBS-cijfers zijn opgehaald'}.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Jaar</th>
              <th className="num">Begin</th>
              <th className="num">Eind</th>
              <th className="num">Groei</th>
              <th className="num">%</th>
              <th className="num">Rendement</th>
              <th className="num">Sparen &amp; aflossen</th>
              <th className="num">Waardeverandering bezit &amp; pensioen</th>
              <th className="num">Reële groei</th>
              {income > 0 && <th className="num">Spaarquote</th>}
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.year}>
                <td>
                  {y.year}
                  {y.months < 12 && <span className="muted small"> ({y.months} mnd)</span>}
                </td>
                <td className="num">{fmtEur(y.start)}</td>
                <td className="num">{fmtEur(y.end)}</td>
                <td className={`num ${y.delta > 0 ? 'up' : y.delta < 0 ? 'down' : ''}`}>{fmtSigned(y.delta)}</td>
                <td className="num muted">{fmtPct(y.pct)}</td>
                <td className="num">{fmtSigned(y.ret)}</td>
                <td className="num">{fmtSigned(y.saving)}</td>
                <td className="num">{fmtSigned(y.valueChange)}</td>
                <td className="num">
                  {y.real == null ? '—' : fmtSigned(y.real)}
                  {y.realPct != null && <span className="muted small block">{fmtPct(y.realPct)}</span>}
                </td>
                {income > 0 && <td className="num">{y.savingRate == null ? '—' : fmtPct(y.savingRate).replace('+', '')}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline-field">
        <span className="small">Netto inkomen per maand <span className="muted">(optioneel, voor de spaarquote)</span></span>
        <AmountField value={income} onCommit={(v) => setSettings({ income: v })} placeholder="bijv. 3.500" ariaLabel="Netto inkomen per maand" />
      </div>
    </section>
  );
}

function AccountReturns({ state }) {
  const perf = useMemo(() => accountPerformance(state), [state]);
  if (!perf.length) {
    return (
      <section className="card muted-card">
        <h2>Rendement per rekening</h2>
        <p className="muted">Zet bij je beleggingsrekeningen “rendement volgen” aan en vul per maand je netto inleg in. Dan zie je hier per rekening het jaarrendement.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2>Rendement per rekening</h2>
        <span className="muted small">rekeningen met “rendement volgen”</span>
      </div>
      <p className="muted small explain">
        <strong>Jaarrendement</strong> is het gemiddelde rendement per jaar, rekening houdend met wanneer je geld hebt ingelegd (interne rentevoet / IRR).
        Zo kun je rekeningen eerlijk vergelijken, ook als je op verschillende momenten hebt ingelegd. Pas zinvol na een paar maanden.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rekening</th>
              <th>Sinds</th>
              <th className="num">Ingelegd</th>
              <th className="num">Waarde</th>
              <th className="num">Rendement</th>
              <th className="num">Jaarrendement</th>
            </tr>
          </thead>
          <tbody>
            {perf.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.archived && <span className="muted small"> · gearchiveerd</span>}</td>
                <td className="muted">{monthLong(p.first)}</td>
                <td className="num">{fmtEur(p.deposited)}</td>
                <td className="num">{fmtEur(p.value)}</td>
                <td className={`num ${p.ret > 0 ? 'up' : p.ret < 0 ? 'down' : ''}`}>{fmtSigned(p.ret)}</td>
                <td className="num">{p.annual == null ? '—' : fmtPct(p.annual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GoalProjection({ rows, state, setSettings, chart }) {
  const { goal, projection } = state.settings;
  const last = rows[rows.length - 1];
  const avg = useMemo(() => recentAverages(state, rows), [state, rows]);
  const opts = {
    saving: projection.saving ?? Math.round(avg.saving),
    investing: projection.investing ?? Math.round(avg.investing),
    returnPct: projection.returnPct ?? 5,
  };
  const setProj = (patch) => setSettings({ projection: { ...projection, ...patch } });
  const setGoal = (patch) => setSettings({ goal: { ...goal, ...patch } });

  const MAX = 40 * 12;
  const points = useMemo(() => project(last, { ...opts, months: MAX }), [last, opts.saving, opts.investing, opts.returnPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const reachIdx = goal.amount ? (last.net >= goal.amount ? -1 : points.findIndex((p) => p.projected >= goal.amount)) : null;
  const horizon = Math.min(MAX, Math.max(120, reachIdx != null && reachIdx >= 0 ? reachIdx + 13 : 120, goal.date ? monthsBetween(last.month, goal.date) + 12 : 0));
  const history = rows.slice(-60).map((r) => ({ month: r.month, net: r.net, projected: null }));
  history[history.length - 1] = { ...history[history.length - 1], projected: last.net };
  const data = [...history, ...points.slice(0, horizon).map((p) => ({ month: p.month, net: null, projected: p.projected }))];

  const monthsToDate = goal.date ? monthsBetween(last.month, goal.date) : null;
  const needed = goal.amount && monthsToDate > 0 ? requiredInvesting(last, opts, goal.amount, monthsToDate) : null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Doel &amp; prognose</h2>
        <span className="muted small">vanaf {monthLong(last.month)}</span>
      </div>
      <div className="form-grid">
        <label className="field">
          <span className="small">Doel netto vermogen</span>
          <AmountField value={goal.amount} onCommit={(v) => setGoal({ amount: v })} placeholder="bijv. 250.000" ariaLabel="Doelbedrag" />
        </label>
        <label className="field">
          <span className="small">Doeldatum <span className="muted">(optioneel)</span></span>
          <input type="month" value={goal.date || ''} min={addMonths(currentMonth(), 1)} onChange={(e) => setGoal({ date: e.target.value || null })} />
        </label>
        <label className="field">
          <span className="small">Totaal sparen per maand <span className="muted">(gem. 12 mnd: {fmtEur(avg.saving)})</span></span>
          <AmountField value={projection.saving} onCommit={(v) => setProj({ saving: v })} placeholder={fmtNum(Math.round(avg.saving))} ariaLabel="Spaarbedrag per maand" />
        </label>
        <label className="field">
          <span className="small">waarvan inleg beleggingen <span className="muted">(gem.: {fmtEur(avg.investing)})</span></span>
          <AmountField value={projection.investing} onCommit={(v) => setProj({ investing: v })} placeholder={fmtNum(Math.round(avg.investing))} ariaLabel="Inleg beleggingen per maand" />
        </label>
        <label className="field">
          <span className="small">Verwacht rendement per jaar</span>
          <AmountField value={projection.returnPct} onCommit={(v) => setProj({ returnPct: v ?? 5 })} suffix="%" placeholder="5" ariaLabel="Verwacht rendement" />
        </label>
      </div>

      <div className="mini-kpis">
        {goal.amount ? (
          <>
            <div><span className="muted small">Voortgang</span><strong>{fmtPct(Math.max(0, last.net / goal.amount)).replace('+', '')}</strong></div>
            <div>
              <span className="muted small">Doel bereikt</span>
              <strong>
                {reachIdx === -1 ? 'Al bereikt 🎉' : reachIdx >= 0 ? `${monthLong(points[reachIdx].month)}` : 'Niet binnen 40 jaar'}
              </strong>
              {reachIdx > 0 && <span className="muted small">over {Math.floor((reachIdx + 1) / 12)} jaar en {(reachIdx + 1) % 12} mnd</span>}
            </div>
            {needed != null && (
              <div>
                <span className="muted small">Nodig voor {monthLong(goal.date)}</span>
                <strong>{needed <= 0 ? 'Lukt al' : `${fmtEur(needed)} /mnd`}</strong>
                {needed > 0 && <span className="muted small">inleg in beleggingen</span>}
              </div>
            )}
          </>
        ) : (
          <div><span className="muted small">Doel</span><strong>Vul een doelbedrag in</strong></div>
        )}
        <div><span className="muted small">Over 10 jaar</span><strong>{fmtEur(points[119].projected)}</strong></div>
      </div>

      <ProjectionChart data={data} goal={goal.amount} chart={chart} />
      <p className="muted small explain">
        Aannames: beleggingen en pensioen groeien met het verwachte rendement; je inleg gaat naar beleggingen; de rest van je spaargeld (en aflossing)
        groeit niet mee. Woning en overig bezit blijven gelijk. Bedragen zijn nominaal (niet gecorrigeerd voor inflatie). Dit is een rekenvoorbeeld, geen voorspelling.
      </p>
    </section>
  );
}

function Box3Section({ state, setSettings, goTab }) {
  const years = useMemo(() => box3Years(state), [state]);
  const [picked, setYear] = useState(null);
  const year = picked && years.includes(picked) ? picked : years[0] || null;
  const partner = !!state.settings.box3Partner;
  const res = useMemo(() => (year ? computeBox3(state, year, partner) : null), [state, year, partner]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Box 3-indicatie</h2>
        {years.length > 0 && (
          <div className="segmented" role="group" aria-label="Belastingjaar">
            {years.slice(0, 5).map((y) => (
              <button key={y} className={year === y ? 'seg active' : 'seg'} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
        )}
      </div>
      {!res ? (
        <p className="muted">
          Voor box 3 telt je vermogen op 1 januari. Vul de stand van december of januari in (vanaf belastingjaar 2023) om hier een indicatie te zien.
        </p>
      ) : (
        <>
          <p className="muted small explain">
            Peildatum 1 januari {res.year}: gebaseerd op je stand van {monthLong(res.month)}. Berekend volgens de overbruggingsregeling
            (forfaitaire rendementen {res.params.year}{res.params.estimated ? `; de percentages voor ${res.year} zijn nog niet bekend` : `, ${res.params.status}`}).
            Eigen woning, hypotheek, pensioen en auto voor eigen gebruik tellen niet mee; per rekening aan te passen bij{' '}
            <button className="link" onClick={() => goTab('rekeningen')}>Rekeningen</button>.
          </p>
          <label className="switch">
            <input type="checkbox" checked={partner} onChange={(e) => setSettings({ box3Partner: e.target.checked })} />
            <span className="slider" />
            <span>Met fiscale partner <span className="muted small">(dubbel heffingsvrij vermogen en schuldendrempel; vul dan het gezamenlijke vermogen in)</span></span>
          </label>
          <table className="data-table box3-table">
            <tbody>
              <tr><td>Banktegoeden</td><td className="num">{fmtEur(res.bank)}</td><td className="num muted">× {fmtPct(res.params.bank).replace('+', '')}</td></tr>
              <tr><td>Beleggingen en overige bezittingen</td><td className="num">{fmtEur(res.overig)}</td><td className="num muted">× {fmtPct(res.params.overig).replace('+', '')}</td></tr>
              <tr>
                <td>Schulden <span className="muted small">({fmtEur(res.schuldBruto)} min drempel {fmtEur(res.drempel)})</span></td>
                <td className="num">{fmtSigned(-res.schuld)}</td>
                <td className="num muted">× {fmtPct(res.params.schuld).replace('+', '')}</td>
              </tr>
              <tr className="total-row"><td>Rendementsgrondslag</td><td className="num">{fmtEur(res.grondslagRendement)}</td><td /></tr>
              <tr><td>Heffingsvrij vermogen</td><td className="num">{fmtSigned(-res.hvv)}</td><td /></tr>
              <tr className="total-row"><td>Grondslag sparen en beleggen</td><td className="num">{fmtEur(res.grondslag)}</td><td /></tr>
              <tr><td>Effectief rendementspercentage</td><td className="num">{fmtPct(res.pct).replace('+', '')}</td><td /></tr>
              <tr><td>Voordeel uit sparen en beleggen</td><td className="num">{fmtEur(res.voordeel)}</td><td className="num muted">× {Math.round(res.params.tarief * 100)}%</td></tr>
              <tr className="total-row highlight"><td>Geschatte box 3-belasting {res.year}</td><td className="num">{fmtEur(res.belasting)}</td><td /></tr>
            </tbody>
          </table>
          <p className="muted small explain">
            Dit is een indicatie, geen aangifte. Niet meegenomen: groene beleggingen, heffingskortingen, buitenlands vermogen en de mogelijkheid om een lager
            werkelijk rendement aan te tonen (tegenbewijsregeling). Percentages van jaren {Object.keys(BOX3_PARAMS).join(', ')} staan in de app; vanaf 2028 is een nieuw stelsel gepland.
          </p>
        </>
      )}
    </section>
  );
}

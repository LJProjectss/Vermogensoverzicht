import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarRange, Scale, Wallet } from 'lucide-react';
import { buildSeries, filterRange, growthBuckets, periodTotals, yearAgo } from '../lib/calc.js';
import { currentMonth, fmtEur, fmtPct, fmtSigned, monthLong } from '../lib/format.js';
import { AllocationDonut, CompositionChart, DepositChart, GrowthChart, NetWorthChart } from '../components/charts.jsx';
import { deflateRows, useCpi } from '../lib/cbs.js';

const RANGES = [
  { id: '1y', label: '1 jaar' },
  { id: '3y', label: '3 jaar' },
  { id: '5y', label: '5 jaar' },
  { id: 'all', label: 'Alles' },
];

function Delta({ value, pct }) {
  if (value == null) return <span className="muted">—</span>;
  const cls = value > 0.5 ? 'up' : value < -0.5 ? 'down' : '';
  const Icon = value > 0.5 ? ArrowUpRight : value < -0.5 ? ArrowDownRight : null;
  return (
    <span className={`delta ${cls}`}>
      {Icon && <Icon size={16} />}
      {fmtSigned(value)}
      {pct != null && <span className="delta-pct"> ({fmtPct(pct)})</span>}
    </span>
  );
}

const BACKUP_DAYS = 30;
const BACKUP_DAYS_SYNC = 90; // met Google Drive staat er al een kopie in de cloud

// Een back-up via de Thuis-hub (zelfde adres) bevat ook deze app en telt dus ook mee.
function hubBackup() {
  try {
    return localStorage.getItem('hub_laatsteBackup');
  } catch {
    return null;
  }
}

// Back-upherinnering als regel voor de "Te doen"-kaart (of null).
function backupTodo({ state, quickBackup, setSettings, syncActive }) {
  const { backupSnoozeUntil } = state.settings;
  const lastExport = [state.settings.lastExport, hubBackup()].filter(Boolean).sort().pop() || null;
  if (!state.accounts.length || !Object.keys(state.months).length) return null;
  if (backupSnoozeUntil && new Date(backupSnoozeUntil) > new Date()) return null;
  const days = lastExport ? Math.floor((Date.now() - new Date(lastExport).getTime()) / 86400000) : null;
  if (days != null && days <= (syncActive ? BACKUP_DAYS_SYNC : BACKUP_DAYS)) return null;
  const snooze = () => setSettings({ backupSnoozeUntil: new Date(Date.now() + 7 * 86400000).toISOString() });
  return {
    key: 'backup',
    icon: '💾',
    warn: true,
    text: (
      <>
        {days == null ? 'Je hebt nog geen back-up gemaakt.' : `Je laatste back-up is ${days} dagen oud.`}{' '}
        <span className="muted">
          {syncActive ? 'Google Drive is gekoppeld, maar een eigen kopie is verstandig.' : 'Je gegevens staan alleen in deze browser.'}
        </span>
      </>
    ),
    actions: (
      <>
        <button className="primary small" onClick={quickBackup}>Back-up downloaden</button>
        <button className="ghost small" onClick={snooze}>Over een week</button>
      </>
    ),
  };
}

// Alle meldingen samen in één kaart, zodat het overzicht niet achter losse balken wegzakt.
function TodoCard({ items }) {
  if (!items.length) return null;
  return (
    <section className="card todo-card" aria-label="Te doen">
      <h2>Te doen</h2>
      <ul>
        {items.map((it) => (
          <li key={it.key} className={it.warn ? 'todo-warn' : ''}>
            <span className="todo-icon" aria-hidden="true">{it.icon}</span>
            <span className="todo-text">{it.text}</span>
            <span className="todo-actions">{it.actions}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Dashboard({ state, setSettings, chart, thisMonthMissing, goInvoer, goTab, quickBackup, syncActive }) {
  const [range, setRange] = useState('5y');
  const [liquidOnly, setLiquidOnly] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const realTerms = !!state.settings.realTerms;
  const { cpi, status: cpiStatus, error: cpiError } = useCpi(realTerms);
  const useReal = realTerms && !!cpi;

  const nominal = useMemo(() => buildSeries(state, { liquidOnly }), [state, liquidOnly]);
  const all = useMemo(() => (useReal ? deflateRows(nominal, cpi) : nominal), [nominal, useReal, cpi]);
  const rows = useMemo(() => filterRange(all, range), [all, range]);

  if (!state.accounts.length) {
    return (
      <div className="empty card">
        <h2>Welkom 👋</h2>
        <p>Begin met het toevoegen van je rekeningen, beleggingen, pensioen en schulden. Daarna vul je één keer per maand de standen in.</p>
        <div className="row gap">
          <button className="primary" onClick={() => goTab('rekeningen')}>Rekeningen toevoegen</button>
          <button onClick={() => goTab('data')}>Voorbeelddata bekijken</button>
        </div>
      </div>
    );
  }
  if (!all.length) {
    return (
      <div className="empty card">
        <h2>Nog geen maanden ingevuld</h2>
        <p>Vul je eerste maandstand in. Heb je oude standen (bijv. van jaarafschriften)? Vul dan ook eerdere maanden in voor een langere lijn.</p>
        <button className="primary" onClick={() => goInvoer()}>Maand invullen</button>
      </div>
    );
  }

  const last = all[all.length - 1];
  const prev = all.length > 1 ? all[all.length - 2] : null;
  const ago = yearAgo(all);
  const yearDelta = ago ? last.net - ago.net : null;
  const yearPct = ago && ago.net > 0 ? yearDelta / ago.net : null;

  const buckets = growthBuckets(rows);
  const totals = periodTotals(rows);
  const tracked = rows.filter((r) => r.hasTracked);
  const hasTracking = all.some((r) => r.hasTracked);
  const ytdRows = all.filter((r) => r.month.startsWith(last.month.slice(0, 4)));
  const ytd = periodTotals(ytdRows);
  const ytdDeposit = ytdRows.reduce((s, r) => s + (r.delta != null ? r.deposit : 0), 0);
  const notes = rows.filter((r) => r.note);

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Overzicht</h1>
      </div>

      <TodoCard
        items={[
          thisMonthMissing && {
            key: 'maand',
            icon: '📅',
            text: `${monthLong(currentMonth()).replace(/^./, (c) => c.toUpperCase())} is nog niet ingevuld.`,
            actions: <button className="primary small" onClick={() => goInvoer(currentMonth())}>Nu invullen</button>,
          },
          backupTodo({ state, quickBackup, setSettings, syncActive }),
        ].filter(Boolean)}
      />

      <div className="controls">
        <div className="segmented" role="group" aria-label="Periode">
          {RANGES.map((r) => (
            <button key={r.id} className={range === r.id ? 'seg active' : 'seg'} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="switches">
          <label className="switch">
            <input type="checkbox" checked={liquidOnly} onChange={(e) => setLiquidOnly(e.target.checked)} />
            <span className="slider" />
            <span>Alleen vrij besteedbaar <span className="muted small">(zonder pensioen, woning &amp; hypotheek)</span></span>
          </label>
          <label className="switch">
            <input type="checkbox" checked={realTerms} onChange={(e) => setSettings({ realTerms: e.target.checked })} />
            <span className="slider" />
            <span>Gecorrigeerd voor inflatie <span className="muted small">(CBS)</span></span>
          </label>
        </div>
      </div>

      {realTerms && (
        <p className="muted small inflation-note">
          {useReal
            ? `Alle bedragen in euro's van ${monthLong(last.month)}, omgerekend met de consumentenprijsindex (CPI) van het CBS. Laatst bekende CBS-maand: ${monthLong(cpi.latest)}${last.month > cpi.latest ? '; recentere maanden gebruiken dat cijfer' : ''}.`
            : cpiStatus === 'loading'
              ? 'Inflatiecijfers ophalen bij het CBS…'
              : `Inflatiecijfers konden niet worden opgehaald${cpiError ? ` (${cpiError})` : ''}. Bedragen zijn nominaal. Probeer het later opnieuw met internetverbinding.`}
        </p>
      )}

      <section className="ledger">
        <div className="ledger-cell">
          <div className="ledger-label"><Wallet size={13} />Netto vermogen · {monthLong(last.month)}</div>
          <div className="ledger-value">{fmtEur(last.net)}</div>
        </div>
        <div className="ledger-cell">
          <div className="ledger-label"><CalendarRange size={13} />t.o.v. vorige maand</div>
          <div className="ledger-value sm">
            <Delta value={last.delta} />
            {last.deltaPct != null && <span className="delta-pct">{fmtPct(last.deltaPct)}{prev ? ` · sinds ${monthLong(prev.month)}` : ''}</span>}
          </div>
        </div>
        <div className="ledger-cell">
          <div className="ledger-label"><CalendarRange size={13} />t.o.v. een jaar eerder</div>
          <div className="ledger-value sm">
            <Delta value={yearDelta} />
            {yearPct != null && <span className="delta-pct">{fmtPct(yearPct)} · sinds {monthLong(ago.month)}</span>}
          </div>
        </div>
        <div className="ledger-cell">
          <div className="ledger-label"><Scale size={13} />Bezittingen / schulden</div>
          <div className="ledger-value sm">
            <span className="up">{fmtEur(last.assets)}</span>
            <span className="delta-pct down">{fmtSigned(-last.debts)} schulden</span>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Netto vermogen</h2>
          {notes.length > 0 && <span className="muted small">○ = maand met notitie</span>}
        </div>
        <NetWorthChart rows={rows} chart={chart} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Samenstelling door de tijd</h2></div>
          <CompositionChart rows={rows} chart={chart} />
        </section>
        <section className="card">
          <div className="card-head"><h2>Verdeling · {monthLong(last.month)}</h2></div>
          <AllocationDonut row={last} chart={chart} />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Waar komt de groei vandaan?</h2>
          <span className="muted small">{buckets[0]?.byYear ? 'per jaar' : 'per maand'}</span>
        </div>
        <p className="muted small explain">
          <strong>Rendement</strong> is koerswinst/-verlies op rekeningen waarbij je “rendement volgen” aanzet (waardeverandering min je inleg).
          <strong> Sparen, aflossen &amp; overig</strong> is de rest: geld dat je opzij zet, aflossingen, en waardeverandering van bijvoorbeeld je woning.
        </p>
        {buckets.length ? (
          <>
            <div className="mini-kpis">
              <div><span className="muted small">Groei in periode</span><strong>{fmtSigned(totals.delta)}</strong></div>
              <div><span className="muted small">waarvan sparen, aflossen &amp; overig</span><strong>{fmtSigned(totals.other)}</strong></div>
              <div><span className="muted small">waarvan rendement</span><strong>{fmtSigned(totals.ret)}</strong></div>
            </div>
            <GrowthChart buckets={buckets} chart={chart} />
          </>
        ) : (
          <p className="muted">Hier verschijnt een grafiek zodra je minstens twee maanden hebt ingevuld.</p>
        )}
      </section>

      {hasTracking ? (
        <section className="card">
          <div className="card-head"><h2>Inleg vs. rendement</h2><span className="muted small">rekeningen met “rendement volgen”</span></div>
          <div className="mini-kpis">
            <div><span className="muted small">Huidige waarde</span><strong>{fmtEur(last.trackedValue)}</strong></div>
            <div><span className="muted small">Totaal ingelegd</span><strong>{fmtEur(last.cumDeposit)}</strong></div>
            <div><span className="muted small">Rendement totaal</span><strong>{fmtSigned(last.cumReturn)}</strong></div>
            <div><span className="muted small">Rendement {last.month.slice(0, 4)}</span><strong>{fmtSigned(ytd.ret)}</strong></div>
            <div><span className="muted small">Inleg {last.month.slice(0, 4)}</span><strong>{fmtSigned(ytdDeposit)}</strong></div>
          </div>
          {tracked.length > 1 && <DepositChart rows={tracked} chart={chart} />}
          <p className="muted small explain">Het verschil tussen de twee lijnen is je totale rendement. De startwaarde van een rekening telt als inleg.</p>
        </section>
      ) : (
        <section className="card muted-card">
          <h2>Inleg vs. rendement</h2>
          <p className="muted">Zet bij je beleggingsrekeningen “rendement volgen” aan (tab Rekeningen) en vul per maand je netto inleg in. Dan zie je hier hoeveel van je groei uit de markt komt.</p>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Maandoverzicht</h2>
          <button className="ghost small" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Verberg tabel' : 'Toon tabel'}
          </button>
        </div>
        {showTable && (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Maand</th>
                  <th className="num">Netto</th>
                  <th className="num">Verschil</th>
                  <th className="num">%</th>
                  <th className="num">Rendement</th>
                  <th className="num">Sparen/overig</th>
                  <th>Notitie</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...rows].reverse().map((r) => (
                  <tr key={r.month}>
                    <td>{monthLong(r.month)}</td>
                    <td className="num">{fmtEur(r.net)}</td>
                    <td className="num"><Delta value={r.delta} /></td>
                    <td className="num muted">{fmtPct(r.deltaPct)}</td>
                    <td className="num">{r.delta == null ? '—' : fmtSigned(r.ret)}</td>
                    <td className="num">{fmtSigned(r.other)}</td>
                    <td className="note-cell">{r.note}</td>
                    <td><button className="ghost small" onClick={() => goInvoer(r.month)}>Bewerk</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

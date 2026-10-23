import { useRef, useState } from 'react';
import { downloadFile } from '../lib/storage.js';
import { mergeCsv, toCsv } from '../lib/csv.js';
import { normalizeState } from '../lib/model.js';
import { demoState } from '../lib/demo.js';
import { currentMonth } from '../lib/format.js';
import { reminderIcs } from '../lib/ics.js';
import SyncPanel from '../components/SyncPanel.jsx';
import { PinPanel, StoragePanel } from '../components/SecurityPanel.jsx';

const THEMES = [
  { id: 'auto', label: 'Systeem' },
  { id: 'light', label: 'Licht' },
  { id: 'dark', label: 'Donker' },
];

export default function DataView({ state, setState, withUndo, setStateRaw, setSettings, sync, onLockChange }) {
  const jsonRef = useRef(null);
  const csvRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'reset' | 'demo' | {kind:'json', data}

  const monthsCount = Object.keys(state.months).length;
  const stamp = new Date().toISOString().slice(0, 10);
  const lastExport = state.settings.lastExport ? new Date(state.settings.lastExport) : null;
  const daysSince = lastExport ? Math.floor((Date.now() - lastExport.getTime()) / 86400000) : null;

  const exportJson = () => {
    const now = new Date().toISOString();
    const data = { ...state, settings: { ...state.settings, lastExport: now }, exportedAt: now, app: 'vermogensoverzicht' };
    downloadFile(`vermogensoverzicht-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
    setSettings({ lastExport: now });
    setMsg({ type: 'ok', text: 'Back-up gedownload.' });
  };

  const reminder = state.settings.reminder || { day: 1, time: '19:00' };
  const downloadReminder = () => {
    downloadFile('vermogensoverzicht-herinnering.ics', reminderIcs({ ...reminder, url: window.location.origin + import.meta.env.BASE_URL }), 'text/calendar;charset=utf-8');
    setMsg({ type: 'ok', text: `Herinnering gedownload: elke ${reminder.day}e van de maand om ${reminder.time}. Open het bestand om hem aan je agenda toe te voegen.` });
  };

  const exportCsv = () => {
    downloadFile(`vermogensoverzicht-${stamp}.csv`, toCsv(state), 'text/csv;charset=utf-8');
    setMsg({ type: 'ok', text: 'CSV gedownload.' });
  };

  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });

  const onJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = normalizeState(JSON.parse(await readFile(file)));
      if (!data.accounts.length) throw new Error('Geen rekeningen gevonden in dit bestand.');
      setConfirm({ kind: 'json', data, name: file.name });
      setMsg(null);
    } catch (err) {
      setMsg({ type: 'error', text: `Import mislukt: ${err.message}` });
    }
  };

  const onCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { state: next, stats } = mergeCsv(state, await readFile(file));
      withUndo('CSV geïmporteerd.', () => next);
      setMsg({
        type: 'ok',
        text: `${stats.rows} regels geïmporteerd over ${stats.months} maanden` +
          (stats.newAccounts ? `, ${stats.newAccounts} nieuwe rekening(en) aangemaakt (controleer het type bij Rekeningen)` : '') +
          (stats.skipped ? `. ${stats.skipped} regel(s) overgeslagen.` : '.'),
      });
    } catch (err) {
      setMsg({ type: 'error', text: `Import mislukt: ${err.message}` });
    }
  };

  const doConfirm = () => {
    setMsg(null);
    if (confirm === 'reset') {
      withUndo('Alle gegevens zijn gewist.', (s) => normalizeState({ settings: s.settings }));
    } else if (confirm === 'demo') {
      withUndo('Voorbeelddata geladen. Kijk bij Overzicht.', (s) => ({ ...demoState(), settings: s.settings }));
    } else if (confirm?.kind === 'json') {
      const data = confirm.data;
      withUndo(`Back-up “${confirm.name}” teruggezet.`, (s) => ({ ...data, settings: { ...data.settings, theme: s.settings.theme } }));
    }
    setConfirm(null);
  };

  return (
    <div className="stack">
      <div className="page-head"><h1>Data & instellingen</h1></div>
      {msg && <div className={`banner ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}

      {confirm && (
        <div className="banner warn-banner">
          <span>
            {confirm === 'reset' &&
              `Alle rekeningen en maanden worden gewist${sync.cfg ? ', ook in Google Drive en op je andere gekoppelde apparaten' : ''}. Maak eerst een back-up als je die nog wilt.`}
            {confirm === 'demo' && 'Voorbeelddata vervangt je huidige gegevens. Maak eerst een back-up als je die nog wilt.'}
            {confirm?.kind === 'json' &&
              `“${confirm.name}” bevat ${confirm.data.accounts.length} rekeningen en ${Object.keys(confirm.data.months).length} maanden. Dit vervangt je huidige gegevens.`}
          </span>
          <span className="row gap">
            <button className="danger" onClick={doConfirm}>Doorgaan</button>
            <button className="ghost" onClick={() => setConfirm(null)}>Annuleren</button>
          </span>
        </div>
      )}

      <section className="card">
        <h2>Back-up</h2>
        <p className="muted">
          {sync.cfg
            ? 'Je gegevens staan in deze browser en versleuteld in Google Drive. Een eigen back-up blijft verstandig, bijvoorbeeld een paar keer per jaar.'
            : 'Je gegevens staan alleen in deze browser op dit apparaat. Maak regelmatig een back-up, bijvoorbeeld na het invullen van elke maand.'}
        </p>
        <StoragePanel />
        <p className={daysSince == null || daysSince > 31 ? 'warn' : 'muted small'}>
          {lastExport
            ? `Laatste back-up: ${lastExport.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}${daysSince > 31 ? ' (meer dan een maand geleden)' : ''}`
            : 'Je hebt nog geen back-up gemaakt.'}
        </p>
        <div className="row gap wrap">
          <button className="primary" onClick={exportJson} disabled={!state.accounts.length}>Back-up downloaden (JSON)</button>
          <button onClick={() => jsonRef.current?.click()}>Back-up terugzetten…</button>
          <input ref={jsonRef} type="file" accept=".json,application/json" hidden onChange={onJson} />
        </div>
      </section>

      <SyncPanel state={state} setState={setState} setStateRaw={setStateRaw} sync={sync} />

      <PinPanel state={state} onLockChange={onLockChange} />

      <section className="card">
        <h2>Weergave</h2>
        <div className="settings-row">
          <span>Thema</span>
          <div className="segmented" role="group" aria-label="Thema">
            {THEMES.map((t) => (
              <button key={t.id} className={(state.settings.theme || 'auto') === t.id ? 'seg active' : 'seg'} onClick={() => setSettings({ theme: t.id })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="switch settings-switch">
          <input type="checkbox" checked={!!state.settings.privacy} onChange={(e) => setSettings({ privacy: e.target.checked })} />
          <span className="slider" />
          <span>Privacymodus <span className="muted small">(bedragen verbergen, handig als iemand meekijkt; ook via het oog-icoon)</span></span>
        </label>
      </section>

      <section className="card">
        <h2>Maandelijkse herinnering</h2>
        <p className="muted">
          Zet een terugkerende afspraak in je agenda (Google Agenda, Outlook, Apple Agenda) met een link naar de app. Open het gedownloade bestand om de afspraak toe te voegen.
        </p>
        <div className="row gap wrap reminder-row">
          <label className="field-inline">
            <span className="small">Dag van de maand</span>
            <select value={reminder.day} onChange={(e) => setSettings({ reminder: { ...reminder, day: +e.target.value } })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field-inline">
            <span className="small">Tijd</span>
            <input type="time" value={reminder.time} onChange={(e) => e.target.value && setSettings({ reminder: { ...reminder, time: e.target.value } })} />
          </label>
          <button onClick={downloadReminder}>Herinnering toevoegen aan agenda</button>
        </div>
      </section>

      <section className="card">
        <h2>CSV (Excel)</h2>
        <p className="muted">
          Eén regel per rekening per maand: <code>maand;rekening;type;waarde;inleg;notitie</code>. Handig om in Excel te bekijken, of om oude standen in één keer te importeren.
          Bij import worden rekeningen op naam gekoppeld; onbekende namen worden nieuwe rekeningen. Bestaande waarden voor dezelfde maand en rekening worden overschreven.
        </p>
        <div className="row gap wrap">
          <button onClick={exportCsv} disabled={!monthsCount}>CSV downloaden</button>
          <button onClick={() => csvRef.current?.click()}>CSV importeren…</button>
          <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={onCsv} />
        </div>
        <details className="small">
          <summary>Voorbeeld importbestand</summary>
          <pre>{`maand;rekening;type;waarde;inleg;notitie
${currentMonth().slice(0, 4)}-01;Spaarrekening;spaar;12500,00;;Bonus ontvangen
${currentMonth().slice(0, 4)}-01;Interactive Brokers;beleggen;18300,50;500;
${currentMonth().slice(0, 4)}-01;Hypotheek;hypotheek;245000;;`}</pre>
          <p className="muted">Types: betaal, spaar, beleggen, crypto, pensioen, vastgoed, voertuig, bezit_overig, hypotheek, studieschuld, lening, schuld_overig.</p>
        </details>
      </section>

      <section className="card">
        <h2>Overig</h2>
        <p className="muted small">{state.accounts.length} rekeningen · {monthsCount} ingevulde maanden</p>
        <div className="row gap wrap">
          <button onClick={() => (state.accounts.length ? setConfirm('demo') : doConfirmDemo())}>Voorbeelddata laden</button>
          <button className="danger ghost" onClick={() => setConfirm('reset')} disabled={!state.accounts.length}>Alles wissen</button>
        </div>
      </section>
    </div>
  );

  function doConfirmDemo() {
    setState({ ...demoState(), settings: state.settings });
    setMsg({ type: 'ok', text: 'Voorbeelddata geladen. Kijk bij Overzicht. Wis het later via “Alles wissen”.' });
  }
}

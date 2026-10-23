import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  CalendarPlus, ChartColumn, House, Cloud, CloudAlert, CloudOff, Database, Download, Eye, EyeOff,
  Landmark, LayoutDashboard, Lock, Moon, RefreshCw, Sun, TrendingUp,
} from 'lucide-react';
import {
  downloadFile, isLockEnabled, loadState, loadThemePref, persistStatus, requestPersist, saveState, saveThemePref,
} from './lib/storage.js';
import { currentMonth, setPrivacy } from './lib/format.js';
import { applyTheme, useChartTheme, useResolvedTheme } from './lib/theme.js';
import { stampChanges } from './lib/stamps.js';
import { useSync } from './lib/useSync.js';
import LockScreen from './components/LockScreen.jsx';
import Invoer from './views/Invoer.jsx';
import Rekeningen from './views/Rekeningen.jsx';
import DataView from './views/DataView.jsx';

// Grafiekpagina's pas laden als ze nodig zijn (recharts is het grootste deel van de bundel)
const Dashboard = lazy(() => import('./views/Dashboard.jsx'));
const Analyse = lazy(() => import('./views/Analyse.jsx'));

const NAV = [
  { id: 'dashboard', label: 'Overzicht', icon: LayoutDashboard },
  { id: 'invoer', label: 'Maand invullen', short: 'Invullen', icon: CalendarPlus },
  { id: 'analyse', label: 'Analyse', icon: ChartColumn },
  { id: 'rekeningen', label: 'Rekeningen', icon: Landmark },
  { id: 'data', label: 'Data & instellingen', short: 'Data', icon: Database },
];

const AUTO_LOCK_MS = 5 * 60000;

export default function App() {
  const [locked, setLocked] = useState(isLockEnabled);
  const [initial, setInitial] = useState(() => (isLockEnabled() ? null : loadState()));
  const theme = useResolvedTheme(initial?.settings.theme ?? loadThemePref());

  useEffect(() => applyTheme(theme), [theme]);

  if (locked || !initial) {
    return (
      <LockScreen
        onUnlock={(state) => {
          setInitial(state);
          setLocked(false);
        }}
      />
    );
  }
  return <Main initial={initial} />;
}

function Main({ initial }) {
  const [state, setStateRaw] = useState(initial);
  const [tab, setTab] = useState(() => (initial.accounts.length ? 'dashboard' : 'rekeningen'));
  const [invoerMonth, setInvoerMonth] = useState(currentMonth());
  const [saveError, setSaveError] = useState(false);
  const [, setLockVersion] = useState(0); // opnieuw renderen na aan/uitzetten pincode

  // Elke wijziging via setState krijgt tijdstempels (nodig voor synchroniseren)
  const setState = useCallback(
    (fn) => setStateRaw((prev) => stampChanges(prev, typeof fn === 'function' ? fn(prev) : fn)),
    []
  );
  const sync = useSync(state, setStateRaw);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Meldingen onderin: "ongedaan maken" en "nieuwe versie"
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((l) => l.filter((x) => x.id !== id)), []);
  const toast = useCallback((t) => {
    const id = Date.now() + Math.random();
    setToasts((l) => [...l.filter((x) => x.kind !== t.kind), { ...t, id }]);
    if (t.timeout) setTimeout(() => dismiss(id), t.timeout);
  }, [dismiss]);

  // Voert een (verwijder)actie uit en biedt een paar seconden "Ongedaan maken" aan
  const withUndo = useCallback((text, fn) => {
    const before = stateRef.current;
    setState(fn);
    toast({ kind: 'undo', text, action: 'Ongedaan maken', onAction: () => setState(() => before), timeout: 8000 });
  }, [setState, toast]);

  useEffect(() => {
    const onUpdate = () =>
      toast({ kind: 'update', text: 'Er is een nieuwe versie van de app.', action: 'Vernieuwen', onAction: () => window.location.reload() });
    window.addEventListener('vo:update', onUpdate);
    if (window.__voUpdateReady) onUpdate();
    return () => window.removeEventListener('vo:update', onUpdate);
  }, [toast]);

  const theme = useResolvedTheme(state.settings.theme);
  // Afdrukken altijd in licht thema (ook de grafieken)
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const chart = useChartTheme(printing ? 'light' : theme);
  setPrivacy(state.settings.privacy);

  useEffect(() => {
    let current = true;
    saveState(state).then((ok) => current && setSaveError(!ok));
    return () => { current = false; };
  }, [state]);

  useEffect(() => {
    applyTheme(theme);
    saveThemePref(state.settings.theme);
  }, [theme, state.settings.theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('privacy', !!state.settings.privacy);
  }, [state.settings.privacy]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // Opslag laten beschermen tegen automatisch opruimen zodra er gegevens zijn (één keer vragen)
  useEffect(() => {
    if (!state.accounts.length) return;
    try {
      if (localStorage.getItem('vermogensoverzicht.persistAsked')) return;
      localStorage.setItem('vermogensoverzicht.persistAsked', '1');
    } catch { return; }
    persistStatus().then((s) => s === 'not-granted' && requestPersist());
  }, [state.accounts.length]);

  // Met pincode: automatisch vergrendelen na 5 minuten op de achtergrond
  useEffect(() => {
    let hiddenAt = null;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS && isLockEnabled()) window.location.reload();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const thisMonthMissing = useMemo(
    () => state.accounts.some((a) => !a.archived) && !state.months[currentMonth()],
    [state]
  );

  const goInvoer = (m) => {
    setInvoerMonth(m || currentMonth());
    setTab('invoer');
  };
  const go = (id) => (id === 'invoer' ? goInvoer(invoerMonth) : setTab(id));

  const setSettings = (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const toggleTheme = () => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  const togglePrivacy = () => setSettings({ privacy: !state.settings.privacy });

  const quickBackup = () => {
    const now = new Date().toISOString();
    const data = { ...state, settings: { ...state.settings, lastExport: now }, exportedAt: now, app: 'vermogensoverzicht' };
    downloadFile(`vermogensoverzicht-${now.slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
    setSettings({ lastExport: now, backupSnoozeUntil: null });
  };

  const lockNow = () => window.location.reload();
  const lockOn = isLockEnabled();
  const privacy = !!state.settings.privacy;

  const views = (
    <Suspense fallback={<div className="card muted">Laden…</div>}>
      {tab === 'dashboard' && (
        <Dashboard
          state={state}
          setSettings={setSettings}
          chart={chart}
          thisMonthMissing={thisMonthMissing}
          goInvoer={goInvoer}
          goTab={setTab}
          quickBackup={quickBackup}
          syncActive={!!sync.cfg}
        />
      )}
      {tab === 'invoer' && (
        <Invoer state={state} setState={setState} withUndo={withUndo} month={invoerMonth} setMonth={setInvoerMonth} goTab={setTab} />
      )}
      {tab === 'analyse' && <Analyse state={state} setSettings={setSettings} chart={chart} goTab={setTab} />}
      {tab === 'rekeningen' && <Rekeningen state={state} setState={setState} withUndo={withUndo} goInvoer={goInvoer} />}
      {tab === 'data' && (
        <DataView state={state} setState={setState} withUndo={withUndo} setStateRaw={setStateRaw} setSettings={setSettings} sync={sync} onLockChange={() => setLockVersion((v) => v + 1)} />
      )}
    </Suspense>
  );

  return (
    <div className="shell">
      {/* Zijbalk (desktop) */}
      <aside className="sidebar">
        <a href="/" className="side-item home-link" title="Terug naar Thuis">
          <House size={14} />
          Thuis
        </a>
        <div className="brand">
          <span className="brand-mark"><TrendingUp size={16} /></span>
          <span>Vermogensoverzicht</span>
        </div>
        <nav className="side-nav">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? 'side-item active' : 'side-item'} aria-current={tab === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
              <n.icon size={16} />
              {n.label}
              {n.id === 'invoer' && thisMonthMissing && <span className="dot" title="Deze maand is nog niet ingevuld" />}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <SyncChip sync={sync} onOpen={() => setTab('data')} />
          <button className="side-item" onClick={togglePrivacy}>
            {privacy ? <Eye size={16} /> : <EyeOff size={16} />}
            {privacy ? 'Bedragen tonen' : 'Bedragen verbergen'}
          </button>
          <button className="side-item" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            {theme === 'dark' ? 'Lichte modus' : 'Donkere modus'}
          </button>
          <button className="side-item" onClick={quickBackup} disabled={!state.accounts.length}>
            <Download size={16} />
            Back-up (JSON)
          </button>
          {lockOn && (
            <button className="side-item" onClick={lockNow}>
              <Lock size={16} />
              Vergrendelen
            </button>
          )}
        </div>
      </aside>

      <div className="main-col">
        {/* Bovenbalk (mobiel) */}
        <div className="mobile-top">
          <div className="brand">
            <a href="/" className="top-icon home-btn" aria-label="Terug naar Thuis"><House size={16} /></a>
            <span className="brand-mark sm"><TrendingUp size={14} /></span>
            <span>Vermogensoverzicht</span>
          </div>
          <div className="row">
            <SyncChip sync={sync} onOpen={() => setTab('data')} compact />
            <button className="top-icon" onClick={togglePrivacy} aria-label={privacy ? 'Bedragen tonen' : 'Bedragen verbergen'}>
              {privacy ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button className="top-icon" onClick={toggleTheme} aria-label="Thema wisselen">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            {lockOn ? (
              <button className="top-icon" onClick={lockNow} aria-label="Vergrendelen">
                <Lock size={16} />
              </button>
            ) : (
              <button className="top-icon" onClick={quickBackup} aria-label="Back-up downloaden" disabled={!state.accounts.length}>
                <Download size={16} />
              </button>
            )}
          </div>
        </div>

        {saveError && (
          <div className="strip error">
            Opslaan in de browser lukt niet (opslag vol of geblokkeerd). Maak een back-up via Data.
          </div>
        )}

        <main className="content">{views}</main>

        {toasts.length > 0 && (
          <div className="toasts" role="status" aria-live="polite">
            {toasts.map((t) => (
              <div className="toast" key={t.id}>
                <span>{t.text}</span>
                {t.action && (
                  <button className="small" onClick={() => { t.onAction(); dismiss(t.id); }}>{t.action}</button>
                )}
                <button className="ghost small toast-close" aria-label="Sluiten" onClick={() => dismiss(t.id)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Onderbalk (mobiel) */}
        <nav className="bottom-nav">
          {NAV.map((n) => (
            <button key={n.id} className={tab === n.id ? 'bottom-item active' : 'bottom-item'} aria-current={tab === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
              <span className="bottom-icon">
                <n.icon size={18} />
                {n.id === 'invoer' && thisMonthMissing && <span className="dot" />}
              </span>
              {n.short || n.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

const SYNC_LABEL = {
  idle: 'Gesynchroniseerd',
  syncing: 'Synchroniseren…',
  pending: 'Wacht op internet',
  'needs-auth': 'Opnieuw inloggen',
  error: 'Synchronisatiefout',
};

function SyncChip({ sync, onOpen, compact }) {
  if (!sync.cfg) return null;
  const s = sync.status;
  const Icon = s === 'syncing' ? RefreshCw : s === 'pending' ? CloudOff : s === 'idle' ? Cloud : CloudAlert;
  const label = s === 'idle' && sync.dirty ? 'Wijzigingen wachten' : SYNC_LABEL[s] || '';
  const warn = s === 'needs-auth' || s === 'error';
  const onClick = s === 'needs-auth' ? sync.reauth : onOpen;
  if (compact) {
    return (
      <button className={`top-icon ${warn ? 'warn-icon' : ''}`} onClick={onClick} aria-label={`Google Drive: ${label}`} title={label}>
        <Icon size={16} className={s === 'syncing' ? 'spin' : ''} />
      </button>
    );
  }
  return (
    <button className={`side-item ${warn ? 'warn-item' : ''}`} onClick={onClick} title="Google Drive-synchronisatie">
      <Icon size={16} className={s === 'syncing' ? 'spin' : ''} />
      {label}
    </button>
  );
}

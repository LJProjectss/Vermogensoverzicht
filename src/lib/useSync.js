import { useCallback, useEffect, useRef, useState } from 'react';
import { forgetSync, loadSyncConfig, syncOnce } from './sync.js';
import { revoke, signIn, storedToken } from './gdrive.js';
import { fingerprint, mergeStates } from './stamps.js';

const DEBOUNCE = 2500;
const INTERVAL = 5 * 60000;

// status: off | idle | syncing | pending (wacht op internet) | needs-auth | error
export function useSync(state, setStateRaw) {
  const [cfg, setCfg] = useState(loadSyncConfig);
  const [status, setStatus] = useState(() => (loadSyncConfig() ? 'idle' : 'off'));
  const [error, setError] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const stateRef = useRef(state);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef(null);
  stateRef.current = state;

  const dirty = cfg ? fingerprint(state) !== cfg.lastFingerprint : false;

  const run = useCallback(async () => {
    const current = loadSyncConfig();
    if (!current) { setStatus('off'); return; }
    if (running.current) { again.current = true; return; }
    if (!navigator.onLine) { setStatus('pending'); return; }
    if (!storedToken()) { setStatus('needs-auth'); return; }
    running.current = true;
    setStatus('syncing');
    const snapshot = stateRef.current;
    try {
      const res = await syncOnce(snapshot);
      if (res.state) {
        // Tijdens het synchroniseren lokaal gewijzigd? Dan die wijzigingen erbovenop samenvoegen.
        setStateRaw((cur) => (cur === snapshot ? res.state : mergeStates(cur, res.state, snapshot.meta).state));
      }
      if (res.conflicts.length) setConflicts((c) => [...c, ...res.conflicts]);
      setCfg(res.cfg);
      setError(null);
      setStatus('idle');
    } catch (e) {
      if (e.name === 'NeedsAuthError') setStatus('needs-auth');
      else if (!navigator.onLine || e instanceof TypeError) setStatus('pending');
      else { setStatus('error'); setError(e.message); }
    } finally {
      running.current = false;
      if (again.current) { again.current = false; setTimeout(run, 500); }
    }
  }, [setStateRaw]);

  // Na een lokale wijziging: even wachten en dan synchroniseren
  useEffect(() => {
    if (!cfg || !dirty) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(run, DEBOUNCE);
    return () => clearTimeout(timer.current);
  }, [cfg, dirty, state, run]);

  // Bij opstarten, terugkomen in de app, weer online, en periodiek
  useEffect(() => {
    if (!cfg) return;
    run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    const onOnline = () => run();
    const onOffline = () => setStatus('pending');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const iv = setInterval(() => document.visibilityState === 'visible' && run(), INTERVAL);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.fileId, run]);

  // Opnieuw inloggen (vanuit een klik)
  const reauth = useCallback(async () => {
    try {
      await signIn(cfg?.email);
      setError(null);
      run();
    } catch (e) {
      setError(e.message);
    }
  }, [cfg, run]);

  const connected = useCallback((newCfg) => {
    setCfg(newCfg);
    setStatus('idle');
    setError(null);
  }, []);

  const disconnect = useCallback(async () => {
    await forgetSync();
    revoke();
    setCfg(null);
    setStatus('off');
    setConflicts([]);
    setError(null);
  }, []);

  return {
    cfg,
    status: cfg && status === 'idle' && dirty ? (navigator.onLine ? 'idle' : 'pending') : status,
    dirty,
    error,
    conflicts,
    setConflicts,
    syncNow: run,
    reauth,
    connected,
    disconnect,
  };
}

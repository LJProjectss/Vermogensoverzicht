import { useEffect, useState } from 'react';
import { Cloud, CloudAlert, CloudOff, RefreshCw } from 'lucide-react';
import { FOLDER_MIME, googleConfigured, pick, preloadGoogle, signIn, storedToken } from '../lib/gdrive.js';
import { SYNC_FILE_NAME, connectNew, finishExisting, openExisting } from '../lib/sync.js';
import { applyConflictChoice } from '../lib/stamps.js';
import { fmtEur, monthLong } from '../lib/format.js';

const fmtTime = (t) => (t ? new Date(t).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const STATUS = {
  idle: { icon: Cloud, text: 'Gesynchroniseerd', cls: 'ok' },
  syncing: { icon: RefreshCw, text: 'Bezig met synchroniseren…', cls: '' },
  pending: { icon: CloudOff, text: 'Geen internet: wijzigingen worden lokaal bewaard en later verstuurd', cls: 'warn' },
  'needs-auth': { icon: CloudAlert, text: 'Opnieuw inloggen bij Google is nodig', cls: 'warn' },
  error: { icon: CloudAlert, text: 'Synchronisatie mislukt', cls: 'error' },
};

export default function SyncPanel({ state, setState, setStateRaw, sync }) {
  const [step, setStep] = useState(null); // null | {kind:'new', folderId, folderName} | {kind:'existing', fileId, fileName} | {kind:'merge', ...}
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => preloadGoogle(), []);

  if (!googleConfigured()) {
    return (
      <section className="card">
        <h2>Synchroniseren met Google Drive</h2>
        <p className="muted">
          Nog niet ingesteld. De beheerder van deze app moet eenmalig een Google Cloud-project aanmaken en de sleutels invullen
          (zie <code>GOOGLE-DRIVE-INSTELLEN.md</code> bij de broncode).
        </p>
      </section>
    );
  }

  const reset = () => { setStep(null); setPw(''); setPw2(''); setBusy(false); };
  const fail = (e) => { setMsg({ type: 'error', text: e.message || String(e) }); setBusy(false); };

  // Stap 1: inloggen en bestand/map kiezen
  const start = async () => {
    setMsg(null);
    try {
      if (!storedToken()) await signIn(sync.cfg?.email);
      const picked = await pick();
      if (!picked) return;
      if (picked.mimeType === FOLDER_MIME) setStep({ kind: 'new', folderId: picked.id, folderName: picked.name });
      else setStep({ kind: 'existing', fileId: picked.id, fileName: picked.name });
    } catch (e) {
      fail(e);
    }
  };
  const startInRoot = async () => {
    setMsg(null);
    try {
      if (!storedToken()) await signIn();
      setStep({ kind: 'new', folderId: null, folderName: 'Mijn Drive' });
    } catch (e) {
      fail(e);
    }
  };

  const createNew = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ type: 'error', text: 'Kies een wachtwoord van minstens 8 tekens.' });
    if (pw !== pw2) return setMsg({ type: 'error', text: 'De wachtwoorden zijn niet gelijk.' });
    setBusy(true);
    setMsg(null);
    try {
      const cfg = await connectNew({ folderId: step.folderId, folderName: step.folderName, password: pw, state });
      sync.connected(cfg);
      setMsg({ type: 'ok', text: `Gekoppeld. “${cfg.fileName}” staat in ${cfg.folderName}. Kies dit bestand op je andere apparaten.` });
      reset();
    } catch (err) {
      fail(err);
    }
  };

  const openFile = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const opened = await openExisting({ fileId: step.fileId, password: pw });
      const hasLocal = state.accounts.length > 0 || Object.keys(state.months).length > 0;
      if (hasLocal) {
        setStep({ kind: 'merge', fileId: step.fileId, fileName: step.fileName, ...opened });
        setBusy(false);
      } else {
        await finish({ fileId: step.fileId, fileName: step.fileName, ...opened }, 'replace');
      }
    } catch (err) {
      fail(err);
    }
  };

  const finish = async (s, mode) => {
    setBusy(true);
    try {
      const res = await finishExisting({ fileId: s.fileId, fileName: s.fileName, key: s.key, kdf: s.kdf, remote: s.remote, local: state, mode });
      setStateRaw(res.state);
      sync.connected(res.cfg);
      if (res.conflicts.length) sync.setConflicts(res.conflicts);
      setMsg({ type: 'ok', text: `Gekoppeld met “${res.cfg.fileName}”.` });
      reset();
    } catch (err) {
      fail(err);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Synchronisatie uitzetten op dit apparaat? Je gegevens blijven hier staan en het bestand in Google Drive blijft bestaan.')) return;
    await sync.disconnect();
    setMsg({ type: 'ok', text: 'Synchronisatie uitgezet op dit apparaat.' });
  };

  const st = STATUS[sync.status];

  return (
    <section className="card">
      <h2>Synchroniseren met Google Drive</h2>
      <p className="muted">
        Bewaar een versleutelde kopie in je eigen Google Drive en werk op meerdere apparaten met dezelfde gegevens. Wijzigingen worden automatisch
        verstuurd en opgehaald; zonder internet blijven ze lokaal bewaard tot de verbinding terug is. Google kan de inhoud niet lezen: alleen jij kent het wachtwoord.
      </p>

      {msg && <div className={`banner ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}

      {sync.cfg ? (
        <>
          <dl className="kv">
            <dt>Status</dt>
            <dd className={st?.cls}>
              {st && <st.icon size={14} className={sync.status === 'syncing' ? 'spin' : ''} />} {st?.text}
              {sync.status === 'idle' && sync.dirty && ' (wijzigingen wachten)'}
            </dd>
            {sync.error && (<><dt>Melding</dt><dd className="error">{sync.error}</dd></>)}
            <dt>Bestand</dt>
            <dd>{sync.cfg.fileName}{sync.cfg.folderName ? ` in ${sync.cfg.folderName}` : ''}</dd>
            <dt>Google-account</dt>
            <dd>{sync.cfg.email || '—'}</dd>
            <dt>Laatst gesynchroniseerd</dt>
            <dd>{fmtTime(sync.cfg.lastSyncAt)}</dd>
          </dl>
          <div className="row gap wrap">
            {sync.status === 'needs-auth' ? (
              <button className="primary" onClick={sync.reauth}>Opnieuw inloggen bij Google</button>
            ) : (
              <button onClick={sync.syncNow} disabled={sync.status === 'syncing'}>Nu synchroniseren</button>
            )}
            <button className="ghost danger" onClick={disconnect}>Ontkoppelen</button>
          </div>
          <Conflicts sync={sync} state={state} setState={setState} />
        </>
      ) : !step ? (
        <>
          <ol className="steps small">
            <li>Log in bij Google en kies in Drive <strong>een map</strong> (er wordt een nieuw bestand <code>{SYNC_FILE_NAME}</code> gemaakt), of kies op een tweede apparaat <strong>het bestaande bestand</strong>.</li>
            <li>Stel een wachtwoord in (of voer het in) om het bestand te versleutelen.</li>
          </ol>
          <div className="row gap wrap">
            <button className="primary" onClick={start}>Koppel Google Drive…</button>
            <button className="ghost" onClick={startInRoot}>Nieuw bestand in hoofdmap Mijn Drive</button>
          </div>
        </>
      ) : step.kind === 'new' ? (
        <form className="stack-sm" onSubmit={createNew}>
          <p>Nieuw bestand <code>{SYNC_FILE_NAME}</code> in <strong>{step.folderName}</strong>. Kies een wachtwoord om het te versleutelen.</p>
          <p className="warn small">Bewaar dit wachtwoord goed (bijv. in een wachtwoordmanager). Zonder wachtwoord is het bestand niet te openen en is er geen herstel mogelijk.</p>
          <div className="form-grid">
            <label className="field"><span className="small">Wachtwoord (min. 8 tekens)</span><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label className="field"><span className="small">Herhaal wachtwoord</span><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label>
          </div>
          <div className="row gap wrap">
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Bezig…' : 'Bestand aanmaken'}</button>
            <button className="ghost" type="button" onClick={reset}>Annuleren</button>
          </div>
        </form>
      ) : step.kind === 'existing' ? (
        <form className="stack-sm" onSubmit={openFile}>
          <p>Bestaand bestand <strong>{step.fileName}</strong>. Voer het wachtwoord in waarmee het is versleuteld.</p>
          <label className="field"><span className="small">Wachtwoord</span><input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
          <div className="row gap wrap">
            <button className="primary" type="submit" disabled={busy || !pw}>{busy ? 'Openen…' : 'Openen'}</button>
            <button className="ghost" type="button" onClick={reset}>Annuleren</button>
          </div>
        </form>
      ) : (
        <div className="stack-sm">
          <p>
            Het bestand bevat {step.remote.accounts.length} rekeningen en {Object.keys(step.remote.months).length} maanden. Op dit apparaat staan
            {' '}{state.accounts.length} rekeningen en {Object.keys(state.months).length} maanden. Wat wil je doen?
          </p>
          <div className="row gap wrap">
            <button className="primary" disabled={busy} onClick={() => finish(step, 'merge')}>Combineren</button>
            <button disabled={busy} onClick={() => finish(step, 'replace')}>Gegevens uit Google Drive gebruiken</button>
            <button className="ghost" disabled={busy} onClick={reset}>Annuleren</button>
          </div>
          <p className="muted small">Combineren voegt beide samen; als dezelfde maand op beide plekken anders is ingevuld, kun je daarna per maand kiezen.</p>
        </div>
      )}
    </section>
  );
}

function describe(conflict, state) {
  if (conflict.kind === 'mon') return `Maand ${monthLong(conflict.key)}`;
  const acc = conflict.local || conflict.remote || state.accounts.find((a) => a.id === conflict.key);
  return `Rekening ${acc?.name || ''}`;
}

function summary(conflict, rec, state) {
  if (!rec) return 'verwijderd';
  if (conflict.kind === 'acc') return rec.name + (rec.archived ? ' (gearchiveerd)' : '');
  let net = 0;
  for (const [id, v] of Object.entries(rec.values)) {
    const a = state.accounts.find((x) => x.id === id);
    net += a && ['hypotheek', 'studieschuld', 'lening', 'schuld_overig'].includes(a.type) ? -v : v;
  }
  return `netto ${fmtEur(net)}${rec.note ? ` · “${rec.note}”` : ''}`;
}

function Conflicts({ sync, state, setState }) {
  if (!sync.conflicts.length) return null;
  const choose = (c, choice) => {
    if (choice !== c.chosen) setState((s) => applyConflictChoice(s, c, choice));
    sync.setConflicts((list) => list.filter((x) => x !== c));
  };
  return (
    <div className="conflicts">
      <h3>Conflicten ({sync.conflicts.length})</h3>
      <p className="muted small">Deze onderdelen zijn op twee apparaten verschillend gewijzigd. De nieuwste versie is gebruikt; kies per regel welke je wilt houden.</p>
      {sync.conflicts.map((c, i) => (
        <div className="conflict-row" key={`${c.kind}:${c.key}:${i}`}>
          <strong>{describe(c, state)}</strong>
          <button className={c.chosen === 'local' ? 'small primary' : 'small'} onClick={() => choose(c, 'local')}>
            Dit apparaat ({fmtTime(c.localTime)}): {summary(c, c.local, state)}
          </button>
          <button className={c.chosen === 'remote' ? 'small primary' : 'small'} onClick={() => choose(c, 'remote')}>
            Ander apparaat ({fmtTime(c.remoteTime)}): {summary(c, c.remote, state)}
          </button>
        </div>
      ))}
    </div>
  );
}

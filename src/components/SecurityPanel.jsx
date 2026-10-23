import { useEffect, useState } from 'react';
import { disableLock, enableLock, isLockEnabled, persistStatus, requestPersist } from '../lib/storage.js';

export function PinPanel({ state, onLockChange }) {
  const [on, setOn] = useState(isLockEnabled);
  const [mode, setMode] = useState(null); // null | 'set'
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const clean = (v) => v.replace(/\D/g, '').slice(0, 12);

  const save = async (e) => {
    e.preventDefault();
    if (pin.length < 4) return setMsg({ type: 'error', text: 'Gebruik minstens 4 cijfers (6 of meer is veiliger).' });
    if (pin !== pin2) return setMsg({ type: 'error', text: 'De pincodes zijn niet gelijk.' });
    setBusy(true);
    try {
      await enableLock(pin, state);
      setOn(true);
      setMode(null);
      setPin('');
      setPin2('');
      setMsg({ type: 'ok', text: 'Pincode ingesteld. Je gegevens staan nu versleuteld op dit apparaat.' });
      onLockChange();
    } catch (err) {
      setMsg({ type: 'error', text: `Instellen mislukt: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    if (!window.confirm('Pincode uitzetten? Je gegevens worden dan weer onversleuteld in deze browser bewaard.')) return;
    disableLock(state);
    setOn(false);
    setMsg({ type: 'ok', text: 'Pincode uitgezet.' });
    onLockChange();
  };

  return (
    <section className="card">
      <h2>Pincode</h2>
      <p className="muted">
        Met een pincode worden je gegevens versleuteld opgeslagen op dit apparaat en vraagt de app bij het openen (en na 5 minuten op de achtergrond) om de pincode.
        Vergeet je de pincode, dan kun je de gegevens op dit apparaat alleen wissen en een back-up of Google Drive-kopie terugzetten.
      </p>
      {msg && <div className={`banner ${msg.type === 'error' ? 'error' : 'ok'}`}>{msg.text}</div>}
      {mode === 'set' ? (
        <form className="stack-sm" onSubmit={save}>
          <div className="form-grid">
            <label className="field"><span className="small">{on ? 'Nieuwe pincode' : 'Pincode'} (4–12 cijfers)</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(clean(e.target.value))} autoFocus />
            </label>
            <label className="field"><span className="small">Herhaal pincode</span>
              <input type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(clean(e.target.value))} />
            </label>
          </div>
          <div className="row gap wrap">
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Versleutelen…' : 'Opslaan'}</button>
            <button className="ghost" type="button" onClick={() => { setMode(null); setMsg(null); }}>Annuleren</button>
          </div>
        </form>
      ) : (
        <div className="row gap wrap">
          <span className={on ? 'up small' : 'muted small'}>{on ? '✓ Pincode staat aan' : 'Pincode staat uit'}</span>
          <button onClick={() => { setMode('set'); setMsg(null); }}>{on ? 'Pincode wijzigen' : 'Pincode instellen'}</button>
          {on && <button className="ghost danger" onClick={turnOff}>Pincode uitzetten</button>}
        </div>
      )}
    </section>
  );
}

export function StoragePanel() {
  const [status, setStatus] = useState('checking');
  useEffect(() => { persistStatus().then(setStatus); }, []);
  const ask = async () => setStatus(await requestPersist());
  return (
    <p className="small">
      {status === 'granted' && <span className="up">✓ De browser bewaart je gegevens blijvend (wordt niet automatisch opgeruimd).</span>}
      {status === 'not-granted' && (
        <>
          <span className="warn-text">De browser kan je gegevens opruimen bij weinig opslagruimte of lang niet gebruiken. </span>
          <button className="small" onClick={ask}>Vraag blijvende opslag aan</button>
          <span className="muted block">Tip: installeer de app op je beginscherm; dan wordt dit meestal automatisch toegestaan.</span>
        </>
      )}
      {status === 'unsupported' && <span className="muted">Deze browser ondersteunt geen blijvende opslag; maak regelmatig een back-up.</span>}
    </p>
  );
}

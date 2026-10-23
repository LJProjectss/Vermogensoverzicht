import { useState } from 'react';
import { Lock, TrendingUp } from 'lucide-react';
import { unlock, wipeLocked } from '../lib/storage.js';
import { emptyState } from '../lib/model.js';
import { resetSyncBase } from '../lib/sync.js';

export default function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forgot, setForgot] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError(null);
    try {
      onUnlock(await unlock(pin));
    } catch {
      setError('Onjuiste pincode.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const wipe = () => {
    wipeLocked();
    resetSyncBase();
    onUnlock(emptyState());
  };

  return (
    <div className="lock-screen">
      <form className="lock-card card" onSubmit={submit}>
        <div className="brand lock-brand">
          <TrendingUp size={18} className="brand-icon" />
          <span>Vermogensoverzicht</span>
        </div>
        <Lock size={28} className="muted" />
        <h1>Vergrendeld</h1>
        <p className="muted small">Je gegevens zijn versleuteld op dit apparaat. Voer je pincode in.</p>
        <input
          className="pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          aria-label="Pincode"
        />
        {error && <p className="msg error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || pin.length < 4}>
          {busy ? 'Ontgrendelen…' : 'Ontgrendelen'}
        </button>
        {!forgot ? (
          <button type="button" className="ghost small" onClick={() => setForgot(true)}>Pincode vergeten?</button>
        ) : (
          <div className="warn small lock-forgot">
            <p>Zonder pincode kunnen de gegevens op dit apparaat niet worden ontsleuteld. Je kunt ze wissen en daarna een back-up terugzetten. Is Google Drive gekoppeld, dan worden je gegevens na het wissen automatisch opnieuw opgehaald.</p>
            <div className="row gap wrap">
              <button type="button" className="danger small" onClick={wipe}>Gegevens op dit apparaat wissen</button>
              <button type="button" className="ghost small" onClick={() => setForgot(false)}>Annuleren</button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

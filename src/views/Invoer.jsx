import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, catOf, isDebt, typeOf } from '../lib/model.js';
import { previousMonthKey, suspicious } from '../lib/calc.js';
import { addMonths, currentMonth, fmtEur, fmtNum, fmtSigned, monthLong, parseAmount } from '../lib/format.js';

function buildDraft(state, month) {
  const snap = state.months[month];
  if (snap) {
    return {
      existing: true,
      source: null,
      values: Object.fromEntries(Object.entries(snap.values).map(([k, v]) => [k, fmtNum(v)])),
      deposits: Object.fromEntries(Object.entries(snap.deposits || {}).map(([k, v]) => [k, fmtNum(v)])),
      note: snap.note || '',
    };
  }
  const pk = previousMonthKey(state, month);
  const values = {};
  if (pk) {
    for (const a of state.accounts) {
      if (a.archived) continue;
      const v = state.months[pk].values[a.id];
      if (v != null) values[a.id] = fmtNum(v);
    }
  }
  return { existing: false, source: pk, values, deposits: {}, note: '' };
}

export default function Invoer({ state, setState, withUndo, month, setMonth, goTab }) {
  const [draft, setDraft] = useState(() => buildDraft(state, month));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingWarn, setPendingWarn] = useState(false);

  useEffect(() => {
    setDraft(buildDraft(state, month));
    setDirty(false);
    setConfirmDelete(false);
    setPendingWarn(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // Opgeslagen maand van buitenaf veranderd (ongedaan maken, synchronisatie): formulier bijwerken
  const savedSnap = state.months[month];
  useEffect(() => {
    if (!dirty) setDraft(buildDraft(state, month));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSnap]);

  const prevKey = previousMonthKey(state, month);
  const prevSnap = prevKey ? state.months[prevKey] : null;
  const snap = state.months[month];

  const visible = state.accounts.filter((a) => !a.archived || snap?.values[a.id] != null || draft.values[a.id]);

  const parsed = useMemo(() => {
    const out = { values: {}, deposits: {}, errors: {} };
    for (const a of visible) {
      const raw = draft.values[a.id];
      if (raw != null && String(raw).trim() !== '') {
        const n = parseAmount(raw);
        if (n == null) out.errors[a.id] = true;
        else out.values[a.id] = n;
      }
      const rawD = draft.deposits[a.id];
      if (a.track && !isDebt(a) && rawD != null && String(rawD).trim() !== '') {
        const n = parseAmount(rawD);
        if (n == null) out.errors[a.id + ':d'] = true;
        else if (n !== 0) out.deposits[a.id] = n;
      }
    }
    return out;
  }, [draft, visible]);

  const net = (values) =>
    visible.reduce((s, a) => (values?.[a.id] == null ? s : s + (isDebt(a) ? -values[a.id] : values[a.id])), 0);
  const netNow = net(parsed.values);
  const netPrev = prevSnap ? net(prevSnap.values) : null;

  const warnings = visible
    .map((a) => ({ a, text: suspicious(parsed.values[a.id], prevSnap?.values[a.id]) }))
    .filter((w) => w.text);

  const change = (kind, id, value) => {
    setDraft((d) => ({ ...d, [kind]: { ...d[kind], [id]: value } }));
    setDirty(true);
    setMsg(null);
    setPendingWarn(false);
  };

  const go = (m) => {
    if (dirty && !window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch wisselen van maand?')) return;
    setMonth(m);
    setMsg(null);
  };

  const save = (force = false) => {
    if (Object.keys(parsed.errors).length) {
      setMsg({ type: 'error', text: 'Een of meer bedragen zijn ongeldig (rood gemarkeerd).' });
      return;
    }
    if (!Object.keys(parsed.values).length) {
      setMsg({ type: 'error', text: 'Vul minstens één waarde in.' });
      return;
    }
    if (warnings.length && !force) {
      setPendingWarn(true);
      setMsg(null);
      return;
    }
    setPendingWarn(false);
    setState((s) => ({
      ...s,
      months: { ...s.months, [month]: { values: parsed.values, deposits: parsed.deposits, note: draft.note.trim() } },
    }));
    setDraft((d) => ({ ...d, existing: true, source: null }));
    setDirty(false);
    setMsg({ type: 'ok', text: `${monthLong(month)} opgeslagen.` });
  };

  const remove = () => {
    withUndo(`${monthLong(month)} verwijderd.`, (s) => {
      const months = { ...s.months };
      delete months[month];
      return { ...s, months };
    });
    setConfirmDelete(false);
    setDraft(buildDraft({ ...state, months: Object.fromEntries(Object.entries(state.months).filter(([k]) => k !== month)) }, month));
    setDirty(false);
    setMsg(null);
  };

  const hasHome = visible.some((a) => a.type === 'vastgoed');
  const wozMonth = month.endsWith('-01') || month.endsWith('-02') || month.endsWith('-03');

  if (!state.accounts.length) {
    return (
      <div className="empty card">
        <h2>Nog geen rekeningen</h2>
        <p>Voeg eerst je rekeningen, beleggingen, pensioen en schulden toe.</p>
        <button className="primary" onClick={() => goTab('rekeningen')}>Naar rekeningen</button>
      </div>
    );
  }

  const future = month > currentMonth();

  return (
    <div className="stack">
      <div className="page-head"><h1>Maand invullen</h1></div>
      <div className="card">
        <div className="month-bar">
          <button className="icon-btn" aria-label="Vorige maand" onClick={() => go(addMonths(month, -1))}>‹</button>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && go(e.target.value)}
            aria-label="Maand"
          />
          <button className="icon-btn" aria-label="Volgende maand" onClick={() => go(addMonths(month, 1))}>›</button>
          <h2 className="month-title">{monthLong(month)}</h2>
          {month !== currentMonth() && (
            <button className="ghost small" onClick={() => go(currentMonth())}>Naar deze maand</button>
          )}
        </div>
        <p className="muted small status-line">
          {draft.existing
            ? '✓ Deze maand is al ingevuld; je bewerkt de opgeslagen standen.'
            : draft.source
              ? `Vooringevuld met de standen van ${monthLong(draft.source)}. Pas aan wat veranderd is en sla op.`
              : 'Nieuwe maand. Vul de standen in.'}
          {future && ' Let op: deze maand ligt in de toekomst.'}
        </p>
        {hasHome && wozMonth && (
          <p className="small tip-line">
            🏠 Begin van het jaar komt de nieuwe WOZ-waarde. Werk je woningwaarde bij; je vindt hem via{' '}
            <a href="https://www.wozwaardeloket.nl" target="_blank" rel="noopener noreferrer">wozwaardeloket.nl</a> of je gemeente.
          </p>
        )}
      </div>

      {CATEGORIES.map((c) => {
        const accs = visible.filter((a) => catOf(a) === c.id);
        if (!accs.length) return null;
        const showDeposit = accs.some((a) => a.track && !isDebt(a));
        return (
          <section className="card" key={c.id}>
            <h3 className="group-title">{c.label}</h3>
            <div className="entry-grid">
              <div className="entry-row head">
                <div className="entry-head">Rekening</div>
                <div className="entry-head num">Vorige stand</div>
                <div className="entry-head">{c.id === 'schulden' ? 'Openstaand' : 'Stand'}</div>
                <div className="entry-head num">Verschil</div>
                <div className="entry-head">{showDeposit ? 'Netto inleg' : ''}</div>
              </div>
              {accs.map((a) => {
                const pv = prevSnap?.values[a.id];
                const v = parsed.values[a.id];
                const d = parsed.deposits[a.id] || 0;
                const diff = v != null && pv != null ? v - pv : null;
                const tracked = a.track && !isDebt(a);
                return (
                  <div className="entry-row" key={a.id}>
                    <div className="entry-name">
                      <strong>{a.name}</strong>
                      <span className="muted small">{typeOf(a).label}{a.archived ? ' · gearchiveerd' : ''}</span>
                    </div>
                    <div className="num muted entry-prev" data-label="Vorige">{pv != null ? fmtEur(pv) : '—'}</div>
                    <div className="entry-input" data-label={c.id === 'schulden' ? 'Openstaand' : 'Stand'}>
                      <div className={`money ${parsed.errors[a.id] ? 'invalid' : ''}`}>
                        <span>€</span>
                        <input
                          inputMode="decimal"
                          value={draft.values[a.id] ?? ''}
                          placeholder="0"
                          onChange={(e) => change('values', a.id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                        />
                      </div>
                    </div>
                    <div className="num entry-diff" data-label="Verschil">
                      {diff == null ? <span className="muted">—</span> : (
                        <>
                          <span className={diff * (isDebt(a) ? -1 : 1) > 0.5 ? 'up' : diff * (isDebt(a) ? -1 : 1) < -0.5 ? 'down' : 'muted'}>
                            {fmtSigned(diff)}
                          </span>
                          {tracked && <span className="muted small block">rendement {fmtSigned(diff - d)}</span>}
                        </>
                      )}
                      {(() => {
                        const w = suspicious(v, pv);
                        return w ? <span className="typo-warn small block">⚠ {w}</span> : null;
                      })()}
                    </div>
                    {showDeposit ? (
                      <div className="entry-input" data-label="Netto inleg">
                        {tracked ? (
                          <div className={`money ${parsed.errors[a.id + ':d'] ? 'invalid' : ''}`}>
                            <span>€</span>
                            <input
                              inputMode="decimal"
                              value={draft.deposits[a.id] ?? ''}
                              placeholder="0"
                              onChange={(e) => change('deposits', a.id, e.target.value)}
                              onFocus={(e) => e.target.select()}
                            />
                          </div>
                        ) : <span className="muted small">—</span>}
                      </div>
                    ) : <div className="entry-spacer" />}
                  </div>
                );
              })}
            </div>
            {showDeposit && (
              <p className="muted small explain">
                Netto inleg = wat je deze maand hebt gestort min wat je hebt opgenomen (opname = negatief bedrag). Het restant van het verschil is rendement.
              </p>
            )}
          </section>
        );
      })}

      <section className="card">
        <label className="field">
          <span>Notitie bij deze maand <span className="muted small">(bijv. “bonus ontvangen”, “auto gekocht”; verschijnt als markering in de grafiek)</span></span>
          <textarea
            rows={2}
            value={draft.note}
            onChange={(e) => { setDraft((d) => ({ ...d, note: e.target.value })); setDirty(true); setMsg(null); }}
          />
        </label>
      </section>

      {pendingWarn && warnings.length > 0 && (
        <div className="banner warn-banner">
          <span>
            Klopt dit? {warnings.map((w) => `${w.a.name}: ${w.text}`).join('; ')}. Misschien een cijfer te veel of te weinig.
          </span>
          <span className="row gap">
            <button className="primary small" onClick={() => save(true)}>Toch opslaan</button>
            <button className="ghost small" onClick={() => setPendingWarn(false)}>Aanpassen</button>
          </span>
        </div>
      )}

      <div className="save-bar card">
        <div>
          <div className="muted small">Netto vermogen {monthLong(month)}</div>
          <div className="save-net">
            {fmtEur(netNow)}
            {netPrev != null && <span className="muted small"> ({fmtSigned(netNow - netPrev)} t.o.v. {monthLong(prevKey)})</span>}
          </div>
        </div>
        <div className="row gap wrap">
          {msg && <span className={msg.type === 'error' ? 'msg error' : 'msg ok'}>{msg.text}</span>}
          {snap && !confirmDelete && <button className="ghost danger" onClick={() => setConfirmDelete(true)}>Maand verwijderen</button>}
          {confirmDelete && (
            <>
              <span className="small">Zeker weten?</span>
              <button className="danger" onClick={remove}>Ja, verwijderen</button>
              <button className="ghost" onClick={() => setConfirmDelete(false)}>Annuleren</button>
            </>
          )}
          <button className="primary" onClick={() => save()} disabled={!dirty && draft.existing}>
            {draft.existing ? (dirty ? 'Wijzigingen opslaan' : 'Opgeslagen') : 'Maand opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

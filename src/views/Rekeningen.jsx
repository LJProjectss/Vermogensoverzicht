import { useState } from 'react';
import { CATEGORIES, TYPES, catOf, isDebt, makeAccount, typeOf } from '../lib/model.js';

const TYPE_GROUPS = CATEGORIES.map((c) => ({
  ...c,
  types: Object.entries(TYPES).filter(([, t]) => t.cat === c.id),
}));

function TypeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {TYPE_GROUPS.map((g) => (
        <optgroup key={g.id} label={g.label}>
          {g.types.map(([id, t]) => (
            <option key={id} value={id}>{t.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function Rekeningen({ state, setState, withUndo, goInvoer }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('betaal');
  const [showArchived, setShowArchived] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const usedIds = new Set(Object.values(state.months).flatMap((m) => Object.keys(m.values)));

  const update = (id, patch) =>
    setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));

  const changeType = (a, t) => {
    // Pas de standaardinstellingen mee aan bij typewissel
    update(a.id, { type: t, liquid: TYPES[t].liquid, track: TYPES[t].track });
  };

  const move = (id, dir) =>
    setState((s) => {
      const list = [...s.accounts];
      const i = list.findIndex((a) => a.id === id);
      const cat = catOf(list[i]);
      let j = i + dir;
      while (j >= 0 && j < list.length && catOf(list[j]) !== cat) j += dir;
      if (j < 0 || j >= list.length) return s;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...s, accounts: list };
    });

  const remove = (id) => {
    const name = state.accounts.find((a) => a.id === id)?.name || 'Rekening';
    withUndo(`“${name}” verwijderd.`, (s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== id) }));
    setConfirmId(null);
  };

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setState((s) => ({ ...s, accounts: [...s.accounts, makeAccount(name, type)] }));
    setName('');
  };

  const active = state.accounts.filter((a) => !a.archived);
  const archived = state.accounts.filter((a) => a.archived);

  const renderRow = (a) => {
    const debt = isDebt(a);
    const used = usedIds.has(a.id);
    return (
      <div className={`acc-row ${a.archived ? 'archived' : ''}`} key={a.id}>
        <div className="acc-main">
          <input className="acc-name" value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} aria-label="Naam" />
          <TypeSelect value={a.type} onChange={(t) => changeType(a, t)} />
        </div>
        <div className="acc-flags">
          <label className="check" title="Telt mee in 'Alleen vrij besteedbaar'">
            <input type="checkbox" checked={a.liquid} onChange={(e) => update(a.id, { liquid: e.target.checked })} />
            Vrij besteedbaar
          </label>
          {!debt && (
            <label className="check" title="Houd per maand je inleg bij, zodat inleg en rendement gescheiden worden">
              <input type="checkbox" checked={a.track} onChange={(e) => update(a.id, { track: e.target.checked })} />
              Rendement volgen
            </label>
          )}
          <label className="check" title="Telt deze rekening mee voor de Box 3-indicatie (vermogen op 1 januari)?">
            Box 3
            <select className="small-select" value={a.box3 || 'auto'} onChange={(e) => update(a.id, { box3: e.target.value })}>
              <option value="auto">Automatisch ({typeOf(a).box3 ? 'telt mee' : 'telt niet mee'})</option>
              <option value="ja">Telt mee</option>
              <option value="nee">Telt niet mee</option>
            </select>
          </label>
        </div>
        <div className="acc-actions">
          {!a.archived && (
            <>
              <button className="icon-btn" aria-label="Omhoog" onClick={() => move(a.id, -1)}>↑</button>
              <button className="icon-btn" aria-label="Omlaag" onClick={() => move(a.id, 1)}>↓</button>
            </>
          )}
          {a.archived ? (
            <button className="ghost small" onClick={() => update(a.id, { archived: false })}>Terugzetten</button>
          ) : (
            <button className="ghost small" onClick={() => update(a.id, { archived: true })} title="Verbergen bij nieuwe maanden; historie blijft bewaard">
              Archiveren
            </button>
          )}
          {confirmId === a.id ? (
            <>
              <button className="danger small" onClick={() => remove(a.id)}>Definitief verwijderen</button>
              <button className="ghost small" onClick={() => setConfirmId(null)}>Annuleren</button>
            </>
          ) : (
            <button
              className="ghost small danger"
              onClick={() => setConfirmId(a.id)}
              title={used ? 'Let op: deze rekening heeft historie. Archiveren is meestal beter.' : 'Verwijderen'}
            >
              Verwijderen
            </button>
          )}
        </div>
        {confirmId === a.id && used && (
          <p className="warn small">Deze rekening heeft ingevulde maanden. Bij verwijderen verdwijnt hij uit je historie en verandert je grafiek. Archiveer hem liever als je de rekening hebt opgeheven.</p>
        )}
      </div>
    );
  };

  return (
    <div className="stack">
      <div className="page-head"><h1>Rekeningen</h1></div>
      <section className="card">
        <h2>Rekening toevoegen</h2>
        <form className="add-form" onSubmit={add}>
          <input placeholder="Naam, bijv. ‘ING spaarrekening’" value={name} onChange={(e) => setName(e.target.value)} />
          <TypeSelect value={type} onChange={setType} />
          <button className="primary" type="submit" disabled={!name.trim()}>Toevoegen</button>
        </form>
        <p className="muted small explain">
          Schulden vul je later in als positief bedrag (openstaand saldo); ze worden automatisch afgetrokken.
          Heb je een rekening opgeheven? Zet de laatste stand op €0 en archiveer hem, dan blijft je historie kloppen.
        </p>
      </section>

      {CATEGORIES.map((c) => {
        const list = active.filter((a) => catOf(a) === c.id);
        if (!list.length) return null;
        return (
          <section className="card" key={c.id}>
            <h3 className="group-title">{c.label}</h3>
            {list.map(renderRow)}
          </section>
        );
      })}

      {archived.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3 className="group-title">Gearchiveerd ({archived.length})</h3>
            <button className="ghost small" onClick={() => setShowArchived((v) => !v)}>{showArchived ? 'Verberg' : 'Toon'}</button>
          </div>
          {showArchived && archived.map(renderRow)}
        </section>
      )}

      {active.length > 0 && (
        <div className="row end">
          <button className="primary" onClick={() => goInvoer()}>Maand invullen →</button>
        </div>
      )}
    </div>
  );
}

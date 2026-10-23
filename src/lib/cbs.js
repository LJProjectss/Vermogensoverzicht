import { useEffect, useState } from 'react';

// Consumentenprijsindex (CPI, alle bestedingen) van het CBS via de open data-koppeling (StatLine OData).
//   86141NED: CPI 2025=100, vanaf december 2009 (actueel)
//   83131NED: CPI 2015=100, 1996-2025 (afgesloten) - gebruikt voor oudere maanden,
//             omgerekend naar 2025=100 via de overlapmaand.
// De reeks wordt lokaal bewaard, zodat inflatiecorrectie ook offline werkt.

const BASE = 'https://opendata.cbs.nl/ODataApi/odata';
const TABLES = { current: '86141NED', old: '83131NED' };
const CACHE_KEY = 'vermogensoverzicht.cpi';
const MAX_AGE = 3 * 86400000; // CBS publiceert maandelijks; elke paar dagen verversen is ruim voldoende

async function fetchTable(table) {
  const filter = encodeURIComponent("Bestedingscategorieen eq 'T001112  ' and substringof('MM',Perioden)");
  const res = await fetch(`${BASE}/${table}/TypedDataSet?$filter=${filter}&$select=Perioden,CPI_1&$format=json`);
  if (!res.ok) throw new Error(`CBS gaf foutcode ${res.status}`);
  const json = await res.json();
  const out = {};
  for (const r of json.value || []) {
    const m = /^(\d{4})MM(\d{2})$/.exec(r.Perioden);
    if (m && Number.isFinite(r.CPI_1) && r.CPI_1 > 0) out[`${m[1]}-${m[2]}`] = r.CPI_1;
  }
  return out;
}

export async function fetchCpi() {
  const [cur, old] = await Promise.all([fetchTable(TABLES.current), fetchTable(TABLES.old).catch(() => ({}))]);
  const curKeys = Object.keys(cur).sort();
  if (!curKeys.length) throw new Error('Geen CPI-cijfers ontvangen van het CBS.');
  const series = { ...cur };
  const overlap = curKeys.find((k) => old[k]);
  if (overlap) {
    const f = cur[overlap] / old[overlap];
    for (const [k, v] of Object.entries(old)) if (k < curKeys[0]) series[k] = Math.round(v * f * 1000) / 1000;
  }
  const keys = Object.keys(series).sort();
  return { series, first: keys[0], latest: keys[keys.length - 1], fetchedAt: new Date().toISOString(), source: `CBS ${TABLES.current}` };
}

export function loadCpiCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    return c?.series ? c : null;
  } catch {
    return null;
  }
}

// Haalt de CPI op als `enabled`; gebruikt de lokale kopie en ververst die als hij oud is.
export function useCpi(enabled) {
  const [cpi, setCpi] = useState(loadCpiCache);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    const fresh = cpi && Date.now() - new Date(cpi.fetchedAt).getTime() < MAX_AGE;
    if (fresh || !navigator.onLine) return;
    let cancelled = false;
    setStatus('loading');
    fetchCpi()
      .then((c) => {
        if (cancelled) return;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* opslag vol */ }
        setCpi(c);
        setStatus('idle');
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus('error');
        setError(e.message || 'Ophalen mislukt');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { cpi, status, error };
}

// Index voor maand m; buiten de reeks de dichtstbijzijnde bekende maand.
export function cpiAt(cpi, m) {
  if (!cpi) return null;
  if (cpi.series[m]) return cpi.series[m];
  if (m > cpi.latest) return cpi.series[cpi.latest];
  if (m < cpi.first) return cpi.series[cpi.first];
  const keys = Object.keys(cpi.series).filter((k) => k <= m).sort();
  return cpi.series[keys[keys.length - 1]];
}

// Factor om een bedrag uit maand m om te rekenen naar euro's van refMonth.
export function inflationFactor(cpi, m, refMonth) {
  const a = cpiAt(cpi, m);
  const b = cpiAt(cpi, refMonth);
  return a && b ? b / a : 1;
}

// Rekent een reeks maandrijen (uit buildSeries) om naar euro's van de laatste maand.
export function deflateRows(rows, cpi) {
  if (!cpi || !rows.length) return rows;
  const ref = rows[rows.length - 1].month;
  const LEVEL = ['cash', 'beleggingen', 'pensioen', 'bezit', 'schulden', 'debtsNeg', 'assets', 'debts', 'net', 'trackedValue'];
  let prev = null;
  let cumDeposit = 0;
  let cumReturn = 0;
  return rows.map((r) => {
    const f = inflationFactor(cpi, r.month, ref);
    const out = { ...r, factor: f };
    for (const k of LEVEL) out[k] = r[k] * f;
    out.deposit = r.deposit * f;
    out.ret = r.ret * f;
    cumDeposit += out.deposit;
    cumReturn += out.ret;
    out.cumDeposit = cumDeposit;
    out.cumReturn = cumReturn;
    out.delta = prev ? out.net - prev.net : null;
    out.deltaPct = prev && prev.net > 0 ? out.delta / prev.net : null;
    out.other = out.delta != null ? out.delta - out.ret : null;
    prev = out;
    return out;
  });
}

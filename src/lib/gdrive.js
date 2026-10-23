// Google Drive-koppeling, volledig in de browser:
//   - inloggen met Google Identity Services (token-model, scope drive.file: de app ziet alleen
//     bestanden die hij zelf heeft gemaakt of die jij in de bestandskiezer aanwijst)
//   - bestand of map kiezen met de Google Picker
//   - lezen en schrijven via de Drive REST API v3
//
// Instellen: zie GOOGLE-DRIVE-INSTELLEN.md. De waarden komen uit .env (VITE_GOOGLE_*).

const env = import.meta.env || {};
export const GOOGLE = {
  clientId: env.VITE_GOOGLE_CLIENT_ID || '',
  apiKey: env.VITE_GOOGLE_API_KEY || '',
  appId: env.VITE_GOOGLE_APP_ID || '',
};
export const googleConfigured = () => !!(GOOGLE.clientId && GOOGLE.apiKey && GOOGLE.appId);

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'vermogensoverzicht.gtoken';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class NeedsAuthError extends Error {
  constructor() {
    super('Opnieuw inloggen bij Google is nodig.');
    this.name = 'NeedsAuthError';
  }
}
export class NotFoundError extends Error {
  constructor() {
    super('Het bestand is niet (meer) gevonden in Google Drive.');
    this.name = 'NotFoundError';
  }
}

const scripts = {};
function loadScript(src) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => {
        delete scripts[src];
        reject(new Error('Kon Google niet laden. Controleer je internetverbinding.'));
      };
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

// Vooraf laden, zodat het inlogvenster direct bij de klik opent (anders blokkeert vooral Safari de pop-up).
export function preloadGoogle() {
  if (!googleConfigured()) return;
  loadScript('https://accounts.google.com/gsi/client').catch(() => {});
  loadScript('https://apis.google.com/js/api.js').catch(() => {});
}

// ---------- Token ----------
export function storedToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
    return t && t.expiresAt > Date.now() + 60000 ? t.accessToken : null;
  } catch {
    return null;
  }
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

let tokenClient = null;
// Moet vanuit een klik worden aangeroepen (Google opent een pop-up).
export async function signIn(hint) {
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise((resolve, reject) => {
    const handle = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || 'Inloggen bij Google is mislukt.'));
      const expiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000;
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: resp.access_token, expiresAt }));
      resolve(resp.access_token);
    };
    const onError = (err) =>
      reject(new Error(err?.type === 'popup_closed' ? 'Inloggen afgebroken.' : 'Het inlogvenster kon niet openen. Sta pop-ups toe voor deze site.'));
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: GOOGLE.clientId, scope: SCOPE, callback: handle, error_callback: onError });
    } else {
      tokenClient.callback = handle;
      tokenClient.error_callback = onError;
    }
    tokenClient.requestAccessToken({ prompt: hint ? '' : 'consent', login_hint: hint || undefined });
  });
}

export function revoke() {
  const t = storedToken();
  clearToken();
  if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
}

// ---------- REST ----------
async function api(url, opts = {}) {
  const token = storedToken();
  if (!token) throw new NeedsAuthError();
  const res = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
  if (res.status === 401) {
    clearToken();
    throw new NeedsAuthError();
  }
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) {
    let msg = `Google Drive gaf foutcode ${res.status}`;
    try { msg = (await res.json()).error?.message || msg; } catch { /* geen json */ }
    throw new Error(msg);
  }
  return res;
}

export async function userEmail() {
  const r = await api(`${API}/about?fields=user(emailAddress)`);
  return (await r.json()).user?.emailAddress || null;
}

export async function getMeta(id) {
  const r = await api(`${API}/files/${id}?fields=id,name,version,modifiedTime,trashed,parents`);
  const meta = await r.json();
  if (meta.trashed) throw new NotFoundError();
  return meta;
}

export async function download(id) {
  const r = await api(`${API}/files/${id}?alt=media`);
  return r.text();
}

export async function createFile(name, parentId, content) {
  const boundary = 'vmo' + Math.random().toString(36).slice(2);
  const metadata = { name, mimeType: 'application/json', ...(parentId ? { parents: [parentId] } : {}) };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id,name,version`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return r.json();
}

export async function updateFile(id, content) {
  const r = await api(`${UPLOAD}/files/${id}?uploadType=media&fields=id,name,version`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  });
  return r.json();
}

// ---------- Bestandskiezer ----------
// Geeft { id, name, mimeType } terug, of null als de gebruiker annuleert.
export async function pick() {
  const token = storedToken();
  if (!token) throw new NeedsAuthError();
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise((resolve) => window.gapi.load('picker', resolve));
  const { picker } = window.google;
  return new Promise((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(`application/json,${FOLDER_MIME}`)
      .setMode(picker.DocsViewMode.LIST);
    const p = new picker.PickerBuilder()
      .setTitle('Kies een map voor een nieuw bestand, of een bestaand synchronisatiebestand')
      .setLocale('nl')
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE.apiKey)
      .setAppId(GOOGLE.appId)
      .setOrigin(window.location.origin)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) {
          const d = data.docs[0];
          resolve({ id: d.id, name: d.name, mimeType: d.mimeType });
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    p.setVisible(true);
  });
}

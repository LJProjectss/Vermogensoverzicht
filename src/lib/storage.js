import { emptyState, normalizeState } from './model.js';
import { decryptJson, deriveKey, encryptJson, newKdf } from './crypto.js';

const KEY = 'vermogensoverzicht.v1';
const LOCKED_KEY = 'vermogensoverzicht.v1.locked';
const THEME_KEY = 'vermogensoverzicht.theme';

// Met pincode staat de data versleuteld in LOCKED_KEY; de sleutel bestaat alleen in het geheugen
// zolang de app ontgrendeld is.
let lockKey = null;
let lockKdf = null;
let writeChain = Promise.resolve(true);

export const isLockEnabled = () => localStorage.getItem(LOCKED_KEY) != null;

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

// Gooit een fout bij een verkeerde pincode.
export async function unlock(pin) {
  const env = JSON.parse(localStorage.getItem(LOCKED_KEY));
  const key = await deriveKey(pin, env.kdf.salt, env.kdf.iterations);
  const data = await decryptJson(key, env);
  lockKey = key;
  lockKdf = env.kdf;
  return normalizeState(data);
}

async function writeLocked(state) {
  const env = await encryptJson(lockKey, state, lockKdf);
  localStorage.setItem(LOCKED_KEY, JSON.stringify(env));
}

export async function enableLock(pin, state) {
  lockKdf = newKdf();
  lockKey = await deriveKey(pin, lockKdf.salt, lockKdf.iterations);
  await writeLocked(state);
  localStorage.removeItem(KEY);
}

export function disableLock(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
  localStorage.removeItem(LOCKED_KEY);
  lockKey = null;
  lockKdf = null;
}

// Pincode vergeten: versleutelde data wissen
export function wipeLocked() {
  localStorage.removeItem(LOCKED_KEY);
  localStorage.removeItem(KEY);
  lockKey = null;
}

// Geeft een Promise<boolean> (gelukt). Schrijfacties lopen op volgorde.
export function saveState(state) {
  writeChain = writeChain.then(async () => {
    try {
      if (lockKey) await writeLocked(state);
      else localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  });
  return writeChain;
}

// Thema los bewaren, zodat ook het vergrendelscherm in het juiste thema verschijnt.
export const loadThemePref = () => {
  try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
};
export const saveThemePref = (t) => {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* geen opslag */ }
};

// Vraag de browser de opslag niet automatisch op te ruimen (bijv. Safari na 7 dagen niet gebruiken).
export async function persistStatus() {
  if (!navigator.storage?.persisted) return 'unsupported';
  return (await navigator.storage.persisted()) ? 'granted' : 'not-granted';
}
export async function requestPersist() {
  if (!navigator.storage?.persist) return 'unsupported';
  return (await navigator.storage.persist()) ? 'granted' : 'not-granted';
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

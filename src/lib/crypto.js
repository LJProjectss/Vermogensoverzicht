// Versleuteling met de Web Crypto API: AES-GCM 256, sleutel afgeleid uit een wachtwoord
// of pincode met PBKDF2-SHA-256. Sleutels zijn niet-exporteerbaar.

const ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const toB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
export const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export const randomSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

export async function deriveKey(password, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Envelop: { app, format, kdf: { salt, iterations }, iv, data }
export async function encryptJson(key, obj, kdf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { app: 'vermogensoverzicht', format: 1, kdf, iv: toB64(iv), data: toB64(data) };
}

// Gooit een fout bij een verkeerde sleutel (GCM-authenticatie faalt).
export async function decryptJson(key, envelope) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) }, key, fromB64(envelope.data));
  return JSON.parse(dec.decode(plain));
}

export function isEnvelope(obj) {
  return !!obj && obj.app === 'vermogensoverzicht' && obj.format === 1 && obj.kdf?.salt && obj.iv && obj.data;
}

export function newKdf() {
  return { salt: randomSalt(), iterations: ITERATIONS };
}

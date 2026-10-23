import { SYNCED_SETTINGS, normalizeState } from './model.js';
import { decryptJson, deriveKey, encryptJson, isEnvelope, newKdf } from './crypto.js';
import { idbDel, idbGet, idbSet } from './idb.js';
import { createFile, download, getMeta, updateFile, userEmail } from './gdrive.js';
import { fingerprint, mergeStates } from './stamps.js';

// Synchronisatie met één versleuteld bestand in Google Drive.
//
// Werkwijze:
//   - Dit apparaat is altijd de hoofdopslag; de app werkt dus ook offline.
//   - Na een wijziging (en bij opstarten, terugkeren naar de app, of weer online komen)
//     wordt het bestand opgehaald als het in Drive is veranderd, samengevoegd, en zo nodig
//     teruggeschreven.
//   - Zonder internet blijft "wijzigingen wachten" staan tot de verbinding terug is.
//   - Het bestand is versleuteld met een wachtwoord dat alleen de gebruiker kent. De afgeleide
//     sleutel blijft niet-exporteerbaar in IndexedDB op dit apparaat.

const CFG_KEY = 'vermogensoverzicht.sync';
const KEY_ID = 'syncKey';
export const SYNC_FILE_NAME = 'vermogensoverzicht-sync.json';

export function loadSyncConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY)) || null;
  } catch {
    return null;
  }
}
export function saveSyncConfig(cfg) {
  if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CFG_KEY);
}

// Na het wissen van lokale gegevens (pincode vergeten): de volgende ronde haalt de cloudversie
// opnieuw op in plaats van de lege lokale stand te uploaden.
export function resetSyncBase() {
  const cfg = loadSyncConfig();
  if (cfg) saveSyncConfig({ ...cfg, remoteVersion: null, baseMeta: null, lastFingerprint: null });
}

export async function forgetSync() {
  saveSyncConfig(null);
  await idbDel(KEY_ID);
}

const getKey = () => idbGet(KEY_ID);

async function encryptState(key, kdf, state) {
  return JSON.stringify(await encryptJson(key, state, kdf));
}

// Leest en ontsleutelt het bestand. Gooit een fout bij een verkeerd wachtwoord of geen geldig bestand.
async function readRemote(fileId, key) {
  const text = await download(fileId);
  let env;
  try {
    env = JSON.parse(text);
  } catch {
    throw new Error('Dit bestand is geen synchronisatiebestand van Vermogensoverzicht.');
  }
  if (!isEnvelope(env)) throw new Error('Dit bestand is geen synchronisatiebestand van Vermogensoverzicht.');
  return { env, state: key ? normalizeState(await decryptJson(key, env)) : null };
}

// Nieuw bestand aanmaken in een map (folderId null = hoofdmap van Mijn Drive).
export async function connectNew({ folderId, folderName, password, state }) {
  const kdf = newKdf();
  const key = await deriveKey(password, kdf.salt, kdf.iterations);
  const file = await createFile(SYNC_FILE_NAME, folderId, await encryptState(key, kdf, state));
  await idbSet(KEY_ID, key);
  const cfg = {
    fileId: file.id,
    fileName: file.name,
    folderName: folderName || 'Mijn Drive',
    email: await userEmail().catch(() => null),
    kdf,
    remoteVersion: file.version,
    baseMeta: state.meta,
    lastFingerprint: fingerprint(state),
    lastSyncAt: new Date().toISOString(),
  };
  saveSyncConfig(cfg);
  return cfg;
}

// Bestaand bestand openen: controleert het wachtwoord en geeft de cloudversie terug.
export async function openExisting({ fileId, password }) {
  const { env } = await readRemote(fileId, null);
  const key = await deriveKey(password, env.kdf.salt, env.kdf.iterations);
  let remote;
  try {
    remote = normalizeState(await decryptJson(key, env));
  } catch {
    throw new Error('Onjuist wachtwoord voor dit bestand.');
  }
  return { key, kdf: env.kdf, remote };
}

// Koppeling afronden na openExisting. mode: 'merge' (combineren) of 'replace' (cloudversie gebruiken).
export async function finishExisting({ fileId, fileName, key, kdf, remote, local, mode }) {
  const result = mode === 'replace' ? { state: { ...remote, settings: { ...local.settings, ...pickSynced(remote) } }, conflicts: [] } : mergeStates(local, remote, null);
  const meta = await getMeta(fileId);
  let version = meta.version;
  if (fingerprint(result.state) !== fingerprint(remote)) {
    const saved = await updateFile(fileId, await encryptState(key, kdf, result.state));
    version = saved.version;
  }
  await idbSet(KEY_ID, key);
  const cfg = {
    fileId,
    fileName: fileName || meta.name,
    folderName: null,
    email: await userEmail().catch(() => null),
    kdf,
    remoteVersion: version,
    baseMeta: result.state.meta,
    lastFingerprint: fingerprint(result.state),
    lastSyncAt: new Date().toISOString(),
  };
  saveSyncConfig(cfg);
  return { cfg, state: result.state, conflicts: result.conflicts };
}

function pickSynced(s) {
  return Object.fromEntries(SYNCED_SETTINGS.filter((k) => s.settings[k] !== undefined).map((k) => [k, s.settings[k]]));
}

// Eén synchronisatieronde. Geeft { state (samengevoegd, of null als lokaal al klopt), conflicts, cfg }.
export async function syncOnce(local) {
  const cfg = loadSyncConfig();
  if (!cfg) return { state: null, conflicts: [], cfg: null };
  const key = await getKey();
  if (!key) throw new Error('De sleutel voor synchronisatie ontbreekt op dit apparaat. Koppel opnieuw.');

  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await getMeta(cfg.fileId);
    let merged = local;
    let conflicts = [];
    let remoteFp = null;

    if (String(meta.version) !== String(cfg.remoteVersion)) {
      const { state: remote } = await readRemote(cfg.fileId, key).catch((e) => {
        if (e.name === 'OperationError') throw new Error('Het cloudbestand kan niet worden ontsleuteld (is het wachtwoord elders gewijzigd?). Koppel opnieuw.');
        throw e;
      });
      ({ state: merged, conflicts } = mergeStates(local, remote, cfg.baseMeta));
      remoteFp = fingerprint(remote);
    } else {
      remoteFp = cfg.lastFingerprint;
    }

    const mergedFp = fingerprint(merged);
    let version = meta.version;
    if (mergedFp !== remoteFp) {
      // Vlak voor het schrijven nog eens controleren of een ander apparaat net heeft geschreven
      const check = await getMeta(cfg.fileId);
      if (String(check.version) !== String(meta.version)) continue;
      const saved = await updateFile(cfg.fileId, await encryptState(key, cfg.kdf, merged));
      version = saved.version;
    }

    const next = { ...cfg, remoteVersion: version, baseMeta: merged.meta, lastFingerprint: mergedFp, lastSyncAt: new Date().toISOString(), lastError: null };
    saveSyncConfig(next);
    return { state: merged === local ? null : merged, conflicts, cfg: next };
  }
  throw new Error('Het bestand werd steeds tegelijk door een ander apparaat gewijzigd. Probeer het zo opnieuw.');
}

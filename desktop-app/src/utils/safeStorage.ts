type StorageKind = 'local' | 'session';

function getStorage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function safeGetStorageItem(
  key: string,
  fallback = '',
  kind: StorageKind = 'local',
): string {
  try {
    return getStorage(kind)?.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSetStorageItem(
  key: string,
  value: string,
  kind: StorageKind = 'local',
): void {
  try {
    getStorage(kind)?.setItem(key, value);
  } catch {}
}

export function safeRemoveStorageItem(
  key: string,
  kind: StorageKind = 'local',
): void {
  try {
    getStorage(kind)?.removeItem(key);
  } catch {}
}

export function safeParseStorageJson<T>(
  key: string,
  fallback: T,
  kind: StorageKind = 'local',
): T {
  const raw = safeGetStorageItem(key, '', kind);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

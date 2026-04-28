import type { Provider } from '@/src/types/api';
import { safeSetStorageItem } from './safeStorage';

type ProviderIdentityFields = Pick<Provider, 'id' | 'baseUrl' | 'kind' | 'variant' | 'authMode'> & {
  providerKey?: string;
  providerRef?: string;
};

function base64UrlEncodeUtf8(value: string) {
  const bytes = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(value)
    : Uint8Array.from(Array.from(value).map(char => char.charCodeAt(0) & 0xff));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa !== 'function') {
    return encodeURIComponent(value).replace(/%/g, '_');
  }
  const encoded = btoa(binary);
  return encoded
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function getProviderKey(provider: ProviderIdentityFields) {
  if (provider.providerKey) return provider.providerKey;
  return [
    provider.kind ?? '',
    provider.variant ?? '',
    provider.id,
    provider.authMode ?? '',
    provider.baseUrl ?? '',
  ].join('::');
}

export function getProviderRef(provider: ProviderIdentityFields) {
  return provider.providerRef || base64UrlEncodeUtf8(getProviderKey(provider));
}

export function getStoredModelId(model: { id?: string; providerId?: string }) {
  if (!model.id) return '';
  return model.providerId ? `${model.providerId}:${model.id}` : model.id;
}

export function rememberDefaultModel(modelId?: string | null) {
  const normalized = String(modelId || '').trim();
  if (!normalized) return;
  safeSetStorageItem('default_model', normalized);
}

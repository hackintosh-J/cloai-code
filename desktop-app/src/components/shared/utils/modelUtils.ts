/**
 * Model utility functions for handling thinking models
 * Extracted from MainContent.tsx
 */

import { getStoredModelId } from '@/src/utils/providerIdentity';
import { safeParseStorageJson } from '@/src/utils/safeStorage';

/**
 * Strip -thinking suffix from model ID
 */
export function stripThinking(model: string): string {
  const normalized = model || '';
  try {
    const models = safeParseStorageJson<any[]>('chat_models', []);
    for (const m of models) {
      const baseIds = [getStoredModelId(m), m.id].filter(Boolean);
      const thinkingIds = [
        m.thinkingId ? getStoredModelId({ id: m.thinkingId, providerId: m.providerId }) : '',
        m.thinkingId,
      ].filter(Boolean);
      if (thinkingIds.includes(normalized)) {
        return baseIds[0] || normalized.replace(/-thinking$/, '');
      }
    }
  } catch {}
  return normalized.replace(/-thinking$/, '');
}

/**
 * Add -thinking suffix to model ID if thinking is enabled
 */
export function withThinking(base: string, thinking: boolean): string {
  if (!thinking) return base;
  try {
    const models = safeParseStorageJson<any[]>('chat_models', []);
    for (const m of models) {
      const baseIds = [getStoredModelId(m), m.id].filter(Boolean);
      const thinkingIds = [
        m.thinkingId ? getStoredModelId({ id: m.thinkingId, providerId: m.providerId }) : '',
        m.thinkingId,
      ].filter(Boolean);
      if (baseIds.includes(base) && thinkingIds[0]) {
        return thinkingIds[0];
      }
    }
  } catch {}
  return `${base}-thinking`;
}

/**
 * Check if model ID is a thinking model
 */
export function isThinkingModel(model: string): boolean {
  if (typeof model !== 'string') return false;
  try {
    const models = safeParseStorageJson<any[]>('chat_models', []);
    for (const m of models) {
      const thinkingIds = [
        m.thinkingId ? getStoredModelId({ id: m.thinkingId, providerId: m.providerId }) : '',
        m.thinkingId,
      ].filter(Boolean);
      if (thinkingIds.includes(model)) return true;
    }
  } catch {}
  return model.endsWith('-thinking');
}

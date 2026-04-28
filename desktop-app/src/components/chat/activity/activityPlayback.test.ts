import { describe, expect, test } from 'bun:test';
import {
  getSteadyPlaybackKind,
  getPlaybackAfterDissolve,
  shouldPlayDissolve,
  TYPING_FROZEN_FRAME,
} from '@/src/components/assistantActivityState';

describe('assistant activity state', () => {
  test('uses thinking animation while waiting', () => {
    expect(getSteadyPlaybackKind('waiting')).toBe('thinking');
  });

  test('uses typing animation while streaming', () => {
    expect(getSteadyPlaybackKind('streaming')).toBe('typing');
  });

  test('freezes on the fourth typing frame when done', () => {
    expect(getSteadyPlaybackKind('done')).toBe('typing-frozen');
    expect(TYPING_FROZEN_FRAME).toBe(3);
  });

  test('plays dissolve only when long thinking transitions into streaming', () => {
    expect(shouldPlayDissolve(null, 'streaming', true)).toBe(true);
    expect(shouldPlayDissolve('waiting', 'streaming', true)).toBe(true);
    expect(shouldPlayDissolve('streaming', 'streaming', true)).toBe(false);
    expect(shouldPlayDissolve('waiting', 'streaming', false)).toBe(false);
    expect(shouldPlayDissolve('done', 'waiting', true)).toBe(false);
  });

  test('settles into typing after dissolve while streaming', () => {
    expect(getPlaybackAfterDissolve('streaming')).toBe('typing');
  });

  test('settles back onto the frozen typing frame after replaying from done', () => {
    expect(getPlaybackAfterDissolve('done')).toBe('typing-frozen');
  });
});

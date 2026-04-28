export const LONG_THINKING_THRESHOLD_MS = 900;
export const TYPING_FROZEN_FRAME = 3;

export type AssistantActivityPhase = 'waiting' | 'streaming' | 'done';
export type AssistantPlaybackKind = 'thinking' | 'dissolve' | 'typing' | 'typing-frozen';

export function getSteadyPlaybackKind(phase: AssistantActivityPhase): Exclude<AssistantPlaybackKind, 'dissolve'> {
  if (phase === 'waiting') return 'thinking';
  if (phase === 'done') return 'typing-frozen';
  return 'typing';
}

export function shouldPlayDissolve(
  previousPhase: AssistantActivityPhase | null,
  nextPhase: AssistantActivityPhase,
  didLongThinking: boolean,
): boolean {
  return nextPhase === 'streaming' && didLongThinking && previousPhase !== 'streaming';
}

export function getPlaybackAfterDissolve(
  phase: Extract<AssistantActivityPhase, 'streaming' | 'done'>,
): Exclude<AssistantPlaybackKind, 'dissolve'> {
  return phase === 'done' ? 'typing-frozen' : 'typing';
}

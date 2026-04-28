import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DotLottieReact, type DotLottie } from '@lottiefiles/dotlottie-react';
import thinkingLottie from '@/assets/message-activity/lottie/thinking-indicator.lottie';
import typingLottie from '@/assets/message-activity/lottie/typing-indicator.lottie';
import thinkingSpriteRaw from '@/assets/message-activity/thinking-sprite.svg?raw';
import {
  getPlaybackAfterDissolve,
  getSteadyPlaybackKind,
  shouldPlayDissolve,
  TYPING_FROZEN_FRAME,
  type AssistantActivityPhase,
  type AssistantPlaybackKind,
} from '@/src/components/assistantActivityState';

type AssistantActivityIndicatorProps = {
  phase: AssistantActivityPhase;
  didLongThinking?: boolean;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean;
};

const DISSOLVE_FRAME_COUNT = 15;
const DISSOLVE_INTERVAL_MS = 52;
const SPRITE_FRAME_SIZE = 100;

const THINKING_SPRITE_PATH = thinkingSpriteRaw.match(/<path[^>]*d="([^"]+)"/)?.[1] ?? '';
const THINKING_SPRITE_FILL = thinkingSpriteRaw.match(/<path[^>]*fill="([^"]+)"/)?.[1] ?? 'rgb(217, 119, 87)';

function DissolveFrame({
  frameIndex,
  size,
  className,
  style,
}: {
  frameIndex: number;
  size: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={className}
      style={{ width: size, height: size, display: 'block', overflow: 'hidden', ...style }}
    >
      <path
        d={THINKING_SPRITE_PATH}
        fill={THINKING_SPRITE_FILL}
        transform={`translate(0 ${-frameIndex * SPRITE_FRAME_SIZE})`}
      />
    </svg>
  );
}

function useDissolvePlayback(phase: AssistantActivityPhase, didLongThinking: boolean) {
  const [kind, setKind] = useState<AssistantPlaybackKind>(() => getSteadyPlaybackKind(phase));
  const [playerKey, setPlayerKey] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const previousRef = useRef<{ phase: AssistantActivityPhase | null; didLongThinking: boolean }>({
    phase: null,
    didLongThinking,
  });

  const clearDissolve = useCallback(() => {
    if (intervalRef.current === null) return;
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const setSteadyKind = useCallback((nextKind: AssistantPlaybackKind) => {
    setKind(nextKind);
    setPlayerKey((current) => current + 1);
  }, []);

  const playDissolve = useCallback((targetPhase: Extract<AssistantActivityPhase, 'streaming' | 'done'>) => {
    clearDissolve();
    setKind('dissolve');
    setFrameIndex(0);

    let nextFrame = 0;
    intervalRef.current = window.setInterval(() => {
      nextFrame += 1;
      if (nextFrame >= DISSOLVE_FRAME_COUNT) {
        clearDissolve();
        setSteadyKind(getPlaybackAfterDissolve(targetPhase));
        return;
      }
      setFrameIndex(nextFrame);
    }, DISSOLVE_INTERVAL_MS);
  }, [clearDissolve, setSteadyKind]);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = { phase, didLongThinking };

    if (shouldPlayDissolve(previous.phase, phase, didLongThinking)) {
      playDissolve('streaming');
      return;
    }

    clearDissolve();
    const nextKind = getSteadyPlaybackKind(phase);
    if (previous.phase !== phase || previous.didLongThinking !== didLongThinking) {
      setSteadyKind(nextKind);
    }
  }, [clearDissolve, didLongThinking, phase, playDissolve, setSteadyKind]);

  useEffect(() => clearDissolve, [clearDissolve]);

  return { kind, playerKey, frameIndex, playDissolve };
}

function useFrozenTypingFrame(player: DotLottie | null, active: boolean, playerKey: number) {
  useEffect(() => {
    if (!player || !active) return;

    const freeze = () => {
      if (!player.isReady || !player.isLoaded) return;
      player.setLoop(false);
      player.pause();
      player.setFrame(TYPING_FROZEN_FRAME);
    };

    freeze();
    player.addEventListener('ready', freeze);
    player.addEventListener('load', freeze);

    return () => {
      player.removeEventListener('ready', freeze);
      player.removeEventListener('load', freeze);
    };
  }, [active, player, playerKey]);
}

const AssistantActivityIndicator: React.FC<AssistantActivityIndicatorProps> = ({
  phase,
  didLongThinking = false,
  size = 40,
  className,
  style,
  interactive = false,
}) => {
  const { kind, playerKey, frameIndex, playDissolve } = useDissolvePlayback(phase, didLongThinking);
  const [dotLottie, setDotLottie] = useState<DotLottie | null>(null);
  const frozenTyping = kind === 'typing-frozen';
  const replayable = interactive && phase === 'done' && frozenTyping;

  useFrozenTypingFrame(dotLottie, frozenTyping, playerKey);

  const wrapperStyle = useMemo<React.CSSProperties>(() => ({
    width: size,
    height: size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
    flexShrink: 0,
    ...style,
  }), [size, style]);

  const indicator = kind === 'dissolve' ? (
    <DissolveFrame frameIndex={frameIndex} size={size} />
  ) : (
    <DotLottieReact
      key={`${kind}-${playerKey}`}
      src={kind === 'thinking' ? thinkingLottie : typingLottie}
      loop={!frozenTyping}
      autoplay={!frozenTyping}
      useFrameInterpolation={!frozenTyping}
      dotLottieRefCallback={setDotLottie}
    />
  );

  if (interactive && phase === 'done') {
    return (
      <button
        type="button"
        aria-label="Replay completion animation"
        aria-disabled={kind === 'dissolve'}
        onClick={() => {
          if (replayable) playDissolve('done');
        }}
        className={className}
        style={{
          ...wrapperStyle,
          appearance: 'none',
          background: 'transparent',
          border: 0,
          padding: 0,
          margin: 0,
          cursor: replayable ? 'pointer' : 'default',
        }}
      >
        {indicator}
      </button>
    );
  }

  return (
    <span className={className} style={wrapperStyle}>
      {indicator}
    </span>
  );
};

export default AssistantActivityIndicator;

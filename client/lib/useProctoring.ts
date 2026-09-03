'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type IntegrityType =
  | 'tab_hidden'
  | 'tab_visible'
  | 'fullscreen_exit'
  | 'fullscreen_enter'
  | 'window_blur'
  | 'copy_attempt'
  | 'devtools_suspected';

interface Options {
  /** Only watch while a question is actually live. */
  enabled: boolean;
  requireFullscreen: boolean;
  onEvent: (type: IntegrityType, meta?: { hiddenMs?: number }) => void;
}

/**
 * Client-side integrity monitoring.
 *
 * Deliberate scope note: none of this is a security boundary. A determined
 * student can defeat every one of these signals with devtools, a second
 * device, or a phone camera. What it *does* do is make casual cheating
 * awkward and visible, and give the teacher a log to act on. The real
 * defences are server-side: the server owns the clock, owns the scoring, and
 * never sends a correct answer to a player before the reveal.
 */
export function useProctoring({ enabled, requireFullscreen, onEvent }: Options) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [fullscreenExits, setFullscreenExits] = useState(0);

  const hiddenSinceRef = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  const onEventRef = useRef(onEvent);
  enabledRef.current = enabled;
  onEventRef.current = onEvent;

  const enterFullscreen = useCallback(async () => {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      // Safari on iPhone has no Element.requestFullscreen at all, so the quiz
      // has to stay playable without it - we fall back to visibility tracking.
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* already out */
    }
  }, []);

  /** Some browsers expose no fullscreen API at all; do not punish those users. */
  const fullscreenSupported =
    typeof document !== 'undefined' &&
    (document.fullscreenEnabled || !!(document as any).webkitFullscreenEnabled);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(active);
      if (!enabledRef.current || !requireFullscreen) return;
      if (active) {
        onEventRef.current('fullscreen_enter');
      } else {
        setFullscreenExits((n) => n + 1);
        onEventRef.current('fullscreen_exit');
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        hiddenSinceRef.current = Date.now();
        if (enabledRef.current) {
          setTabSwitches((n) => n + 1);
          onEventRef.current('tab_hidden');
        }
      } else {
        const hiddenMs = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : undefined;
        hiddenSinceRef.current = null;
        if (enabledRef.current) onEventRef.current('tab_visible', { hiddenMs });
      }
    };

    // `blur` catches an alt-tab to another *application*, which does not always
    // fire visibilitychange on desktop. It is noisy, so it is logged but never
    // counted as a strike server-side.
    const handleBlur = () => {
      if (enabledRef.current && !document.hidden) onEventRef.current('window_blur');
    };

    const handleCopy = (e: Event) => {
      if (!enabledRef.current) return;
      e.preventDefault();
      onEventRef.current('copy_attempt');
    };

    const handleContextMenu = (e: Event) => {
      if (enabledRef.current) e.preventDefault();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);
    document.addEventListener('contextmenu', handleContextMenu);

    handleFullscreenChange();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener(
        'webkitfullscreenchange',
        handleFullscreenChange as EventListener
      );
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCopy);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [requireFullscreen]);

  /**
   * True when the student must act before they can keep playing: fullscreen is
   * required, supported, a question is live, and they are not in it.
   */
  const mustReturnToFullscreen =
    enabled && requireFullscreen && fullscreenSupported && !isFullscreen;

  return {
    isFullscreen,
    fullscreenSupported,
    mustReturnToFullscreen,
    tabSwitches,
    fullscreenExits,
    enterFullscreen,
    exitFullscreen,
  };
}

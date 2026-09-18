'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_PALETTE, DEFAULT_THEME, findTheme, normalizeAppearance, type Appearance } from './themes';

/**
 * Which theme and palette this device shows.
 *
 * Applied as `data-theme` and `data-palette` on <html>, which is all the CSS
 * needs. The inline script in the root layout sets the same attributes
 * before the first paint from the same storage key, so a Daylight device
 * never flashes Midnight; this provider takes over from there.
 */
export const APPEARANCE_KEY = 'quizarena.appearance.v1';

interface ThemeContext {
  appearance: Appearance;
  setAppearance: (next: Partial<Appearance>) => void;
}

const Ctx = createContext<ThemeContext>({
  appearance: { theme: DEFAULT_THEME, palette: DEFAULT_PALETTE },
  setAppearance: () => {},
});

function readStored(): Appearance {
  try {
    const raw = localStorage.getItem(APPEARANCE_KEY);
    return normalizeAppearance(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeAppearance(null);
  }
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = a.theme;
  root.dataset.palette = a.palette;
  const palette = findTheme(a.theme).palettes.find((p) => p.id === a.palette);
  root.style.colorScheme = palette?.scheme ?? 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setState] = useState<Appearance>({ theme: DEFAULT_THEME, palette: DEFAULT_PALETTE });

  useEffect(() => setState(readStored()), []);

  useEffect(() => applyAppearance(appearance), [appearance]);

  const setAppearance = useCallback((next: Partial<Appearance>) => {
    setState((cur) => {
      const merged = normalizeAppearance({ ...cur, ...next });
      // A new theme keeps the palette only if that theme has it.
      try {
        localStorage.setItem(APPEARANCE_KEY, JSON.stringify(merged));
      } catch {
        /* a choice that does not persist is still a choice for this visit */
      }
      return merged;
    });
  }, []);

  const value = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}

/**
 * Runs in <head> before anything paints. Kept tiny and dependency-free on
 * purpose: it must not wait for React. Mirrors `normalizeAppearance` for
 * the ids it can check cheaply; the provider corrects anything odd.
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(APPEARANCE_KEY)})||"null");if(!a)return;var d=document.documentElement;if(typeof a.theme==="string")d.dataset.theme=a.theme;if(typeof a.palette==="string")d.dataset.palette=a.palette;if(a.palette==="daylight")d.style.colorScheme="light";}catch(e){}})();`;

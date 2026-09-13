import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'artify_theme';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function readStoredPreference(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'dark' || saved === 'light' ? saved : null;
}

function resolveInitialIsDark(): boolean {
  const stored = readStoredPreference();
  if (stored) return stored === 'dark';
  // No manual choice saved yet -- respect the device/browser preference.
  return systemPrefersDark();
}

/**
 * Single source of truth for the app's light/dark theme, shared by every screen that
 * needs to read or toggle it (the authenticated app's Header, and the pre-login
 * screens like LoginView/ForcePasswordChangeView which render before Header ever
 * mounts). Keeping this in one hook -- instead of each screen reinventing its own
 * isDark state -- is what makes the theme choice consistent from the very first
 * paint through login and into the rest of the app.
 *
 * Priority: an explicit user choice (persisted in localStorage) always wins. Until
 * the user makes one, the OS/browser's prefers-color-scheme is followed live -- if
 * they change their system theme with this app open in another tab, it updates here
 * too, right up until the moment they pick a theme manually.
 */
export function useTheme() {
  const [isDark, setIsDarkState] = useState<boolean>(resolveInitialIsDark);

  // Apply the .dark class as early and as consistently as every other state change --
  // this also covers the very first render, so there's no flash of the wrong theme.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Follow the system preference live, but only until the user has made their own
  // explicit choice -- once artify_theme is set, this listener stops taking effect.
  useEffect(() => {
    if (readStoredPreference()) return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!readStoredPreference()) setIsDarkState(e.matches);
    };
    mql.addEventListener?.('change', handler);
    return () => mql.removeEventListener?.('change', handler);
  }, []);

  const setTheme = useCallback((dark: boolean) => {
    setIsDarkState(dark);
    window.localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDarkState(prev => {
      const next = !prev;
      window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
      return next;
    });
  }, []);

  return { isDark, toggleTheme, setTheme };
}

import type { Theme } from './settings';

/**
 * Theme handling. "dark" is applied as a `dark` class on <html> so Tailwind's
 * `dark:` variants kick in (tailwind.config: darkMode: 'class').
 */

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isDark(t: Theme): boolean {
  if (t === 'system') return systemDark();
  return t === 'dark';
}

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark(t));
}

/** Re-apply when the OS preference changes (only meaningful for theme 'system'). */
export function watchSystemTheme(cb: (dark: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const m = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => cb(e.matches);
  m.addEventListener('change', listener);
  return () => m.removeEventListener('change', listener);
}

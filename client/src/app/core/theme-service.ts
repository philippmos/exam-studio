import { Injectable, computed, effect, signal } from '@angular/core';

/** What the user picked. `system` defers to the OS / browser preference. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The mode that is actually showing once `system` has been resolved. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'exam-studio.theme';

/**
 * Owns the light/dark mode preference.
 *
 * The whole palette is driven by the CSS `color-scheme` property: the Material
 * theme (and our own `--app-*` colours) emit `light-dark()` values, so setting
 * `color-scheme` on `<html>` switches every token at once. This service is the
 * single writer of that property:
 *
 * - `system` → `color-scheme: light dark`, letting the browser follow
 *   `prefers-color-scheme`.
 * - `light` / `dark` → forces that scheme regardless of the OS setting.
 *
 * The choice is persisted to `localStorage`; `index.html` reads the same key in
 * a tiny inline script to apply it before first paint (no flash of light mode).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly mediaQuery = window.matchMedia?.(
    '(prefers-color-scheme: dark)',
  );

  /** The user's explicit choice (`system` by default). */
  readonly preference = signal<ThemePreference>(this.readStoredPreference());

  /** Tracks the OS preference so `resolved` stays correct while on `system`. */
  private readonly systemPrefersDark = signal(this.mediaQuery?.matches ?? false);

  /** The mode actually rendered — useful for picking the right toggle icon. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) =>
      this.systemPrefersDark.set(event.matches),
    );

    // Keep the document in sync with the preference whenever it changes.
    effect(() => this.applyColorScheme(this.preference()));
  }

  /** Persist and apply a new preference. */
  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* Storage may be unavailable (private mode); the in-memory signal still works. */
    }
  }

  private applyColorScheme(preference: ThemePreference): void {
    document.documentElement.style.colorScheme =
      preference === 'system' ? 'light dark' : preference;
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      /* Ignore unreadable storage and fall back to following the system. */
    }
    return 'system';
  }
}

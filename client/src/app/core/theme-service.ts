import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth-service';
import { SettingsService } from './settings-service';
import { ThemePreference } from './models';

/** The mode that is actually showing once `SYSTEM` has been resolved. */
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
 * - `SYSTEM` → `color-scheme: light dark`, letting the browser follow
 *   `prefers-color-scheme`.
 * - `LIGHT` / `DARK` → forces that scheme regardless of the OS setting.
 *
 * The preference is **persisted server-side** (so it follows the user across
 * devices); see {@link SettingsService}. A `localStorage` cache mirrors it so
 * `index.html` can apply the choice before first paint (no flash of light mode)
 * and anonymous visitors still get a sensible default.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthService);
  private readonly settings = inject(SettingsService);

  private readonly mediaQuery = window.matchMedia?.(
    '(prefers-color-scheme: dark)',
  );

  /** The user's explicit choice (`SYSTEM` by default). */
  readonly preference = signal<ThemePreference>(this.readStoredPreference());

  /** Tracks the OS preference so `resolved` stays correct while on `SYSTEM`. */
  private readonly systemPrefersDark = signal(this.mediaQuery?.matches ?? false);

  /** The mode actually rendered — useful for picking the right toggle icon. */
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference === 'SYSTEM') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference === 'DARK' ? 'dark' : 'light';
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) =>
      this.systemPrefersDark.set(event.matches),
    );

    // Keep the document in sync with the preference whenever it changes.
    effect(() => this.applyColorScheme(this.preference()));
  }

  /** A user-initiated change: apply it instantly, cache it, and persist it. */
  setPreference(preference: ThemePreference): void {
    this.applyLocally(preference);
    if (this.auth.isAuthenticated()) {
      this.settings.setThemePreference(preference).subscribe({
        error: (err) => console.error('Failed to save theme preference', err),
      });
    }
  }

  /**
   * Load the stored preference from the server and apply it (without writing it
   * back). Called once after authentication settles; a no-op for anonymous
   * visitors, who keep the localStorage / system default.
   */
  async syncFromServer(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      return;
    }
    try {
      const settings = await firstValueFrom(this.settings.getUserSettings());
      this.applyLocally(settings.themePreference);
    } catch (err) {
      // A failed load just leaves the cached/default preference in place.
      console.error('Failed to load theme preference', err);
    }
  }

  /** Update the signal + localStorage cache (no server round-trip). */
  private applyLocally(preference: ThemePreference): void {
    this.preference.set(preference);
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* Storage may be unavailable (private mode); the in-memory signal still works. */
    }
  }

  private applyColorScheme(preference: ThemePreference): void {
    document.documentElement.style.colorScheme =
      preference === 'LIGHT'
        ? 'light'
        : preference === 'DARK'
          ? 'dark'
          : 'light dark';
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'LIGHT' || stored === 'DARK' || stored === 'SYSTEM') {
        return stored;
      }
    } catch {
      /* Ignore unreadable storage and fall back to following the system. */
    }
    return 'SYSTEM';
  }
}

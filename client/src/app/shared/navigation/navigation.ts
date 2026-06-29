import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

import { AuthService } from '../../core/auth-service';
import { ThemeService } from '../../core/theme-service';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatMenuModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="app-header">
      <div class="app-header-row">
        <a routerLink="/" class="brand">
          <span class="brand-icon"><mat-icon>school</mat-icon></span>
          <span>Exam Studio</span>
        </a>
        <nav class="app-nav">
          <div
            id="app-navigation"
            class="nav-links"
            [class.open]="mobileMenuOpen()"
          >
            <a
              routerLink="/"
              class="nav-link"
              [class.active]="section() === 'exams'"
              (click)="closeMobileMenu()"
            >
              <mat-icon>grid_view</mat-icon>
              <span>Exams</span>
            </a>
            <a
              routerLink="/sessions"
              class="nav-link"
              [class.active]="section() === 'sessions'"
              (click)="closeMobileMenu()"
            >
              <mat-icon>history</mat-icon>
              <span>Sessions</span>
            </a>
            <a
              routerLink="/statistics"
              class="nav-link"
              [class.active]="section() === 'statistics'"
              (click)="closeMobileMenu()"
            >
              <mat-icon>monitoring</mat-icon>
              <span>Statistics</span>
            </a>
            <a
              routerLink="/archive"
              class="nav-link"
              [class.active]="section() === 'archive'"
              (click)="closeMobileMenu()"
            >
              <mat-icon>inventory_2</mat-icon>
              <span>Archive</span>
            </a>
          </div>
        </nav>
        <div class="header-actions">
          <button
            type="button"
            class="icon-button"
            [matMenuTriggerFor]="themeMenu"
            aria-label="Darstellung auswählen (hell, dunkel, System)"
          >
            <mat-icon>{{ themeIcon() }}</mat-icon>
          </button>
          <mat-menu #themeMenu="matMenu" xPosition="before">
            <div class="menu-heading">Appearance</div>
            <button
              mat-menu-item
              (click)="theme.setPreference('light')"
              [class.selected]="theme.preference() === 'light'"
            >
              <mat-icon>light_mode</mat-icon>
              <span>Light</span>
              @if (theme.preference() === 'light') {
                <mat-icon class="menu-check">check</mat-icon>
              }
            </button>
            <button
              mat-menu-item
              (click)="theme.setPreference('dark')"
              [class.selected]="theme.preference() === 'dark'"
            >
              <mat-icon>dark_mode</mat-icon>
              <span>Dark</span>
              @if (theme.preference() === 'dark') {
                <mat-icon class="menu-check">check</mat-icon>
              }
            </button>
            <button
              mat-menu-item
              (click)="theme.setPreference('system')"
              [class.selected]="theme.preference() === 'system'"
            >
              <mat-icon>brightness_auto</mat-icon>
              <span>System</span>
              @if (theme.preference() === 'system') {
                <mat-icon class="menu-check">check</mat-icon>
              }
            </button>
          </mat-menu>
          @if (auth.isAuthenticated()) {
            <button
              type="button"
              class="user-button"
              [matMenuTriggerFor]="userMenu"
              aria-label="Benutzermenü öffnen"
            >
              @if (auth.user()?.picture; as picture) {
                <img [src]="picture" alt="" class="user-avatar" />
              } @else {
                <span class="user-avatar user-avatar--initials">{{
                  initials()
                }}</span>
              }
            </button>
            <mat-menu #userMenu="matMenu" xPosition="before">
              <div class="user-info">
                <div class="user-info-name">{{ displayName() }}</div>
                @if (auth.user()?.email; as email) {
                  <div class="user-info-email">{{ email }}</div>
                }
              </div>
              <div class="menu-divider"></div>
              <button mat-menu-item (click)="logout()">
                <mat-icon>logout</mat-icon>
                <span>Logout</span>
              </button>
            </mat-menu>
          }
          <button
            type="button"
            class="menu-button"
            (click)="toggleMobileMenu()"
            [attr.aria-expanded]="mobileMenuOpen()"
            aria-controls="app-navigation"
            aria-label="Navigation öffnen oder schließen"
          >
            <mat-icon>{{ mobileMenuOpen() ? 'close' : 'menu' }}</mat-icon>
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      .app-header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: color-mix(in srgb, var(--mat-sys-surface) 88%, transparent);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid
          color-mix(in srgb, var(--mat-sys-outline-variant) 55%, transparent);
      }

      .app-header-row {
        max-width: 1100px;
        margin: 0 auto;
        padding: 0 24px;
        height: 64px;
        display: flex;
        align-items: center;
        gap: 24px;
      }

      .menu-button {
        display: none;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: var(--mat-sys-on-surface);
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }

      .menu-button:hover {
        background: var(--mat-sys-surface-container);
      }

      .menu-button mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }

      .app-nav {
        margin-left: auto;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .user-button,
      .icon-button {
        width: 36px;
        height: 36px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: transparent;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .user-button:hover,
      .icon-button:hover {
        background: var(--mat-sys-surface-container);
      }

      .icon-button {
        color: var(--mat-sys-on-surface-variant);
      }

      .icon-button mat-icon {
        font-size: 21px;
        width: 21px;
        height: 21px;
      }

      .menu-heading {
        padding: 8px 16px 4px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--mat-sys-on-surface-variant);
      }

      .menu-check {
        margin-left: auto;
        color: var(--mat-sys-primary);
      }

      [mat-menu-item].selected {
        color: var(--mat-sys-primary);
      }

      [mat-menu-item].selected mat-icon {
        color: var(--mat-sys-primary);
      }

      .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        object-fit: cover;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .user-avatar--initials {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .user-info {
        padding: 10px 16px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .user-info-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--mat-sys-on-surface);
      }

      .user-info-email {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }

      .menu-divider {
        height: 1px;
        margin: 4px 0;
        background: color-mix(
          in srgb,
          var(--mat-sys-outline-variant) 55%,
          transparent
        );
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        color: inherit;
        text-decoration: none;
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .brand-icon {
        width: 32px;
        height: 32px;
        border-radius: 9px;
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .brand-icon mat-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
      }
      .nav-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 999px;
        color: var(--mat-sys-on-surface-variant);
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
        transition:
          background 0.15s,
          color 0.15s;
      }
      .nav-link mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .nav-link:hover {
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface);
      }
      .nav-link.active {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }

      @media (max-width: 720px) {
        .app-header-row {
          padding: 0 16px;
          height: 52px;
          position: relative;
          z-index: 2;
        }

        .menu-button {
          display: inline-flex;
        }

        .header-actions {
          margin-left: auto;
        }

        .app-nav {
          position: absolute;
          top: 52px;
          left: 0;
          right: 0;
          margin-left: 0;
          padding: 0 16px 12px;
          pointer-events: none;
        }

        .nav-links {
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
          width: 100%;
          padding: 0;
          border: 1px solid
            color-mix(in srgb, var(--mat-sys-outline-variant) 60%, transparent);
          border-radius: 20px;
          background: color-mix(
            in srgb,
            var(--mat-sys-surface) 96%,
            transparent
          );
          box-shadow: 0 16px 40px color-mix(in srgb, #000 12%, transparent);
          max-height: 0;
          overflow: hidden;
          opacity: 0;
          transform: translateY(-6px);
          pointer-events: auto;
          transition:
            max-height 0.2s ease,
            opacity 0.2s ease,
            transform 0.2s ease;
        }

        .nav-links.open {
          max-height: 320px;
          opacity: 1;
          transform: translateY(0);
          padding: 10px;
        }

        .nav-link {
          width: 100%;
          display: flex;
          justify-content: flex-start;
          padding: 13px 14px;
          border-radius: 16px;
          background: color-mix(
            in srgb,
            var(--mat-sys-surface-container) 72%,
            transparent
          );
        }
      }
    `,
  ],
})
export class Navigation {
  /** Current top-level area, used to highlight the active nav pill. */
  readonly section = signal<'exams' | 'sessions' | 'statistics' | 'archive'>(
    'exams',
  );
  readonly mobileMenuOpen = signal(false);

  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  /** Icon for the appearance toggle, reflecting the current preference. */
  readonly themeIcon = computed(() => {
    switch (this.theme.preference()) {
      case 'light':
        return 'light_mode';
      case 'dark':
        return 'dark_mode';
      default:
        return 'brightness_auto';
    }
  });

  /** Best display label for the signed-in user. */
  readonly displayName = computed(
    () => this.auth.user()?.name || this.auth.user()?.email || 'Account',
  );

  /** Fallback avatar initials when the user has no picture. */
  readonly initials = computed(() => {
    const user = this.auth.user();
    const source = (user?.name || user?.email || '').trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  });

  constructor() {
    const router = inject(Router);
    router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => {
        const url = e.urlAfterRedirects;
        this.section.set(
          url.startsWith('/sessions')
            ? 'sessions'
            : url.startsWith('/statistics')
              ? 'statistics'
              : url.startsWith('/archive')
                ? 'archive'
                : 'exams',
        );
        this.mobileMenuOpen.set(false);
      });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  logout(): void {
    void this.auth.logout();
  }
}

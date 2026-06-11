import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="app-header">
      <nav class="app-nav">
        <a routerLink="/" class="brand">
          <span class="brand-icon"><mat-icon>school</mat-icon></span>
          <span>Exam Studio</span>
        </a>
        <span class="spacer"></span>
        <a routerLink="/" class="nav-link" [class.active]="!onSessions()">
          <mat-icon>grid_view</mat-icon>
          <span>Exams</span>
        </a>
        <a
          routerLink="/sessions"
          class="nav-link"
          [class.active]="onSessions()"
        >
          <mat-icon>history</mat-icon>
          <span>Sessions</span>
        </a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
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
      .app-nav {
        max-width: 1100px;
        margin: 0 auto;
        padding: 0 24px;
        height: 60px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-right: 16px;
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
    `,
  ],
})
export class AppComponent {
  /** Current top-level area, used to highlight the active nav pill. */
  readonly onSessions = signal(false);

  constructor() {
    const router = inject(Router);
    router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) =>
        this.onSessions.set(e.urlAfterRedirects.startsWith('/sessions')),
      );
  }
}

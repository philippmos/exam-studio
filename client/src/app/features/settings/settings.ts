import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { ThemePreference } from '../../core/models';
import { ThemeService } from '../../core/theme-service';

/**
 * User account settings. Currently just the appearance (light/dark) preference;
 * the page is laid out so further settings cards can be added over time.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [MatCardModule, MatButtonToggleModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Settings</h1>
          <p class="subtitle">Manage your account preferences.</p>
        </div>
      </div>

      <mat-card class="panel" appearance="outlined">
        <mat-card-header>
          <mat-card-title>Appearance</mat-card-title>
          <mat-card-subtitle>Choose how Exam Studio looks.</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <div class="setting">
            <div class="setting-text">
              <div class="setting-label">Theme</div>
              <div class="setting-desc">
                Use light or dark mode, or follow your device setting.
              </div>
            </div>
            <mat-button-toggle-group
              class="theme-toggle"
              [value]="theme.preference()"
              (change)="setTheme($event.value)"
              hideSingleSelectionIndicator
              aria-label="Theme"
            >
              <mat-button-toggle value="LIGHT">
                <span class="opt"><mat-icon>light_mode</mat-icon>Light</span>
              </mat-button-toggle>
              <mat-button-toggle value="DARK">
                <span class="opt"><mat-icon>dark_mode</mat-icon>Dark</span>
              </mat-button-toggle>
              <mat-button-toggle value="SYSTEM">
                <span class="opt"
                  ><mat-icon>brightness_auto</mat-icon>System</span
                >
              </mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          @if (theme.preference() === 'SYSTEM') {
            <p class="hint">
              <mat-icon>info</mat-icon>
              Following your device — currently {{ theme.resolved() }}.
            </p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .panel {
        max-width: 720px;
      }
      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        flex-wrap: wrap;
      }
      .setting-label {
        font-weight: 600;
      }
      .setting-desc {
        margin-top: 2px;
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
        max-width: 42ch;
      }
      .opt {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .opt mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .hint {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 18px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .hint mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class Settings {
  readonly theme = inject(ThemeService);

  setTheme(value: ThemePreference): void {
    this.theme.setPreference(value);
  }
}

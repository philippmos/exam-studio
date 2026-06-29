import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { SettingsService } from '../../core/settings-service';
import { ThemeService } from '../../core/theme-service';
import { DAILY_STREAK_GOAL_CHOICES, ThemePreference } from '../../core/models';

/**
 * User account settings: the appearance (light/dark) preference and the
 * daily-streak goal. The page is laid out so further settings cards can be added
 * over time.
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

      <mat-card class="panel" appearance="outlined">
        <mat-card-header>
          <mat-card-title>Study streak</mat-card-title>
          <mat-card-subtitle
            >Set how much counts as a day of studying.</mat-card-subtitle
          >
        </mat-card-header>
        <mat-card-content>
          <div class="setting">
            <div class="setting-text">
              <div class="setting-label">Daily goal</div>
              <div class="setting-desc">
                Answer this many questions in a day to keep your streak going.
              </div>
            </div>
            @if (dailyStreakGoal(); as goal) {
              <mat-button-toggle-group
                class="goal-toggle"
                [value]="goal"
                (change)="setDailyStreakGoal($event.value)"
                hideSingleSelectionIndicator
                aria-label="Daily streak goal"
              >
                @for (choice of choices; track choice) {
                  <mat-button-toggle [value]="choice">{{
                    choice
                  }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
            }
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .panel {
        max-width: 720px;
      }
      .panel + .panel {
        margin-top: 20px;
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
  private readonly settings = inject(SettingsService);

  /** The offered daily-streak goals (questions/day). */
  readonly choices = DAILY_STREAK_GOAL_CHOICES;

  /** Current goal; null until loaded, so the toggle has no value to bind yet. */
  readonly dailyStreakGoal = signal<number | null>(null);

  constructor() {
    this.settings.getUserSettings().subscribe({
      next: (s) => this.dailyStreakGoal.set(s.dailyStreakGoal),
      error: (err) => console.error('Failed to load settings', err),
    });
  }

  setTheme(value: ThemePreference): void {
    this.theme.setPreference(value);
  }

  setDailyStreakGoal(goal: number): void {
    const previous = this.dailyStreakGoal();
    this.dailyStreakGoal.set(goal); // optimistic; revert if the save fails
    this.settings.setDailyStreakGoal(goal).subscribe({
      error: (err) => {
        console.error('Failed to save daily streak goal', err);
        this.dailyStreakGoal.set(previous);
      },
    });
  }
}

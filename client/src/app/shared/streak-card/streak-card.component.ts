import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { StudyStreak } from '../../core/models';

interface WeekDay {
  day: string;
  active: boolean;
  isToday: boolean;
  label: string; // single-letter weekday
  tooltip: string;
}

/**
 * Study-streak banner: a flame with the running streak, the personal best and a
 * seven-day activity strip. The visual state nudges the habit along — a lit
 * flame once today is done, an amber "at risk" tone while it is still open, and
 * a cold flame inviting a fresh start once the streak has lapsed.
 */
@Component({
  selector: 'app-streak-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (streak(); as s) {
      <mat-card
        class="streak-card"
        appearance="outlined"
        [class.lit]="s.current > 0"
        [class.at-risk]="atRisk()"
        [class.cold]="s.current === 0"
      >
        <div class="lead">
          <div class="flame">
            <mat-icon>local_fire_department</mat-icon>
          </div>
          <div class="headline">
            <div class="count">
              <span class="num">{{ s.current }}</span>
              <span class="unit">day streak</span>
              @if (s.longest > 0) {
                <span
                  class="best"
                  matTooltip="Your longest streak so far"
                  [class.beating]="s.current >= s.longest"
                >
                  <mat-icon>emoji_events</mat-icon>
                  Best {{ s.longest }}
                </span>
              }
            </div>
            <p class="message">{{ message() }}</p>
          </div>
        </div>

        <div class="week" role="img" [attr.aria-label]="weekAriaLabel()">
          @for (d of days(); track d.day) {
            <div
              class="day"
              [class.on]="d.active"
              [class.today]="d.isToday"
              [matTooltip]="d.tooltip"
            >
              <span class="cell">
                @if (d.active) {
                  <mat-icon>local_fire_department</mat-icon>
                }
              </span>
              <span class="dow">{{ d.label }}</span>
            </div>
          }
        </div>
      </mat-card>
    }
  `,
  styles: [
    `
      .streak-card {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 20px 28px;
        padding: 18px 22px;
      }
      .lead {
        display: flex;
        align-items: center;
        gap: 16px;
        min-width: 0;
      }
      .flame {
        flex: 0 0 auto;
        width: 56px;
        height: 56px;
        border-radius: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--app-streak-bg);
        transition:
          background 0.2s ease,
          box-shadow 0.2s ease;
      }
      .flame mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: var(--app-streak);
      }
      .lit .flame {
        box-shadow: 0 0 0 4px color-mix(in srgb, var(--app-streak) 12%, transparent);
      }
      .cold .flame {
        background: var(--mat-sys-surface-container-highest);
      }
      .cold .flame mat-icon {
        color: var(--mat-sys-outline);
      }
      .count {
        display: flex;
        align-items: baseline;
        flex-wrap: wrap;
        gap: 8px;
      }
      .num {
        font-size: 34px;
        font-weight: 700;
        line-height: 1;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        color: var(--app-streak);
      }
      .cold .num {
        color: var(--mat-sys-on-surface);
      }
      .unit {
        font-size: 15px;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
      }
      .best {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 9px 2px 7px;
        border-radius: 999px;
        background: var(--mat-sys-surface-container-highest);
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
      }
      .best mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }
      .best.beating {
        background: var(--app-streak-bg);
        color: var(--app-streak);
      }
      .message {
        margin: 5px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        max-width: 46ch;
      }
      .at-risk .message {
        color: var(--app-streak);
        font-weight: 500;
      }
      .week {
        display: flex;
        gap: 8px;
      }
      .day {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
      }
      .cell {
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--mat-sys-surface-container-highest);
        transition:
          background 0.2s ease,
          box-shadow 0.2s ease;
      }
      .day.on .cell {
        background: var(--app-streak);
      }
      .day.on .cell mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #fff;
      }
      .day.today .cell {
        box-shadow: 0 0 0 2px var(--mat-sys-surface),
          0 0 0 4px color-mix(in srgb, var(--app-streak) 55%, transparent);
      }
      .dow {
        font-size: 11px;
        font-weight: 500;
        color: var(--mat-sys-on-surface-variant);
        text-transform: uppercase;
      }
      .day.today .dow {
        color: var(--app-streak);
        font-weight: 700;
      }
    `,
  ],
})
export class StreakCardComponent {
  private readonly locale = inject(LOCALE_ID);

  /** Streak to render; nothing is shown until it has loaded. */
  readonly streak = input.required<StudyStreak | null>();

  /** Alive but not yet secured today — the moment the nudge matters most. */
  readonly atRisk = computed(() => {
    const s = this.streak();
    return !!s && !s.studiedToday && s.current > 0;
  });

  readonly days = computed<WeekDay[]>(() => {
    const recent = this.streak()?.recentDays ?? [];
    const todayIso = recent[recent.length - 1]?.day;
    return recent.map((d) => ({
      day: d.day,
      active: d.active,
      isToday: d.day === todayIso,
      label: formatDate(d.day, 'EEEEE', this.locale),
      tooltip:
        `${formatDate(d.day, 'EEE, MMM d', this.locale)} · ` +
        (d.active ? 'studied' : 'no activity'),
    }));
  });

  readonly message = computed(() => {
    const s = this.streak();
    if (!s) {
      return '';
    }
    if (s.studiedToday) {
      return s.current >= 3
        ? `You're on a roll — ${s.current} days in a row. Keep it up!`
        : 'Done for today. Come back tomorrow to grow your streak.';
    }
    if (s.current > 0) {
      return `Answer one question today to keep your ${s.current}-day streak alive.`;
    }
    if (s.longest > 0) {
      return `Your streak reset. Answer a question today to start a new one — your best is ${s.longest}.`;
    }
    return 'Answer a question today to start your study streak.';
  });

  weekAriaLabel(): string {
    const active = this.days().filter((d) => d.active).length;
    return `Studied ${active} of the last ${this.days().length} days.`;
  }
}

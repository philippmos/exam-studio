import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  MatButtonToggleChange,
  MatButtonToggleModule,
} from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

import { StudyDayStats } from '../../core/models';

export type StudyMetric = 'total' | 'correct' | 'incorrect';

interface ChartBar extends StudyDayStats {
  /** X-axis tick label; only set for a subset of bars to avoid clutter. */
  tick: string | null;
  tooltip: string;
}

const DAY_MS = 86_400_000;

/**
 * Column chart of questions answered per day with a metric toggle
 * (total / correct / incorrect). Days without activity are rendered as
 * gaps so the time axis stays honest; wide ranges scroll horizontally.
 */
@Component({
  selector: 'app-study-history-chart',
  standalone: true,
  imports: [MatButtonToggleModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <mat-button-toggle-group
        hideSingleSelectionIndicator
        aria-label="Chart metric"
        [value]="metric()"
        (change)="onMetricChange($event)"
      >
        <mat-button-toggle value="total">Total</mat-button-toggle>
        <mat-button-toggle value="correct">Correct</mat-button-toggle>
        <mat-button-toggle value="incorrect">Incorrect</mat-button-toggle>
      </mat-button-toggle-group>
    </div>

    <div class="chart">
      <div class="y-labels">
        @for (tick of yTicks(); track $index) {
          <span>{{ tick }}</span>
        }
      </div>
      <div class="scroll">
        <div class="plot-area" [style.min-width.px]="bars().length * 14">
          <div class="plot">
            @for (line of gridLines; track line) {
              <div
                class="gridline"
                [class.axis]="line === 0"
                [style.bottom.%]="line"
              ></div>
            }
            <div class="bars">
              @for (bar of bars(); track bar.day) {
                <div class="slot" [matTooltip]="bar.tooltip">
                  <div
                    [class]="'fill ' + metric()"
                    [style.height.%]="heightOf(bar)"
                  ></div>
                </div>
              }
            </div>
          </div>
          <div class="x-labels">
            @for (bar of bars(); track bar.day) {
              <span class="x-slot">
                @if (bar.tick) {
                  <span class="x-tick">{{ bar.tick }}</span>
                }
              </span>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .head {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 16px;
      }
      .head mat-button-toggle-group {
        --mat-button-toggle-height: 32px;
        font-size: 13px;
      }
      .chart {
        display: flex;
        gap: 10px;
      }
      .y-labels {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 220px;
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
        text-align: right;
        min-width: 24px;
      }
      .y-labels span {
        height: 0;
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }
      .scroll {
        flex: 1;
        min-width: 0;
        overflow-x: auto;
      }
      .plot {
        position: relative;
        height: 220px;
      }
      .gridline {
        position: absolute;
        left: 0;
        right: 0;
        border-top: 1px dashed
          color-mix(in srgb, var(--mat-sys-outline-variant) 70%, transparent);
      }
      .gridline.axis {
        border-top-style: solid;
        border-top-color: var(--mat-sys-outline-variant);
      }
      .bars {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-end;
      }
      .slot {
        flex: 1 1 0;
        min-width: 0;
        height: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        border-radius: 4px;
      }
      .slot:hover {
        background: color-mix(
          in srgb,
          var(--mat-sys-on-surface) 6%,
          transparent
        );
      }
      .fill {
        width: 62%;
        max-width: 28px;
        border-radius: 4px 4px 0 0;
        transition:
          height 0.25s ease,
          background 0.25s ease;
      }
      .fill.total {
        background: var(--mat-sys-primary);
      }
      .fill.correct {
        background: var(--app-success);
      }
      .fill.incorrect {
        background: var(--app-danger);
      }
      .x-labels {
        display: flex;
        height: 20px;
        margin-top: 6px;
      }
      .x-slot {
        flex: 1 1 0;
        min-width: 0;
        position: relative;
      }
      .x-tick {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class StudyHistoryChartComponent {
  private readonly locale = inject(LOCALE_ID);

  /** Per-day history; gaps between days are filled with zero bars. */
  readonly data = input.required<StudyDayStats[]>();

  readonly metric = signal<StudyMetric>('total');

  /** Gridline positions in % from the bottom; 0 is the x axis. */
  readonly gridLines = [0, 25, 50, 75, 100];

  readonly bars = computed<ChartBar[]>(() => {
    const history = [...this.data()].sort((a, b) => a.day.localeCompare(b.day));
    if (history.length === 0) {
      return [];
    }
    const byDay = new Map(history.map((d) => [d.day, d]));
    const start = Date.parse(`${history[0].day}T00:00:00Z`);
    const end = Date.parse(`${history[history.length - 1].day}T00:00:00Z`);
    const days: string[] = [];
    for (let t = start; t <= end; t += DAY_MS) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
    const tickEvery = Math.max(1, Math.ceil(days.length / 8));
    return days.map((day, i) => {
      const stats = byDay.get(day) ?? {
        day,
        total: 0,
        correct: 0,
        incorrect: 0,
      };
      return {
        ...stats,
        tick:
          i % tickEvery === 0 ? formatDate(day, 'MMM d', this.locale) : null,
        tooltip:
          `${formatDate(day, 'mediumDate', this.locale)}: ` +
          `${stats.total} answered · ${stats.correct} correct · ` +
          `${stats.incorrect} incorrect`,
      };
    });
  });

  /** Y-axis maximum: four integer steps with a nice step size (1/2/5·10ⁿ). */
  readonly maxValue = computed(() => {
    const metric = this.metric();
    const max = Math.max(0, ...this.bars().map((bar) => bar[metric]));
    const rawStep = Math.max(max / 4, 1);
    const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rawStep)!;
    return step * 4;
  });

  readonly yTicks = computed(() => {
    const max = this.maxValue();
    return [max, (max / 4) * 3, max / 2, max / 4, 0];
  });

  onMetricChange(event: MatButtonToggleChange): void {
    this.metric.set(event.value as StudyMetric);
  }

  heightOf(bar: ChartBar): number {
    const value = bar[this.metric()];
    // Keep tiny non-zero bars visible.
    return value > 0 ? Math.max((value / this.maxValue()) * 100, 1) : 0;
  }
}

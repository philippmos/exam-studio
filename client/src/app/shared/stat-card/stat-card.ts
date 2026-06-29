import {
  ChangeDetectionStrategy,
  Component,
  Input,
  input,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

/** Small reusable KPI tile used on the progress dashboard. */
@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="stat-card" appearance="outlined">
      <div class="icon" [style.--sc-color]="color()" [style.--sc-tint]="tint()">
        <mat-icon>{{ icon() }}</mat-icon>
      </div>
      <div class="body">
        <div class="value">{{ value() }}</div>
        <div class="label">{{ label() }}</div>
        @if (sublabel) {
          <div class="sublabel">{{ sublabel }}</div>
        }
      </div>
    </mat-card>
  `,
  styles: [
    `
      .stat-card {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 16px;
        padding: 16px;
        height: 100%;
      }
      .icon {
        flex: 0 0 auto;
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /*
         * Light mode keeps the caller's hand-picked pastel tint; dark mode
         * derives a deep, low-chroma badge from the same hue so it sits on the
         * dark card without glaring.
         */
        background: light-dark(
          var(--sc-tint, var(--mat-sys-surface-container-high)),
          color-mix(
            in srgb,
            var(--sc-color, var(--mat-sys-primary)) 22%,
            var(--mat-sys-surface-container-high)
          )
        );
      }
      .icon mat-icon {
        /* Brighten the hue in dark mode for contrast against the dark badge. */
        color: light-dark(
          var(--sc-color, var(--mat-sys-primary)),
          color-mix(in srgb, var(--sc-color, var(--mat-sys-primary)) 62%, white)
        );
      }
      .value {
        font-size: 26px;
        font-weight: 600;
        line-height: 1.1;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
      }
      .label {
        color: var(--mat-sys-on-surface);
        font-weight: 500;
        margin-top: 2px;
      }
      .sublabel {
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
        margin-top: 2px;
      }
    `,
  ],
})
export class StatCard {
  readonly icon = input.required<string>();
  readonly value = input.required<string | number>();
  readonly label = input.required<string>();
  @Input() sublabel?: string;
  readonly color = input('#1976d2');
  readonly tint = input('#e3f2fd');
}

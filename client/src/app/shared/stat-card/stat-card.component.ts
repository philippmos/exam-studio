import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
      <div class="icon" [style.background]="tint">
        <mat-icon [style.color]="color">{{ icon }}</mat-icon>
      </div>
      <div class="body">
        <div class="value">{{ value }}</div>
        <div class="label">{{ label }}</div>
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
export class StatCardComponent {
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) value!: string | number;
  @Input({ required: true }) label!: string;
  @Input() sublabel?: string;
  @Input() color = '#1976d2';
  @Input() tint = '#e3f2fd';
}

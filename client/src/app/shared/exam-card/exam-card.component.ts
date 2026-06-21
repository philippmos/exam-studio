import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Exam, StudyGoalProgress } from '../../core/models';

@Component({
  selector: 'app-exam-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="exam-card" appearance="outlined">
      <mat-card-content class="content">
        <h3 class="name">{{ exam.name }}</h3>
        @if (exam.issuer) {
          <p class="issuer">{{ exam.issuer }}</p>
        }
        <div class="meta">
          <span class="meta-item">
            <mat-icon>folder_open</mat-icon>
            {{ exam.sections.length }} modules
          </span>
          <span class="meta-item">
            <mat-icon>quiz</mat-icon>
            {{ exam.questionCount }} questions
          </span>
        </div>
        @if (goalProgress; as gp) {
          <div class="goal" [class.done]="gp.answered >= gp.target">
            <div class="goal-head">
              <span class="goal-label">
                <mat-icon>flag</mat-icon>
                {{ gp.period === 'DAILY' ? 'Today' : 'This week' }}
              </span>
              <span class="goal-count">{{ gp.answered }} / {{ gp.target }}</span>
            </div>
            <div class="goal-bar">
              <div class="goal-fill" [style.width.%]="goalPct(gp)"></div>
            </div>
          </div>
        }
      </mat-card-content>
      <mat-card-actions class="actions">
        <button
          mat-icon-button
          matTooltip="Learning progress"
          aria-label="Learning progress"
          (click)="progress.emit(exam)"
        >
          <mat-icon>insights</mat-icon>
        </button>
        <button
          mat-icon-button
          matTooltip="Study goal"
          aria-label="Study goal"
          (click)="goal.emit(exam)"
        >
          <mat-icon>flag</mat-icon>
        </button>
        <button
          mat-icon-button
          matTooltip="Delete exam"
          aria-label="Delete exam"
          class="delete"
          (click)="delete.emit(exam)"
        >
          <mat-icon>delete_outline</mat-icon>
        </button>
        <span class="spacer"></span>
        <button mat-flat-button (click)="open.emit(exam)">
          Open <mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      .exam-card {
        height: 100%;
        display: flex;
        flex-direction: column;
        transition:
          box-shadow 0.2s ease,
          transform 0.2s ease;
      }
      .exam-card:hover {
        box-shadow: 0 6px 20px rgba(26, 27, 31, 0.08);
        transform: translateY(-2px);
      }
      .content {
        flex: 1;
        padding: 20px 20px 0;
      }
      .name {
        margin: 0;
        font-size: 17px;
        font-weight: 600;
        line-height: 1.35;
        letter-spacing: -0.01em;
      }
      .issuer {
        margin: 3px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 14px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .meta-item mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }
      .goal {
        margin-top: 14px;
      }
      .goal-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .goal-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .goal-label mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }
      .goal-count {
        font-weight: 500;
      }
      .goal-bar {
        height: 6px;
        border-radius: 3px;
        background: #eceff1;
        overflow: hidden;
      }
      .goal-fill {
        height: 100%;
        border-radius: 3px;
        background: var(--mat-sys-primary);
        transition: width 0.3s ease;
      }
      .goal.done .goal-fill {
        background: var(--app-success);
      }
      .goal.done .goal-count {
        color: var(--app-success);
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 8px 12px 12px;
      }
      .delete:hover mat-icon {
        color: var(--app-danger);
      }
    `,
  ],
})
export class ExamCardComponent {
  @Input({ required: true }) exam!: Exam;
  /** Current-period goal progress; hidden when the exam has no goal. */
  @Input() goalProgress: StudyGoalProgress | null = null;
  @Output() open = new EventEmitter<Exam>();
  @Output() delete = new EventEmitter<Exam>();
  @Output() progress = new EventEmitter<Exam>();
  @Output() goal = new EventEmitter<Exam>();

  goalPct(gp: StudyGoalProgress): number {
    return Math.min(100, (gp.answered / gp.target) * 100);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Observable } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';

import { ExamService } from '../../core/exam.service';
import {
  Exam,
  GoalPeriod,
  StudyGoal,
  StudyGoalSource,
  SuggestedStudyGoal,
} from '../../core/models';

interface DialogData {
  exam: Exam;
}

/**
 * Result of the study-goal dialog: the goal to set, `null` to remove the
 * current goal, `undefined` when the dialog was cancelled.
 */
export type StudyGoalDialogResult = StudyGoal | null | undefined;

@Component({
  selector: 'app-study-goal-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Study goal</h2>
    <mat-dialog-content>
      <p class="hint">
        How many questions of "{{ data.exam.name }}" do you want to go through?
      </p>

      <mat-button-toggle-group
        class="mode"
        [ngModel]="mode()"
        (ngModelChange)="setMode($event)"
        aria-label="How to set the goal"
      >
        <mat-button-toggle value="AUTO" [disabled]="!hasExamDate">
          Automatic
        </mat-button-toggle>
        <mat-button-toggle value="MANUAL">Manual</mat-button-toggle>
      </mat-button-toggle-group>

      <mat-radio-group
        class="periods"
        [ngModel]="period()"
        (ngModelChange)="period.set($event)"
      >
        <mat-radio-button value="DAILY">
          <span class="period-title">Daily</span>
          <span class="period-desc"
            >The goal resets every day at midnight.</span
          >
        </mat-radio-button>

        <mat-radio-button value="WEEKLY">
          <span class="period-title">Weekly</span>
          <span class="period-desc">
            The goal covers the current week, Monday to Sunday.
          </span>
        </mat-radio-button>
      </mat-radio-group>

      @if (mode() === 'AUTO') {
        @if (!hasExamDate) {
          <p class="notice">
            Set a certification exam date first to calculate a goal
            automatically.
          </p>
        } @else if (loadingSuggestion()) {
          <div class="suggestion-loading"><mat-spinner diameter="28" /></div>
        } @else if (suggestion()) {
          @if (suggestion(); as s) {
            <div class="suggestion">
              <div class="suggestion-target">
                {{ s.target }}
                <span class="unit">
                  {{
                    period() === 'DAILY'
                      ? 'questions / day'
                      : 'questions / week'
                  }}
                </span>
              </div>
              <p class="suggestion-why">
                Based on {{ s.questionCount }} questions × ~{{
                  s.repetitionFactor
                }}
                reviews each (so they stick), spread over {{ s.usableDays }}
                study days before your exam.
              </p>
            </div>
          }
        } @else {
          <p class="notice">
            Your exam date is too close to plan a goal automatically — enter one
            manually instead.
          </p>
        }
      } @else {
        <mat-form-field appearance="outline" class="target-field">
          <mat-label>
            Questions per {{ period() === 'DAILY' ? 'day' : 'week' }}
          </mat-label>
          <input
            matInput
            type="number"
            min="1"
            [ngModel]="manualTarget()"
            (ngModelChange)="manualTarget.set($event)"
          />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.exam.studyGoal) {
        <button mat-button class="remove" (click)="remove()">
          Remove goal
        </button>
        <span class="spacer"></span>
      }
      <button mat-button (click)="cancel()">Cancel</button>
      <button mat-flat-button [disabled]="!canSave()" (click)="save()">
        Save
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .hint {
        color: var(--mat-sys-on-surface-variant);
      }
      .mode {
        margin: 4px 0 16px;
      }
      .periods {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin: 8px 0 4px;
      }
      .period-title {
        display: block;
        font-weight: 500;
      }
      .period-desc {
        display: block;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        white-space: normal;
      }
      .target-field {
        width: 100%;
        margin-top: 16px;
      }
      .notice {
        margin: 16px 0 0;
        padding: 12px 14px;
        border-radius: 8px;
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
        font-size: 13px;
      }
      .suggestion-loading {
        display: flex;
        justify-content: center;
        margin-top: 16px;
      }
      .suggestion {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 8px;
        background: var(--mat-sys-surface-container-high);
      }
      .suggestion-target {
        font-size: 28px;
        font-weight: 600;
        line-height: 1.1;
        color: var(--mat-sys-primary);
      }
      .suggestion-target .unit {
        font-size: 13px;
        font-weight: 400;
        color: var(--mat-sys-on-surface-variant);
      }
      .suggestion-why {
        margin: 8px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .remove {
        color: var(--app-danger);
      }
      .spacer {
        flex: 1;
      }
      mat-dialog-content {
        min-width: 380px;
      }
    `,
  ],
})
export class StudyGoalDialogComponent {
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<StudyGoalDialogComponent, StudyGoalDialogResult>,
  );
  private readonly examService = inject(ExamService);

  readonly hasExamDate = !!this.data.exam.certificationExamAt;

  /** Whether the target is computed from the exam date or typed by hand. */
  readonly mode = signal<StudyGoalSource>(
    this.data.exam.studyGoal?.source ?? (this.hasExamDate ? 'AUTO' : 'MANUAL'),
  );
  readonly period = signal<GoalPeriod>(
    this.data.exam.studyGoal?.period ?? 'DAILY',
  );
  /** The hand-entered target (manual mode only). */
  readonly manualTarget = signal<number | null>(
    this.data.exam.studyGoal?.target ?? 10,
  );

  /** Latest suggestion for the selected period (automatic mode). */
  readonly suggestion = signal<SuggestedStudyGoal | null>(null);
  readonly loadingSuggestion = signal(false);

  constructor() {
    // (Re)fetch the suggestion whenever automatic mode is active and the period
    // changes; the target depends on the period (per-day vs per-week).
    effect(() => {
      const period = this.period();
      if (this.mode() === 'AUTO' && this.hasExamDate) {
        this.fetchSuggestion(period);
      }
    });
  }

  /** Opens the dialog for an exam; see {@link StudyGoalDialogResult}. */
  static open(
    dialog: MatDialog,
    exam: Exam,
  ): Observable<StudyGoalDialogResult> {
    return dialog
      .open<
        StudyGoalDialogComponent,
        DialogData,
        StudyGoalDialogResult
      >(StudyGoalDialogComponent, { data: { exam }, width: '460px' })
      .afterClosed();
  }

  setMode(mode: StudyGoalSource): void {
    // Switching to manual seeds the input from the current suggestion so the
    // user starts from the computed number and tweaks it.
    if (mode === 'MANUAL' && this.suggestion()) {
      this.manualTarget.set(this.suggestion()!.target);
    }
    this.mode.set(mode);
  }

  private fetchSuggestion(period: GoalPeriod): void {
    this.loadingSuggestion.set(true);
    this.suggestion.set(null);
    this.examService
      .getSuggestedStudyGoal(
        this.data.exam.id,
        period,
        this.data.exam.certificationExamAt,
      )
      .subscribe({
        next: (suggestion) => {
          this.suggestion.set(suggestion);
          this.loadingSuggestion.set(false);
        },
        error: () => this.loadingSuggestion.set(false),
      });
  }

  canSave(): boolean {
    if (this.mode() === 'AUTO') {
      return this.hasExamDate && this.suggestion() !== null;
    }
    const target = this.manualTarget();
    return target !== null && Number.isInteger(target) && target >= 1;
  }

  save(): void {
    if (this.mode() === 'AUTO') {
      const suggestion = this.suggestion();
      if (!suggestion) {
        return;
      }
      this.dialogRef.close({
        period: this.period(),
        target: suggestion.target,
        source: 'AUTO',
      });
      return;
    }
    this.dialogRef.close({
      period: this.period(),
      target: this.manualTarget()!,
      source: 'MANUAL',
    });
  }

  remove(): void {
    this.dialogRef.close(null);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}

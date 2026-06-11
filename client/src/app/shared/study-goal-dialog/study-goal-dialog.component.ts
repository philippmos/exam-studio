import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';

import { Exam, GoalPeriod, StudyGoal } from '../../core/models';

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
    MatRadioModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Study goal</h2>
    <mat-dialog-content>
      <p class="hint">
        How many questions of "{{ data.exam.name }}" do you want to go through?
      </p>

      <mat-radio-group
        class="periods"
        [ngModel]="period()"
        (ngModelChange)="period.set($event)"
      >
        <mat-radio-button value="DAILY">
          <span class="period-title">Daily</span>
          <span class="period-desc">The goal resets every day at midnight.</span>
        </mat-radio-button>

        <mat-radio-button value="WEEKLY">
          <span class="period-title">Weekly</span>
          <span class="period-desc">
            The goal covers the current week, Monday to Sunday.
          </span>
        </mat-radio-button>
      </mat-radio-group>

      <mat-form-field appearance="outline" class="target-field">
        <mat-label>
          Questions per {{ period() === 'DAILY' ? 'day' : 'week' }}
        </mat-label>
        <input
          matInput
          type="number"
          min="1"
          [ngModel]="target()"
          (ngModelChange)="target.set($event)"
        />
      </mat-form-field>
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

  readonly period = signal<GoalPeriod>(
    this.data.exam.studyGoal?.period ?? 'DAILY',
  );
  readonly target = signal<number | null>(
    this.data.exam.studyGoal?.target ?? 10,
  );

  /** Opens the dialog for an exam; see {@link StudyGoalDialogResult}. */
  static open(
    dialog: MatDialog,
    exam: Exam,
  ): Observable<StudyGoalDialogResult> {
    return dialog
      .open<StudyGoalDialogComponent, DialogData, StudyGoalDialogResult>(
        StudyGoalDialogComponent,
        { data: { exam }, width: '460px' },
      )
      .afterClosed();
  }

  canSave(): boolean {
    const target = this.target();
    return target !== null && Number.isInteger(target) && target >= 1;
  }

  save(): void {
    this.dialogRef.close({ period: this.period(), target: this.target()! });
  }

  remove(): void {
    this.dialogRef.close(null);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}

import {
  ChangeDetectionStrategy,
  Component,
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
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { Exam } from '../../core/models';

interface DialogData {
  exam: Exam;
}

/**
 * Result of the exam-date dialog: an ISO 8601 datetime to set, `null` to
 * remove the current date, `undefined` when the dialog was cancelled.
 */
export type ExamDateDialogResult = string | null | undefined;

/** ISO datetime -> "YYYY-MM-DDTHH:mm" in local time for <input datetime-local>. */
function toLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

@Component({
  selector: 'app-exam-date-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Certification exam</h2>
    <mat-dialog-content>
      <p class="hint">
        When do you sit the "{{ data.exam.name }}" certification exam?
      </p>

      <mat-form-field appearance="outline" class="date-field">
        <mat-label>Exam date &amp; time</mat-label>
        <input
          matInput
          type="datetime-local"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
        />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.exam.certificationExamAt) {
        <button mat-button class="remove" (click)="remove()">
          Remove date
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
      .date-field {
        width: 100%;
        margin-top: 8px;
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
export class ExamDateDialogComponent {
  readonly data = inject<DialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<ExamDateDialogComponent, ExamDateDialogResult>,
  );

  /** datetime-local wall-clock string ("YYYY-MM-DDTHH:mm"), '' when unset. */
  readonly value = signal<string>(
    toLocalInput(this.data.exam.certificationExamAt),
  );

  /** Opens the dialog for an exam; see {@link ExamDateDialogResult}. */
  static open(dialog: MatDialog, exam: Exam): Observable<ExamDateDialogResult> {
    return dialog
      .open<
        ExamDateDialogComponent,
        DialogData,
        ExamDateDialogResult
      >(ExamDateDialogComponent, { data: { exam }, width: '460px' })
      .afterClosed();
  }

  canSave(): boolean {
    return this.value().length > 0;
  }

  save(): void {
    // The picker holds local wall time; persist it to the API as a UTC ISO
    // string so it round-trips back to the same instant on display.
    this.dialogRef.close(new Date(this.value()).toISOString());
  }

  remove(): void {
    this.dialogRef.close(null);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}

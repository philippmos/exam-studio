import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ExamService } from '../../core/exam-service';
import { Exam } from '../../core/models';

/** Data passed in when opening the dialog. */
export interface AddQuestionsDialogData {
  examId: string;
}

/** Closed-with result: the updated exam and how many were added vs. skipped. */
export interface AddQuestionsResult {
  exam: Exam;
  added: number;
  skipped: number;
}

@Component({
  selector: 'app-add-questions-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add questions</h2>
    <mat-dialog-content>
      <p class="hint">
        Select an exam JSON file (e.g. <code>exam.json</code>). New questions
        are added to this exam; questions that already exist are skipped and
        nothing is removed.
      </p>

      <button mat-stroked-button type="button" (click)="fileInput.click()">
        <mat-icon>upload_file</mat-icon>
        {{ fileName() ?? 'Choose file…' }}
      </button>
      <input
        #fileInput
        type="file"
        accept="application/json,.json"
        hidden
        (change)="onFileSelected($event)"
      />

      @if (importing()) {
        <mat-progress-bar mode="indeterminate" class="progress" />
      }
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [disabled]="importing()" (click)="close()">
        Cancel
      </button>
      <button
        mat-flat-button
        [disabled]="!fileContent() || importing()"
        (click)="doImport()"
      >
        Add
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .hint {
        color: var(--mat-sys-on-surface-variant);
        margin-bottom: 16px;
      }
      .progress {
        margin-top: 16px;
      }
      .error {
        color: var(--mat-sys-error);
        margin-top: 12px;
      }
      mat-dialog-content {
        min-width: 360px;
        overflow: hidden;
      }
    `,
  ],
})
export class AddQuestionsDialog {
  private readonly examService = inject(ExamService);
  private readonly dialogRef =
    inject<MatDialogRef<AddQuestionsDialog, AddQuestionsResult>>(MatDialogRef);
  private readonly data = inject<AddQuestionsDialogData>(MAT_DIALOG_DATA);

  readonly fileName = signal<string | null>(null);
  readonly fileContent = signal<string | null>(null);
  readonly importing = signal(false);
  readonly error = signal<string | null>(null);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.fileName.set(file.name);
    this.error.set(null);
    file
      .text()
      .then((text) => this.fileContent.set(text))
      .catch(() => this.error.set('Could not read the selected file.'));
  }

  doImport(): void {
    const payload = this.fileContent();
    if (!payload) {
      return;
    }
    this.importing.set(true);
    this.error.set(null);
    this.examService.addExamQuestions(this.data.examId, payload).subscribe({
      next: (result) => this.dialogRef.close(result),
      error: (err: Error) => {
        this.importing.set(false);
        this.error.set(err.message ?? 'Import failed.');
      },
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}

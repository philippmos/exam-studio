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
import { Observable, from, switchMap } from 'rxjs';

import { ExamService } from '../../core/exam-service';
import { Exam } from '../../core/models';

/** Whether a picked file is a ZIP bundle (images) rather than a plain JSON. */
function isZip(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  );
}

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
        Select an exam <code>.json</code> file, or a <code>.zip</code> bundle
        (<code>exam.json</code> + an <code>images/</code> folder) when questions
        embed pictures. New questions are added to this exam; questions that
        already exist are skipped and nothing is removed.
      </p>

      <button mat-stroked-button type="button" (click)="fileInput.click()">
        <mat-icon>upload_file</mat-icon>
        {{ fileName() ?? 'Choose file…' }}
      </button>
      <input
        #fileInput
        type="file"
        accept="application/json,.json,application/zip,.zip"
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
        [disabled]="!file() || importing()"
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
  readonly file = signal<File | null>(null);
  readonly importing = signal(false);
  readonly error = signal<string | null>(null);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.file.set(file);
    this.fileName.set(file.name);
    this.error.set(null);
  }

  doImport(): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.importing.set(true);
    this.error.set(null);
    // ZIP bundles (with images) go to the upload endpoint; a plain JSON file is
    // read client-side and sent as the GraphQL string payload as before.
    const added: Observable<AddQuestionsResult> = isZip(file)
      ? this.examService.addExamQuestionsZip(this.data.examId, file)
      : from(file.text()).pipe(
          switchMap((text) =>
            this.examService.addExamQuestions(this.data.examId, text),
          ),
        );
    added.subscribe({
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

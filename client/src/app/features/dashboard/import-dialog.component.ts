import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ExamService } from '../../core/exam.service';
import { Exam } from '../../core/models';

@Component({
  selector: 'app-import-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Import exam</h2>
    <mat-dialog-content>
      <p class="hint">
        Select an exam JSON file (e.g. <code>ceh_questions.json</code>). A new
        exam will be created from its sections and questions.
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
        color="primary"
        [disabled]="!fileContent() || importing()"
        (click)="doImport()"
      >
        Import
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .hint {
        color: rgba(0, 0, 0, 0.6);
        margin-bottom: 16px;
      }
      .progress {
        margin-top: 16px;
      }
      .error {
        color: #b00020;
        margin-top: 12px;
      }
      mat-dialog-content {
        min-width: 360px;
      }
    `,
  ],
})
export class ImportDialogComponent {
  private readonly examService = inject(ExamService);
  private readonly dialogRef = inject(MatDialogRef<ImportDialogComponent, Exam>);

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
    this.examService.importExam(payload).subscribe({
      next: (exam) => this.dialogRef.close(exam),
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

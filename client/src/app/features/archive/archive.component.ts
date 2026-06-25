import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ExamService } from '../../core/exam.service';
import { Exam } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-archive',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Archive</h1>
          <p class="subtitle">
            Archived exams stay out of your dashboard but keep counting towards
            your statistics and streak. Restore one to practise it again.
          </p>
        </div>
      </header>

      @if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else if (exams().length === 0) {
        <div class="empty-state">
          <div class="empty-icon"><mat-icon>inventory_2</mat-icon></div>
          <p>No archived exams. Archive one from the dashboard to tuck it away.</p>
          <button mat-stroked-button (click)="goDashboard()">
            <mat-icon>grid_view</mat-icon> Browse exams
          </button>
        </div>
      } @else {
        <div class="grid">
          @for (exam of exams(); track exam.id) {
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
                <p class="archived-note">
                  <mat-icon>inventory_2</mat-icon>
                  <span>Archived</span>
                </p>
              </mat-card-content>
              <mat-card-actions class="actions">
                <button
                  mat-icon-button
                  matTooltip="Learning progress"
                  aria-label="Learning progress"
                  (click)="openProgress(exam)"
                >
                  <mat-icon>insights</mat-icon>
                </button>
                <button
                  mat-icon-button
                  matTooltip="Delete exam"
                  aria-label="Delete exam"
                  class="delete"
                  (click)="deleteExam(exam)"
                >
                  <mat-icon>delete_outline</mat-icon>
                </button>
                <span class="spacer"></span>
                <button mat-flat-button (click)="restoreExam(exam)">
                  <mat-icon>unarchive</mat-icon> Restore
                </button>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
      }
      .exam-card {
        height: 100%;
        display: flex;
        flex-direction: column;
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
      .archived-note {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin: 14px 0 0;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--mat-sys-surface-container-highest);
        color: var(--mat-sys-on-surface-variant);
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0.02em;
      }
      .archived-note mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 8px 12px 12px;
      }
      .spacer {
        flex: 1;
      }
      .delete:hover mat-icon {
        color: var(--app-danger);
      }
    `,
  ],
})
export class ArchiveComponent {
  private readonly examService = inject(ExamService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly exams = signal<Exam[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.examService.getArchivedExams().subscribe({
      next: (exams) => {
        this.exams.set(exams);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
  }

  /** Restore an exam so it shows on the dashboard and can run sessions again. */
  restoreExam(exam: Exam): void {
    this.examService.setExamArchived(exam.id, false).subscribe({
      next: () => {
        this.exams.update((list) => list.filter((e) => e.id !== exam.id));
        this.snackBar.open(`"${exam.name}" restored.`, 'OK', { duration: 3000 });
      },
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  openProgress(exam: Exam): void {
    this.router.navigate(['/exams', exam.id, 'progress']);
  }

  deleteExam(exam: Exam): void {
    ConfirmDialogComponent.open(this.dialog, {
      title: 'Delete exam',
      message: `Delete "${exam.name}" and all of its data? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    }).subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }
      this.examService.deleteExam(exam.id).subscribe({
        next: () => {
          this.exams.update((list) => list.filter((e) => e.id !== exam.id));
          this.snackBar.open('Exam deleted.', 'OK', { duration: 3000 });
        },
        error: (err: Error) =>
          this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
      });
    });
  }

  goDashboard(): void {
    this.router.navigate(['/']);
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { Exam, StudyGoalProgress } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ExamCardComponent } from '../../shared/exam-card/exam-card.component';
import { StudyGoalDialogComponent } from '../../shared/study-goal-dialog/study-goal-dialog.component';
import { ImportDialogComponent } from './import-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ExamCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Your exams</h1>
          <p class="subtitle">Pick a certification to start practising.</p>
        </div>
        <button mat-flat-button (click)="openImport()">
          <mat-icon>add</mat-icon> Import exam
        </button>
      </header>

      @if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else if (exams().length === 0) {
        <div class="empty-state">
          <div class="empty-icon"><mat-icon>school</mat-icon></div>
          <p>No exams yet. Import a JSON file to get started.</p>
          <button mat-stroked-button (click)="openImport()">
            <mat-icon>upload_file</mat-icon> Import your first exam
          </button>
        </div>
      } @else {
        <div class="grid">
          @for (exam of exams(); track exam.id) {
            <app-exam-card
              [exam]="exam"
              [goalProgress]="goalFor(exam.id)"
              (open)="openExam($event)"
              (progress)="openProgress($event)"
              (goal)="editGoal($event)"
              (delete)="deleteExam($event)"
            />
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
    `,
  ],
})
export class DashboardComponent {
  private readonly examService = inject(ExamService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  readonly exams = signal<Exam[]>([]);
  readonly goalProgress = signal<StudyGoalProgress[]>([]);
  readonly loading = signal(true);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.examService.getExams().subscribe({
      next: (exams) => {
        this.exams.set(exams);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
    this.loadGoalProgress();
  }

  /** The goal bars are supplementary: on error just leave them hidden. */
  private loadGoalProgress(): void {
    this.examService.getStudyGoalProgress().subscribe({
      next: (progress) => this.goalProgress.set(progress),
      error: () => undefined,
    });
  }

  goalFor(examId: string): StudyGoalProgress | null {
    return this.goalProgress().find((gp) => gp.examId === examId) ?? null;
  }

  openImport(): void {
    this.dialog
      .open(ImportDialogComponent, { width: '480px' })
      .afterClosed()
      .subscribe((exam: Exam | undefined) => {
        if (exam) {
          this.snackBar.open(`Imported "${exam.name}".`, 'OK', {
            duration: 3000,
          });
          this.load();
        }
      });
  }

  openExam(exam: Exam): void {
    this.router.navigate(['/exams', exam.id]);
  }

  openProgress(exam: Exam): void {
    this.router.navigate(['/exams', exam.id, 'progress']);
  }

  editGoal(exam: Exam): void {
    StudyGoalDialogComponent.open(this.dialog, exam).subscribe((result) => {
      if (result === undefined) {
        return; // cancelled
      }
      const request =
        result === null
          ? this.examService.clearStudyGoal(exam.id)
          : this.examService.setStudyGoal(exam.id, result.period, result.target);
      request.subscribe({
        next: (updated) => {
          this.exams.update((list) =>
            list.map((e) => (e.id === updated.id ? updated : e)),
          );
          this.loadGoalProgress();
          this.snackBar.open(
            result === null ? 'Study goal removed.' : 'Study goal saved.',
            'OK',
            { duration: 3000 },
          );
        },
        error: (err: Error) =>
          this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
      });
    });
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
}

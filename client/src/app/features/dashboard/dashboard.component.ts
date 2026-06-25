import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { Exam, ReviewDue, StudyGoalProgress, StudyStreak } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { ExamCardComponent } from '../../shared/exam-card/exam-card.component';
import { StreakCardComponent } from '../../shared/streak-card/streak-card.component';
import { StudyGoalDialogComponent } from '../../shared/study-goal-dialog/study-goal-dialog.component';
import { ExamDateDialogComponent } from '../../shared/exam-date-dialog/exam-date-dialog.component';
import { ImportDialogComponent } from './import-dialog.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ExamCardComponent,
    StreakCardComponent,
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
        @if (streak(); as s) {
          <app-streak-card class="streak" [streak]="s" />
        }
        <div class="grid">
          @for (exam of exams(); track exam.id) {
            <app-exam-card
              [exam]="exam"
              [goalProgress]="goalFor(exam.id)"
              [dueCount]="dueFor(exam.id)"
              (open)="openExam($event)"
              (progress)="openProgress($event)"
              (goal)="editGoal($event)"
              (examDate)="editExamDate($event)"
              (review)="startReview($event)"
              (archive)="archiveExam($event)"
              (delete)="deleteExam($event)"
            />
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .streak {
        display: block;
        margin-bottom: 24px;
      }
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
  readonly reviewDue = signal<ReviewDue[]>([]);
  readonly streak = signal<StudyStreak | null>(null);
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
    this.loadReviewDue();
    this.loadStreak();
  }

  /** The streak banner is supplementary: on error just leave it hidden. */
  private loadStreak(): void {
    this.examService.getStudyStreak().subscribe({
      next: (streak) => this.streak.set(streak),
      error: () => undefined,
    });
  }

  /** The goal bars are supplementary: on error just leave them hidden. */
  private loadGoalProgress(): void {
    this.examService.getStudyGoalProgress().subscribe({
      next: (progress) => this.goalProgress.set(progress),
      error: () => undefined,
    });
  }

  /** The review chips are supplementary: on error just leave them hidden. */
  private loadReviewDue(): void {
    this.examService.getReviewDue().subscribe({
      next: (due) => this.reviewDue.set(due),
      error: () => undefined,
    });
  }

  goalFor(examId: string): StudyGoalProgress | null {
    return this.goalProgress().find((gp) => gp.examId === examId) ?? null;
  }

  dueFor(examId: string): number {
    return this.reviewDue().find((d) => d.examId === examId)?.dueCount ?? 0;
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

  /** Start a spaced-repetition session straight from the dashboard chip. */
  startReview(exam: Exam): void {
    this.examService.startSession(exam.id, 'DUE_REVIEW', null).subscribe({
      next: (session) => {
        if (session.total === 0) {
          this.snackBar.open('Nothing is due for review right now.', 'OK', {
            duration: 4000,
          });
          this.reviewDue.update((list) =>
            list.filter((d) => d.examId !== exam.id),
          );
          return;
        }
        this.router.navigate(['/sessions', session.id]);
      },
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
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
          : this.examService.setStudyGoal(
              exam.id,
              result.period,
              result.target,
              result.source,
            );
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

  editExamDate(exam: Exam): void {
    ExamDateDialogComponent.open(this.dialog, exam).subscribe((result) => {
      if (result === undefined) {
        return; // cancelled
      }
      const request =
        result === null
          ? this.examService.clearCertificationExamDate(exam.id)
          : this.examService.setCertificationExamDate(exam.id, result);
      request.subscribe({
        next: (updated) => {
          this.exams.update((list) =>
            list.map((e) => (e.id === updated.id ? updated : e)),
          );
          // Setting/clearing the date may have (re)computed an automatic goal
          // server-side, so refresh the progress bars to match.
          this.loadGoalProgress();
          this.snackBar.open(this.examDateMessage(result, updated), 'OK', {
            duration: 4000,
          });
        },
        error: (err: Error) =>
          this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
      });
    });
  }

  /** Snackbar text after setting/clearing an exam date, noting an auto goal. */
  private examDateMessage(result: string | null, updated: Exam): string {
    if (result === null) {
      return 'Exam date removed.';
    }
    const goal = updated.studyGoal;
    if (goal?.source === 'AUTO') {
      const unit = goal.period === 'DAILY' ? 'day' : 'week';
      return `Exam date saved. Study goal set to ${goal.target} / ${unit}.`;
    }
    return 'Exam date saved.';
  }

  /** Archive an exam: it leaves the dashboard but its history is kept. */
  archiveExam(exam: Exam): void {
    this.examService.setExamArchived(exam.id, true).subscribe({
      next: () => {
        this.exams.update((list) => list.filter((e) => e.id !== exam.id));
        this.snackBar
          .open(`"${exam.name}" archived.`, 'Undo', { duration: 5000 })
          .onAction()
          .subscribe(() => this.restoreExam(exam));
      },
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  /** Undo an archive: restore the exam and bring it back to the dashboard. */
  private restoreExam(exam: Exam): void {
    this.examService.setExamArchived(exam.id, false).subscribe({
      next: () => this.load(),
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
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

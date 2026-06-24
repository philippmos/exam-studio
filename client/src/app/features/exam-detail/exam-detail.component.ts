import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { Exam, SessionSetup } from '../../core/models';
import { StudyGoalDialogComponent } from '../../shared/study-goal-dialog/study-goal-dialog.component';
import { SessionSetupDialogComponent } from './session-setup-dialog.component';

@Component({
  selector: 'app-exam-detail',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <button mat-button (click)="goBack()" class="back">
        <mat-icon>arrow_back</mat-icon> Dashboard
      </button>

      @if (exam(); as exam) {
        <header class="page-header">
          <div>
            <h1>{{ exam.name }}</h1>
            @if (exam.issuer) {
              <p class="subtitle">{{ exam.issuer }}</p>
            }
            <p class="meta">
              {{ exam.sections.length }} modules · {{ exam.questionCount }}
              questions
              @if (exam.studyGoal; as goal) {
                · Goal: {{ goal.target }} questions per
                {{ goal.period === 'DAILY' ? 'day' : 'week' }}
              }
              @if (dueCount() > 0) {
                · {{ dueCount() }} due for review
              }
            </p>
          </div>
          <div class="header-actions">
            @if (dueCount() > 0) {
              <button mat-stroked-button (click)="startReview(exam)">
                <mat-icon>autorenew</mat-icon> Review due ({{ dueCount() }})
              </button>
            }
            <button mat-stroked-button (click)="editGoal(exam)">
              <mat-icon>flag</mat-icon>
              {{ exam.studyGoal ? 'Edit study goal' : 'Set study goal' }}
            </button>
            <button mat-stroked-button [routerLink]="['/exams', exam.id, 'progress']">
              <mat-icon>insights</mat-icon> Learning progress
            </button>
            <button mat-flat-button (click)="openSetup(exam)">
              <mat-icon>play_arrow</mat-icon> Start exam mode
            </button>
          </div>
        </header>

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>Modules</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-list>
              @for (section of exam.sections; track section.id) {
                <mat-list-item>
                  <mat-icon matListItemIcon>folder_open</mat-icon>
                  <span matListItemTitle>{{ section.name }}</span>
                  <span matListItemMeta class="count">
                    {{ section.questionCount }} questions
                  </span>
                </mat-list-item>
              }
            </mat-list>
          </mat-card-content>
        </mat-card>
      } @else if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else {
        <p>Exam not found.</p>
      }
    </div>
  `,
  styles: [
    `
      .back {
        margin: 0 0 12px -12px;
      }
      .meta {
        margin: 8px 0 0;
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .header-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .count {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class ExamDetailComponent implements OnInit {
  private readonly examService = inject(ExamService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** Bound from the `:id` route param via withComponentInputBinding(). */
  readonly id = input.required<string>();

  readonly exam = signal<Exam | null>(null);
  readonly dueCount = signal(0);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.examService.getExam(this.id()).subscribe({
      next: (exam) => {
        this.exam.set(exam);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
    // The review badge is supplementary: on error just leave it at zero.
    this.examService.getReviewDue(this.id()).subscribe({
      next: (due) => this.dueCount.set(due[0]?.dueCount ?? 0),
      error: () => undefined,
    });
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
          this.exam.set(updated);
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

  openSetup(exam: Exam): void {
    this.dialog
      .open(SessionSetupDialogComponent, {
        data: { exam, dueCount: this.dueCount() },
        width: '460px',
      })
      .afterClosed()
      .subscribe((setup: SessionSetup | undefined) => {
        if (setup) {
          this.startSession(exam, setup);
        }
      });
  }

  /** Shortcut from the header button: jump straight into a due-review session. */
  startReview(exam: Exam): void {
    this.startSession(exam, { mode: 'DUE_REVIEW', sectionId: null });
  }

  private startSession(exam: Exam, setup: SessionSetup): void {
    this.examService
      .startSession(exam.id, setup.mode, setup.sectionId)
      .subscribe({
        next: (session) => {
          if (session.total === 0) {
            this.snackBar.open(
              'No questions match this selection.',
              'OK',
              { duration: 4000 },
            );
            return;
          }
          this.router.navigate(['/sessions', session.id]);
        },
        error: (err: Error) =>
          this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
      });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}

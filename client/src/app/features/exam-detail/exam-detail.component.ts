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
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { Exam, ExamStats, SessionSetup } from '../../core/models';
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

        @if (stats(); as stats) {
          <mat-card class="progress-card" appearance="outlined">
            <mat-card-content>
              <div class="progress-copy">
                <div class="progress-kicker">Overall progress</div>
                <div class="progress-title">
                  {{ stats.attemptedQuestions }} / {{ stats.totalQuestions }} questions answered
                </div>
                <div class="progress-meta">
                  {{ stats.correctAttempts }} correct · {{ stats.incorrectAttempts }} wrong ·
                  {{ pct(stats.coverage) }}% coverage
                </div>
              </div>
              <div class="progress-bar" aria-hidden="true">
                <div
                  class="progress-fill mastered"
                  [style.width.%]="ratio(stats.masteredQuestions, stats.totalQuestions)"
                ></div>
                <div
                  class="progress-fill struggling"
                  [style.width.%]="ratio(stats.strugglingQuestions, stats.totalQuestions)"
                ></div>
                <div
                  class="progress-fill untouched"
                  [style.width.%]="ratio(stats.unattemptedQuestions, stats.totalQuestions)"
                ></div>
              </div>
              <div class="progress-legend">
                <span>Mastered {{ stats.masteredQuestions }}</span>
                <span>Review {{ stats.strugglingQuestions }}</span>
                <span>Not started {{ stats.unattemptedQuestions }}</span>
              </div>
            </mat-card-content>
          </mat-card>
        }

        <mat-card appearance="outlined">
          <mat-card-header>
            <mat-card-title>Modules</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (stats(); as stats) {
              <div class="modules-table">
                <div class="modules-head">
                  <span>Module</span>
                  <span>Questions</span>
                  <span>Answered</span>
                  <span>Correct</span>
                  <span>Wrong</span>
                  <span>Progress</span>
                </div>
                @for (section of stats.sections; track section.sectionId) {
                  <div class="module-row">
                    <div class="module-name">
                      <mat-icon>folder_open</mat-icon>
                      <span>{{ section.name }}</span>
                    </div>
                    <span>{{ section.totalQuestions }}</span>
                    <span>{{ section.attemptedQuestions }}</span>
                    <span class="good">{{ section.correctAttempts }}</span>
                    <span class="bad">{{ section.incorrectAttempts }}</span>
                    <div class="progress-mini" aria-hidden="true">
                      <div
                        class="progress-fill mastered"
                        [style.width.%]="ratio(section.masteredQuestions, section.totalQuestions)"
                      ></div>
                      <div
                        class="progress-fill struggling"
                        [style.width.%]="ratio(section.strugglingQuestions, section.totalQuestions)"
                      ></div>
                      <div
                        class="progress-fill untouched"
                        [style.width.%]="
                          ratio(
                            section.totalQuestions -
                              section.masteredQuestions -
                              section.strugglingQuestions,
                            section.totalQuestions
                          )
                        "
                      ></div>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <p class="empty-note">Module progress is loading.</p>
            }
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
      .progress-card {
        display: grid;
        gap: 14px;
        margin-bottom: 20px;
      }
      .progress-kicker {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
        margin-bottom: 6px;
      }
      .progress-title {
        font-size: 18px;
        font-weight: 600;
      }
      .progress-meta {
        margin-top: 4px;
        margin-bottom: 0.5rem;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .progress-bar,
      .progress-mini {
        display: flex;
        width: 100%;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: #eceff1;
      }
      .progress-bar {
        height: 14px;
      }
      .progress-fill {
        height: 100%;
        transition: width 0.3s ease;
      }
      .progress-fill.mastered {
        background: var(--app-success);
      }
      .progress-fill.struggling {
        background: var(--app-warning);
      }
      .progress-fill.untouched {
        background: transparent;
      }
      .progress-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 13px;
        margin-top: 0.5rem;
      }
      .modules-table {
        display: grid;
        gap: 10px;
      }
      .modules-head,
      .module-row {
        display: grid;
        grid-template-columns: minmax(180px, 2fr) 90px 90px 90px 90px minmax(180px, 1.5fr);
        gap: 12px;
        align-items: center;
      }
      .modules-head {
        padding: 0 4px 6px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--mat-sys-on-surface-variant);
      }
      .module-row {
        padding: 12px 4px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      .module-name {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        font-weight: 500;
      }
      .module-name span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .module-name mat-icon {
        color: var(--mat-sys-primary);
        flex: none;
      }
      .module-row span,
      .module-row div {
        font-size: 14px;
      }
      .module-row .good {
        color: var(--app-success);
        font-weight: 500;
      }
      .module-row .bad {
        color: var(--app-warning);
        font-weight: 500;
      }
      .empty-note {
        margin: 0;
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
  readonly stats = signal<ExamStats | null>(null);
  readonly dueCount = signal(0);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.examService.getExam(this.id()).subscribe({
      next: (exam) => {
        // Archived exams can't be practised: send the user back to the
        // dashboard even when the detail URL is opened directly.
        if (exam?.archived) {
          this.snackBar.open('This exam is archived.', 'OK', { duration: 4000 });
          this.router.navigate(['/']);
          return;
        }
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
    this.examService.getExamStats(this.id()).subscribe({
      next: (stats) => this.stats.set(stats),
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

  /** Percentage 0..1 -> rounded integer. */
  pct(value: number): number {
    return Math.round(value * 100);
  }

  /** Width helper for the segmented bars. */
  ratio(part: number, whole: number): number {
    return whole > 0 ? (part / whole) * 100 : 0;
  }
}

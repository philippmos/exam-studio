import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import {
  Allocation,
  AnswerResult,
  ExamSession,
  SessionItem,
} from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { QuestionViewComponent } from '../../shared/question-view/question-view.component';

@Component({
  selector: 'app-quiz',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    QuestionViewComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (session(); as session) {
        @if (finished()) {
          <!-- Summary -->
          <mat-card appearance="outlined" class="summary">
            <mat-card-content class="summary-content">
              <div class="trophy"><mat-icon>emoji_events</mat-icon></div>
              <h1>Session complete</h1>
              <p class="score">
                {{ correctCount() }} / {{ items().length }} correct
              </p>
              <p class="accuracy">{{ accuracy() }}% accuracy</p>
              <div class="summary-actions">
                <button mat-stroked-button (click)="backToExam(session)">
                  Back to exam
                </button>
                <button mat-flat-button (click)="goDashboard()">
                  Dashboard
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        } @else {
          @if (current(); as item) {
            <!-- Runner header -->
            <div class="top">
              <button mat-button (click)="confirmExit()" class="exit">
                <mat-icon>close</mat-icon> Exit
              </button>
              <span class="position">
                Question {{ index() + 1 }} / {{ items().length }}
              </span>
              <span class="live-score">
                <mat-icon>check_circle</mat-icon> {{ correctCount() }}
              </span>
            </div>
            <mat-progress-bar
              mode="determinate"
              [value]="progress()"
              class="progress"
            />

            <mat-card appearance="outlined" class="question-card">
              <mat-card-content>
                <app-question-view
                  [question]="item.question"
                  [answered]="isAnswered(item)"
                  [selectedAnswerIds]="item.selectedAnswerIds"
                  [correctAnswerIds]="item.correctAnswerIds"
                  [selectedAllocations]="item.selectedAllocations"
                  [correctAllocations]="item.correctAllocations"
                  (submitAnswers)="answer(item, $event)"
                  (submitAllocations)="answerAllocation(item, $event)"
                />
              </mat-card-content>
            </mat-card>

            @if (reviewInfo(); as info) {
              <p class="review-hint">
                <mat-icon>autorenew</mat-icon>
                Next review in {{ info.intervalDays }}
                {{ info.intervalDays === 1 ? 'day' : 'days' }} · Box
                {{ info.box }}/5
              </p>
            }

            <!-- Feedback + navigation -->
            <div class="nav">
              <button
                mat-button
                [disabled]="index() === 0"
                (click)="previous()"
              >
                <mat-icon>chevron_left</mat-icon> Previous
              </button>

              @if (isAnswered(item)) {
                <span
                  class="feedback"
                  [class.correct]="item.isCorrect"
                  [class.wrong]="!item.isCorrect"
                >
                  <mat-icon>{{
                    item.isCorrect ? 'check_circle' : 'cancel'
                  }}</mat-icon>
                  {{ item.isCorrect ? 'Correct' : 'Incorrect' }}
                </span>
              } @else {
                <span class="hint">{{ hintFor(item) }}</span>
              }

              @if (isLast()) {
                <button
                  mat-flat-button
                  [disabled]="!allAnswered()"
                  (click)="finish(session)"
                >
                  Finish <mat-icon iconPositionEnd>flag</mat-icon>
                </button>
              } @else {
                <button mat-flat-button (click)="next()">
                  Next <mat-icon iconPositionEnd>chevron_right</mat-icon>
                </button>
              }
            </div>
          }
        }
      } @else if (loading()) {
        <div class="center-state"><mat-spinner diameter="44" /></div>
      } @else {
        <p>Session not found.</p>
      }
    </div>
  `,
  styles: [
    `
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .exit {
        margin-left: -12px;
      }
      .position {
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        color: var(--mat-sys-on-surface-variant);
      }
      .live-score {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        color: var(--app-success);
        font-weight: 500;
        font-variant-numeric: tabular-nums;
      }
      .live-score mat-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
      }
      .progress {
        border-radius: 99px;
        overflow: hidden;
        margin-bottom: 20px;
        --mat-progress-bar-track-height: 8px;
        --mat-progress-bar-active-indicator-height: 8px;
      }
      .question-card {
        margin-bottom: 16px;
      }
      .question-card .mat-mdc-card-content {
        padding: 24px;
      }
      .review-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 16px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .review-hint mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .feedback {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 600;
      }
      .feedback.correct {
        color: var(--app-success);
      }
      .feedback.wrong {
        color: var(--app-danger);
      }
      .hint {
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .summary {
        max-width: 520px;
        margin: 56px auto 0;
        text-align: center;
      }
      .summary-content {
        padding: 48px 24px;
      }
      .trophy {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        margin: 0 auto 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--app-warning-bg);
        color: var(--app-warning);
      }
      .trophy mat-icon {
        font-size: 36px;
        width: 36px;
        height: 36px;
      }
      .summary h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        letter-spacing: -0.015em;
      }
      .score {
        font-size: 28px;
        font-weight: 600;
        margin: 12px 0 0;
        font-variant-numeric: tabular-nums;
      }
      .accuracy {
        color: var(--mat-sys-on-surface-variant);
        margin: 4px 0 28px;
      }
      .summary-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
      }
    `,
  ],
})
export class QuizComponent implements OnInit {
  private readonly examService = inject(ExamService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** Session id, bound from the `:id` route param. */
  readonly id = input.required<string>();

  readonly session = signal<ExamSession | null>(null);
  readonly items = signal<SessionItem[]>([]);
  readonly index = signal(0);
  readonly loading = signal(true);
  readonly finished = signal(false);

  /** Per-item Leitner outcome from this run's answers (item id -> schedule). */
  readonly reviewByItem = signal<
    Record<string, { box: number; intervalDays: number }>
  >({});

  readonly current = computed(() => this.items()[this.index()] ?? null);
  /** Review schedule for the current question, once answered this run. */
  readonly reviewInfo = computed(() => {
    const item = this.current();
    return item ? (this.reviewByItem()[item.id] ?? null) : null;
  });
  readonly correctCount = computed(
    () => this.items().filter((i) => i.isCorrect).length,
  );
  readonly answeredCount = computed(
    () => this.items().filter((i) => i.selectedAnswerIds.length > 0).length,
  );
  readonly progress = computed(() => {
    const total = this.items().length;
    return total ? (this.answeredCount() / total) * 100 : 0;
  });
  readonly accuracy = computed(() => {
    const total = this.items().length;
    return total ? Math.round((this.correctCount() / total) * 100) : 0;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.examService.getSession(this.id()).subscribe({
      next: (session) => {
        this.loading.set(false);
        if (!session) {
          return;
        }
        this.session.set(session);
        this.items.set(session.items);
        // Resume at the first unanswered question.
        const firstUnanswered = session.items.findIndex(
          (i) => i.selectedAnswerIds.length === 0,
        );
        this.index.set(firstUnanswered === -1 ? 0 : firstUnanswered);
      },
      error: (err: Error) => {
        this.loading.set(false);
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 });
      },
    });
  }

  isAnswered(item: SessionItem): boolean {
    return item.selectedAnswerIds.length > 0;
  }

  isLast(): boolean {
    return this.index() === this.items().length - 1;
  }

  allAnswered(): boolean {
    return this.items().every((i) => i.selectedAnswerIds.length > 0);
  }

  answer(item: SessionItem, answerIds: string[]): void {
    if (this.isAnswered(item)) {
      return;
    }
    this.examService.submitAnswer(item.id, answerIds).subscribe({
      next: (result) =>
        this.applyResult(item.id, result, {
          selectedAnswerIds: answerIds,
          correctAnswerIds: result.correctAnswerIds,
        }),
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  answerAllocation(item: SessionItem, allocations: Allocation[]): void {
    if (this.isAnswered(item)) {
      return;
    }
    this.examService.submitAllocation(item.id, allocations).subscribe({
      next: (result) =>
        this.applyResult(item.id, result, {
          // Mark the item answered (isAnswered checks selectedAnswerIds).
          selectedAnswerIds: allocations.map((a) => a.answerId),
          selectedAllocations: allocations,
          correctAllocations: result.correctAllocations,
        }),
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
  }

  /** Merge a submit result onto the item and record its review schedule. */
  private applyResult(
    itemId: string,
    result: AnswerResult,
    patch: Partial<SessionItem>,
  ): void {
    this.items.update((list) =>
      list.map((it) =>
        it.id === itemId
          ? { ...it, ...patch, isCorrect: result.isCorrect }
          : it,
      ),
    );
    this.reviewByItem.update((map) => ({
      ...map,
      [itemId]: {
        box: result.reviewBox,
        intervalDays: result.reviewIntervalDays,
      },
    }));
  }

  hintFor(item: SessionItem): string {
    switch (item.question.questionType) {
      case 'MULTIPLE_CHOICE':
        return 'Select all answers that apply';
      case 'ALLOCATION':
        return 'Sort every item into a basket';
      default:
        return 'Select an answer';
    }
  }

  next(): void {
    if (!this.isLast()) {
      this.index.update((i) => i + 1);
    }
  }

  previous(): void {
    if (this.index() > 0) {
      this.index.update((i) => i - 1);
    }
  }

  finish(session: ExamSession): void {
    this.examService.finishSession(session.id).subscribe({
      next: () => this.finished.set(true),
      error: () => this.finished.set(true),
    });
  }

  confirmExit(): void {
    ConfirmDialogComponent.open(this.dialog, {
      title: 'Exit session?',
      message: 'Your answers are saved — you can resume this session later.',
      confirmLabel: 'Exit',
    }).subscribe((confirmed) => {
      if (confirmed) {
        this.backToExam(this.session()!);
      }
    });
  }

  backToExam(session: ExamSession): void {
    this.router.navigate(['/exams', session.examId]);
  }

  goDashboard(): void {
    this.router.navigate(['/']);
  }
}

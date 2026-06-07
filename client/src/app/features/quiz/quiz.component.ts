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
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExamService } from '../../core/exam.service';
import { ExamSession, SessionItem } from '../../core/models';
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
            <mat-card-content>
              <mat-icon class="trophy">emoji_events</mat-icon>
              <h1>Session complete</h1>
              <p class="score">
                {{ correctCount() }} / {{ items().length }} correct
              </p>
              <p class="accuracy">{{ accuracy() }}% accuracy</p>
              <div class="summary-actions">
                <button mat-stroked-button (click)="backToExam(session)">
                  Back to exam
                </button>
                <button mat-flat-button color="primary" (click)="goDashboard()">
                  Dashboard
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        } @else {
          @if (current(); as item) {
          <!-- Runner header -->
          <div class="top">
            <button mat-button (click)="confirmExit()">
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
                [selectedAnswerId]="item.selectedAnswerId"
                [correctAnswerId]="item.correctAnswerId"
                (select)="answer(item, $event)"
              />
            </mat-card-content>
          </mat-card>

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
              <span class="hint">Select an answer</span>
            }

            @if (isLast()) {
              <button
                mat-flat-button
                color="primary"
                [disabled]="!allAnswered()"
                (click)="finish(session)"
              >
                Finish <mat-icon>flag</mat-icon>
              </button>
            } @else {
              <button mat-flat-button color="primary" (click)="next()">
                Next <mat-icon>chevron_right</mat-icon>
              </button>
            }
          </div>
          }
        }
      } @else if (loading()) {
        <div class="center"><mat-spinner diameter="48" /></div>
      } @else {
        <p>Session not found.</p>
      }
    </div>
  `,
  styles: [
    `
      .center {
        display: flex;
        justify-content: center;
        padding: 64px 0;
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .position {
        font-weight: 500;
      }
      .live-score {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #2e7d32;
        font-weight: 500;
      }
      .progress {
        border-radius: 4px;
        margin-bottom: 16px;
      }
      .question-card {
        margin-bottom: 16px;
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
        color: #2e7d32;
      }
      .feedback.wrong {
        color: #c62828;
      }
      .hint {
        color: rgba(0, 0, 0, 0.5);
      }
      .summary {
        text-align: center;
        margin-top: 48px;
      }
      .summary .trophy {
        font-size: 64px;
        height: 64px;
        width: 64px;
        color: #f9a825;
      }
      .score {
        font-size: 28px;
        font-weight: 600;
        margin: 8px 0 0;
      }
      .accuracy {
        color: rgba(0, 0, 0, 0.6);
        margin: 4px 0 24px;
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

  /** Session id, bound from the `:id` route param. */
  readonly id = input.required<string>();

  readonly session = signal<ExamSession | null>(null);
  readonly items = signal<SessionItem[]>([]);
  readonly index = signal(0);
  readonly loading = signal(true);
  readonly finished = signal(false);

  readonly current = computed(() => this.items()[this.index()] ?? null);
  readonly correctCount = computed(
    () => this.items().filter((i) => i.isCorrect).length,
  );
  readonly answeredCount = computed(
    () => this.items().filter((i) => i.selectedAnswerId !== null).length,
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
          (i) => i.selectedAnswerId === null,
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
    return item.selectedAnswerId !== null;
  }

  isLast(): boolean {
    return this.index() === this.items().length - 1;
  }

  allAnswered(): boolean {
    return this.items().every((i) => i.selectedAnswerId !== null);
  }

  answer(item: SessionItem, answerId: string): void {
    if (this.isAnswered(item)) {
      return;
    }
    this.examService.submitAnswer(item.id, answerId).subscribe({
      next: (result) => {
        this.items.update((list) =>
          list.map((it) =>
            it.id === item.id
              ? {
                  ...it,
                  selectedAnswerId: answerId,
                  correctAnswerId: result.correctAnswerId,
                  isCorrect: result.isCorrect,
                }
              : it,
          ),
        );
      },
      error: (err: Error) =>
        this.snackBar.open(err.message, 'Dismiss', { duration: 5000 }),
    });
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
    if (confirm('Exit this session? Your answers are saved.')) {
      this.backToExam(this.session()!);
    }
  }

  backToExam(session: ExamSession): void {
    this.router.navigate(['/exams', session.examId]);
  }

  goDashboard(): void {
    this.router.navigate(['/']);
  }
}

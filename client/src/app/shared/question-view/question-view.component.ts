import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { Answer, Question } from '../../core/models';

@Component({
  selector: 'app-question-view',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Question text is imported, trusted content; Angular sanitises innerHTML. -->
    <div class="question-text" [innerHTML]="question.text"></div>

    @if (isMultiple && !answered) {
      <p class="multi-hint">
        <mat-icon>checklist</mat-icon> Select all answers that apply.
      </p>
    }

    <div class="options">
      @for (answer of question.answers; track answer.id; let i = $index) {
        <button
          type="button"
          class="option"
          [class.selected]="!answered && isSelected(answer)"
          [class.correct]="answered && isCorrectAnswer(answer)"
          [class.wrong]="
            answered && isSelected(answer) && !isCorrectAnswer(answer)
          "
          [class.muted]="answered && !isHighlighted(answer)"
          [disabled]="answered"
          (click)="onOptionClick(answer)"
        >
          <span class="letter">{{ letters[i] }}</span>
          <span class="label">{{ answer.text }}</span>
          @if (answered && isCorrectAnswer(answer)) {
            <mat-icon class="state-icon">check_circle</mat-icon>
          } @else if (
            answered && isSelected(answer) && !isCorrectAnswer(answer)
          ) {
            <mat-icon class="state-icon">cancel</mat-icon>
          } @else if (!answered && isSelected(answer)) {
            <mat-icon class="state-icon">check</mat-icon>
          }
        </button>
      }
    </div>

    @if (isMultiple && !answered) {
      <div class="submit-row">
        <button
          mat-flat-button
          [disabled]="pending.length === 0"
          (click)="submitPending()"
        >
          Check answer
        </button>
      </div>
    }
  `,
  styles: [
    `
      .question-text {
        font-size: 17px;
        line-height: 1.6;
        margin-bottom: 24px;
      }
      .question-text ::ng-deep pre {
        background: #1f2430;
        color: #f8f8f2;
        padding: 12px 16px;
        border-radius: 10px;
        overflow-x: auto;
        font-size: 14px;
      }
      .multi-hint {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--mat-sys-primary);
        font-weight: 500;
        margin: 0 0 16px;
      }
      .multi-hint mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .options {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .option {
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        padding: 14px 16px;
        border: 2px solid
          color-mix(in srgb, var(--mat-sys-outline-variant) 55%, transparent);
        border-radius: 12px;
        background: var(--mat-sys-surface);
        color: inherit;
        font: inherit;
        font-size: 15px;
        line-height: 1.45;
        cursor: pointer;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .option:not(:disabled):hover {
        border-color: var(--mat-sys-primary);
        background: color-mix(in srgb, var(--mat-sys-primary) 4%, var(--mat-sys-surface));
      }
      .option:focus-visible {
        outline: 2px solid var(--mat-sys-primary);
        outline-offset: 2px;
      }
      .option:disabled {
        cursor: default;
      }
      .letter {
        flex: 0 0 28px;
        height: 28px;
        width: 28px;
        border-radius: 50%;
        background: var(--mat-sys-surface-container);
        color: var(--mat-sys-on-surface-variant);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 600;
      }
      .label {
        flex: 1;
      }
      .state-icon {
        flex: 0 0 auto;
      }
      .option.selected {
        border-color: var(--mat-sys-primary);
        background: color-mix(in srgb, var(--mat-sys-primary) 6%, var(--mat-sys-surface));
      }
      .option.selected .letter {
        background: var(--mat-sys-primary);
        color: var(--mat-sys-on-primary);
      }
      .option.selected .state-icon {
        color: var(--mat-sys-primary);
      }
      .option.correct {
        border-color: var(--app-success);
        background: var(--app-success-bg);
      }
      .option.correct .letter,
      .option.correct .state-icon {
        color: var(--app-success);
      }
      .option.correct .letter {
        background: color-mix(in srgb, var(--app-success) 14%, transparent);
      }
      .option.wrong {
        border-color: var(--app-danger);
        background: var(--app-danger-bg);
      }
      .option.wrong .letter,
      .option.wrong .state-icon {
        color: var(--app-danger);
      }
      .option.wrong .letter {
        background: color-mix(in srgb, var(--app-danger) 12%, transparent);
      }
      .option.muted {
        opacity: 0.55;
      }
      .submit-row {
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
    `,
  ],
})
export class QuestionViewComponent implements OnChanges {
  @Input({ required: true }) question!: Question;
  @Input() answered = false;
  @Input() selectedAnswerIds: string[] = [];
  @Input() correctAnswerIds: string[] | null = null;
  /** Emits the chosen answer ids: one for single choice, several for multiple. */
  @Output() submitAnswers = new EventEmitter<string[]>();

  readonly letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  /** Local multiple-choice selection, before it is submitted. */
  pending: string[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['question']) {
      this.pending = [];
    }
  }

  get isMultiple(): boolean {
    return this.question.questionType === 'MULTIPLE_CHOICE';
  }

  onOptionClick(answer: Answer): void {
    if (this.answered) {
      return;
    }
    if (!this.isMultiple) {
      this.submitAnswers.emit([answer.id]);
      return;
    }
    this.pending = this.pending.includes(answer.id)
      ? this.pending.filter((id) => id !== answer.id)
      : [...this.pending, answer.id];
  }

  submitPending(): void {
    if (this.pending.length > 0) {
      this.submitAnswers.emit(this.pending);
    }
  }

  isSelected(answer: Answer): boolean {
    return this.answered
      ? this.selectedAnswerIds.includes(answer.id)
      : this.pending.includes(answer.id);
  }

  isCorrectAnswer(answer: Answer): boolean {
    return this.correctAnswerIds?.includes(answer.id) ?? false;
  }

  isHighlighted(answer: Answer): boolean {
    return this.isCorrectAnswer(answer) || this.isSelected(answer);
  }
}

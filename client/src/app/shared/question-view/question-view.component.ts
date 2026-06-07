import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { Answer, Question } from '../../core/models';

@Component({
  selector: 'app-question-view',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Question text is imported, trusted content; Angular sanitises innerHTML. -->
    <div class="question-text" [innerHTML]="question.text"></div>

    <div class="options">
      @for (answer of question.answers; track answer.id; let i = $index) {
        <button
          type="button"
          class="option"
          [class.correct]="answered && answer.id === correctAnswerId"
          [class.wrong]="
            answered &&
            answer.id === selectedAnswerId &&
            answer.id !== correctAnswerId
          "
          [class.muted]="answered && !isHighlighted(answer)"
          [disabled]="answered"
          (click)="select.emit(answer.id)"
        >
          <span class="letter">{{ letters[i] }}</span>
          <span class="label">{{ answer.text }}</span>
          @if (answered && answer.id === correctAnswerId) {
            <mat-icon class="state-icon">check_circle</mat-icon>
          } @else if (
            answered &&
            answer.id === selectedAnswerId &&
            answer.id !== correctAnswerId
          ) {
            <mat-icon class="state-icon">cancel</mat-icon>
          }
        </button>
      }
    </div>
  `,
  styles: [
    `
      .question-text {
        font-size: 18px;
        line-height: 1.5;
        margin-bottom: 24px;
      }
      .question-text ::ng-deep pre {
        background: #1f2430;
        color: #f8f8f2;
        padding: 12px 16px;
        border-radius: 8px;
        overflow-x: auto;
        font-size: 14px;
      }
      .options {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .option {
        display: flex;
        align-items: center;
        gap: 12px;
        text-align: left;
        padding: 14px 16px;
        border: 2px solid #d6d9e0;
        border-radius: 10px;
        background: #fff;
        cursor: pointer;
        font-size: 15px;
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .option:not(:disabled):hover {
        border-color: #1976d2;
        background: #f0f6ff;
      }
      .option:disabled {
        cursor: default;
      }
      .letter {
        flex: 0 0 28px;
        height: 28px;
        width: 28px;
        border-radius: 50%;
        background: #eceef3;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
      }
      .label {
        flex: 1;
      }
      .state-icon {
        flex: 0 0 auto;
      }
      .option.correct {
        border-color: #2e7d32;
        background: #e8f5e9;
      }
      .option.correct .letter,
      .option.correct .state-icon {
        color: #2e7d32;
      }
      .option.wrong {
        border-color: #c62828;
        background: #ffebee;
      }
      .option.wrong .letter,
      .option.wrong .state-icon {
        color: #c62828;
      }
      .option.muted {
        opacity: 0.6;
      }
    `,
  ],
})
export class QuestionViewComponent {
  @Input({ required: true }) question!: Question;
  @Input() answered = false;
  @Input() selectedAnswerId: string | null = null;
  @Input() correctAnswerId: string | null = null;
  @Output() select = new EventEmitter<string>();

  readonly letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  isHighlighted(answer: Answer): boolean {
    return (
      answer.id === this.correctAnswerId || answer.id === this.selectedAnswerId
    );
  }
}

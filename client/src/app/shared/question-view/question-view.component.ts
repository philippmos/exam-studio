import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { Allocation, Answer, Question } from '../../core/models';

@Component({
  selector: 'app-question-view',
  standalone: true,
  imports: [DragDropModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Question text is imported, trusted content; Angular sanitises innerHTML. -->
    <div class="question-text" [innerHTML]="question().text"></div>

    @if (isAllocation()) {
      @if (!answered()) {
        <p class="multi-hint">
          <mat-icon>drag_indicator</mat-icon> Drag each item into the basket it
          belongs to.
        </p>
        <div class="alloc" cdkDropListGroup>
          <div class="basket tray">
            <h4 class="basket-title">Items</h4>
            <div
              class="dropzone"
              cdkDropList
              [cdkDropListData]="tray()"
              (cdkDropListDropped)="drop($event)"
            >
              @for (item of tray(); track item.id) {
                <div class="chip" cdkDrag>
                  <mat-icon class="grip">drag_indicator</mat-icon>
                  <span class="chip-label">{{ item.text }}</span>
                </div>
              }
              @if (tray().length === 0) {
                <p class="empty-hint">All items placed</p>
              }
            </div>
          </div>
          <div class="baskets">
            @for (cat of question().categories; track cat.id) {
              <div class="basket">
                <h4 class="basket-title">{{ cat.label }}</h4>
                <div
                  class="dropzone"
                  cdkDropList
                  [cdkDropListData]="basketItems()[cat.id]"
                  (cdkDropListDropped)="drop($event)"
                >
                  @for (item of basketItems()[cat.id]; track item.id) {
                    <div class="chip" cdkDrag>
                      <mat-icon class="grip">drag_indicator</mat-icon>
                      <span class="chip-label">{{ item.text }}</span>
                    </div>
                  }
                  @if (basketItems()[cat.id].length === 0) {
                    <p class="empty-hint">Drop items here</p>
                  }
                </div>
              </div>
            }
          </div>
        </div>
        <div class="submit-row">
          <button
            mat-flat-button
            [disabled]="tray().length > 0"
            (click)="submitAllocation()"
          >
            Check answer
          </button>
        </div>
      } @else {
        <!-- Answered: show each placement with right/wrong feedback. -->
        <div class="alloc">
          <div class="baskets">
            @for (cat of question().categories; track cat.id) {
              <div class="basket">
                <h4 class="basket-title">{{ cat.label }}</h4>
                <div class="dropzone static">
                  @for (item of itemsInBasket(cat.id); track item.id) {
                    <div
                      class="chip"
                      [class.correct]="isItemCorrect(item.id, cat.id)"
                      [class.wrong]="!isItemCorrect(item.id, cat.id)"
                    >
                      <mat-icon class="state-icon">{{
                        isItemCorrect(item.id, cat.id)
                          ? 'check_circle'
                          : 'cancel'
                      }}</mat-icon>
                      <span class="chip-label">{{ item.text }}</span>
                      @if (!isItemCorrect(item.id, cat.id)) {
                        <span class="correction">
                          → {{ categoryLabel(correctCategoryId(item.id)) }}
                        </span>
                      }
                    </div>
                  }
                  @if (itemsInBasket(cat.id).length === 0) {
                    <p class="empty-hint">—</p>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }
    } @else {
      @if (isMultiple() && !answered()) {
        <p class="multi-hint">
          <mat-icon>checklist</mat-icon> Select all answers that apply.
        </p>
      }

      <div class="options">
        @for (answer of question().answers; track answer.id; let i = $index) {
          <button
            type="button"
            class="option"
            [class.selected]="!answered() && isSelected(answer)"
            [class.correct]="answered() && isCorrectAnswer(answer)"
            [class.wrong]="
              answered() && isSelected(answer) && !isCorrectAnswer(answer)
            "
            [class.muted]="answered() && !isHighlighted(answer)"
            [disabled]="answered()"
            (click)="onOptionClick(answer)"
          >
            <span class="letter">{{ letters[i] }}</span>
            <span class="label">{{ answer.text }}</span>
            @if (answered() && isCorrectAnswer(answer)) {
              <mat-icon class="state-icon">check_circle</mat-icon>
            } @else if (
              answered() && isSelected(answer) && !isCorrectAnswer(answer)
            ) {
              <mat-icon class="state-icon">cancel</mat-icon>
            } @else if (!answered() && isSelected(answer)) {
              <mat-icon class="state-icon">check</mat-icon>
            }
          </button>
        }
      </div>

      @if (isMultiple() && !answered()) {
        <div class="submit-row">
          <button
            mat-flat-button
            [disabled]="pending().length === 0"
            (click)="submitPending()"
          >
            Check answer
          </button>
        </div>
      }
    }

    @if (answered() && question().explanation) {
      <div class="explanation">
        <div class="explanation-head">
          <mat-icon>lightbulb</mat-icon>
          <span>Explanation</span>
        </div>
        <!-- Imported, trusted content; Angular sanitises innerHTML. -->
        <div
          class="explanation-body"
          [innerHTML]="question().explanation"
        ></div>
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
        background: color-mix(
          in srgb,
          var(--mat-sys-primary) 4%,
          var(--mat-sys-surface)
        );
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
        background: color-mix(
          in srgb,
          var(--mat-sys-primary) 6%,
          var(--mat-sys-surface)
        );
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

      /* ---- Explanation (revealed once answered) ---- */
      .explanation {
        margin-top: 24px;
        padding: 16px 18px;
        border-radius: 12px;
        background: var(--mat-sys-surface-container-low);
        border: 1px solid
          color-mix(in srgb, var(--mat-sys-outline-variant) 55%, transparent);
        border-left: 3px solid var(--mat-sys-primary);
      }
      .explanation-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        color: var(--mat-sys-primary);
        font-weight: 600;
        font-size: 14px;
      }
      .explanation-head mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .explanation-body {
        font-size: 15px;
        line-height: 1.6;
        color: var(--mat-sys-on-surface);
      }
      .explanation-body ::ng-deep p:first-child {
        margin-top: 0;
      }
      .explanation-body ::ng-deep p:last-child {
        margin-bottom: 0;
      }
      .explanation-body ::ng-deep pre {
        background: #1f2430;
        color: #f8f8f2;
        padding: 12px 16px;
        border-radius: 10px;
        overflow-x: auto;
        font-size: 14px;
      }

      /* ---- Allocation (drag & drop into baskets) ---- */
      .alloc {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .baskets {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .basket-title {
        margin: 0 0 8px;
        font-size: 13px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant);
      }
      .dropzone {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 64px;
        padding: 10px;
        border: 2px dashed
          color-mix(in srgb, var(--mat-sys-outline-variant) 70%, transparent);
        border-radius: 12px;
        background: var(--mat-sys-surface-container-low);
        transition:
          border-color 0.15s,
          background 0.15s;
      }
      .dropzone.cdk-drop-list-receiving,
      .dropzone.cdk-drop-list-dragging {
        border-color: var(--mat-sys-primary);
        background: color-mix(
          in srgb,
          var(--mat-sys-primary) 5%,
          var(--mat-sys-surface)
        );
      }
      .dropzone.static {
        border-style: solid;
      }
      .chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid
          color-mix(in srgb, var(--mat-sys-outline-variant) 60%, transparent);
        border-radius: 10px;
        background: var(--mat-sys-surface);
        font-size: 14px;
        line-height: 1.4;
        cursor: grab;
      }
      .static .chip {
        cursor: default;
      }
      .chip-label {
        flex: 1;
      }
      .grip {
        flex: 0 0 auto;
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--mat-sys-on-surface-variant);
      }
      .chip.correct {
        border-color: var(--app-success);
        background: var(--app-success-bg);
      }
      .chip.correct .state-icon {
        color: var(--app-success);
      }
      .chip.wrong {
        border-color: var(--app-danger);
        background: var(--app-danger-bg);
      }
      .chip.wrong .state-icon {
        color: var(--app-danger);
      }
      .chip .state-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .correction {
        flex: 0 0 auto;
        font-size: 13px;
        font-weight: 600;
        color: var(--app-danger);
      }
      .empty-hint {
        margin: 0;
        padding: 8px 2px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        text-align: center;
      }
      /* CDK drag visuals */
      .cdk-drag-preview {
        border-radius: 10px;
        box-shadow: 0 6px 16px 2px rgba(0, 0, 0, 0.22);
      }
      .cdk-drag-placeholder {
        opacity: 0.4;
      }
      .cdk-drag-animating {
        transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
      }
    `,
  ],
})
export class QuestionViewComponent {
  readonly question = input.required<Question>();
  readonly answered = input(false);
  readonly selectedAnswerIds = input<string[]>([]);
  readonly correctAnswerIds = input<string[] | null>(null);
  /** Allocation placements the user made (item -> basket); for review/resume. */
  readonly selectedAllocations = input<Allocation[]>([]);
  /** Allocation solution (item -> correct basket); revealed after answering. */
  readonly correctAllocations = input<Allocation[] | null>(null);
  /** Emits the chosen answer ids: one for single choice, several for multiple. */
  readonly submitAnswers = output<string[]>();
  /** Emits the placements of an allocation question once every item is sorted. */
  readonly submitAllocations = output<Allocation[]>();

  readonly letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  readonly isMultiple = computed(
    () => this.question().questionType === 'MULTIPLE_CHOICE',
  );
  readonly isAllocation = computed(
    () => this.question().questionType === 'ALLOCATION',
  );

  /**
   * Local multiple-choice selection before submit. A linkedSignal so it resets
   * to empty whenever a new question is bound, yet stays locally writable.
   */
  readonly pending = linkedSignal<Question, string[]>({
    source: this.question,
    computation: () => [],
  });

  /** Unplaced allocation items; resets to all answers when the question changes. */
  readonly tray = linkedSignal<Answer[]>(() =>
    this.isAllocation() ? [...this.question().answers] : [],
  );

  /** Allocation items per basket (categoryId); resets when the question changes. */
  readonly basketItems = linkedSignal<Record<string, Answer[]>>(() => {
    const baskets: Record<string, Answer[]> = {};
    if (this.isAllocation()) {
      for (const category of this.question().categories) {
        baskets[category.id] = [];
      }
    }
    return baskets;
  });

  // ---- Choice questions ---------------------------------------------------

  onOptionClick(answer: Answer): void {
    if (this.answered()) {
      return;
    }
    if (!this.isMultiple()) {
      this.submitAnswers.emit([answer.id]);
      return;
    }
    this.pending.update((pending) =>
      pending.includes(answer.id)
        ? pending.filter((id) => id !== answer.id)
        : [...pending, answer.id],
    );
  }

  submitPending(): void {
    const pending = this.pending();
    if (pending.length > 0) {
      this.submitAnswers.emit(pending);
    }
  }

  isSelected(answer: Answer): boolean {
    return this.answered()
      ? this.selectedAnswerIds().includes(answer.id)
      : this.pending().includes(answer.id);
  }

  isCorrectAnswer(answer: Answer): boolean {
    return this.correctAnswerIds()?.includes(answer.id) ?? false;
  }

  isHighlighted(answer: Answer): boolean {
    return this.isCorrectAnswer(answer) || this.isSelected(answer);
  }

  // ---- Allocation questions ----------------------------------------------

  drop(event: CdkDragDrop<Answer[]>): void {
    if (this.answered()) {
      return;
    }
    if (event.previousContainer === event.container) {
      moveItemInArray(
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex,
      );
    }
    // CdkDragDrop mutates the bound arrays in place; re-set the signals to fresh
    // references so zoneless change detection re-renders the lists.
    this.tray.set([...this.tray()]);
    this.basketItems.set({ ...this.basketItems() });
  }

  submitAllocation(): void {
    if (this.tray().length > 0) {
      return;
    }
    const baskets = this.basketItems();
    const allocations: Allocation[] = [];
    for (const category of this.question().categories) {
      for (const item of baskets[category.id]) {
        allocations.push({ answerId: item.id, categoryId: category.id });
      }
    }
    this.submitAllocations.emit(allocations);
  }

  /** Items the user dropped into a basket (answered view, from the inputs). */
  itemsInBasket(categoryId: string): Answer[] {
    const ids = this.selectedAllocations()
      .filter((a) => a.categoryId === categoryId)
      .map((a) => a.answerId);
    return this.question().answers.filter((answer) => ids.includes(answer.id));
  }

  correctCategoryId(answerId: string): string | null {
    return (
      this.correctAllocations()?.find((a) => a.answerId === answerId)
        ?.categoryId ?? null
    );
  }

  isItemCorrect(answerId: string, categoryId: string): boolean {
    return this.correctCategoryId(answerId) === categoryId;
  }

  categoryLabel(categoryId: string | null): string {
    return (
      this.question().categories.find((c) => c.id === categoryId)?.label ?? ''
    );
  }
}

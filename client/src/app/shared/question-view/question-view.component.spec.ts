import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Answer, Question } from '../../core/models';
import { QuestionViewComponent } from './question-view.component';

function makeQuestion(partial: Partial<Question>): Question {
  return {
    id: 'q1',
    text: 'A question',
    explanation: null,
    sectionId: 's1',
    questionType: 'SINGLE_CHOICE',
    answers: [],
    categories: [],
    ...partial,
  };
}

/** Create the component and bind a question input (pure logic — no template CD). */
function createWith(question: Question): QuestionViewComponent {
  TestBed.configureTestingModule({ imports: [QuestionViewComponent] });
  const fixture = TestBed.createComponent(QuestionViewComponent);
  fixture.componentRef.setInput('question', question);
  return fixture.componentInstance;
}

/** Build a CdkDragDrop event that moves an item between two backing arrays. */
function dragEvent(
  from: Answer[],
  to: Answer[],
  previousIndex: number,
  currentIndex: number,
): CdkDragDrop<Answer[]> {
  return {
    previousContainer: { data: from },
    container: { data: to },
    previousIndex,
    currentIndex,
  } as unknown as CdkDragDrop<Answer[]>;
}

describe('QuestionViewComponent', () => {
  it('emits a single-choice answer immediately on click', () => {
    const question = makeQuestion({
      questionType: 'SINGLE_CHOICE',
      answers: [
        { id: 'a', text: 'A', position: 0 },
        { id: 'b', text: 'B', position: 1 },
      ],
    });
    const component = createWith(question);
    const emitted: string[][] = [];
    component.submitAnswers.subscribe((ids) => emitted.push(ids));

    component.onOptionClick(question.answers[0]);

    expect(emitted).toEqual([['a']]);
  });

  it('toggles pending selections for multiple choice, then submits them', () => {
    const question = makeQuestion({
      questionType: 'MULTIPLE_CHOICE',
      answers: [
        { id: 'a', text: 'A', position: 0 },
        { id: 'b', text: 'B', position: 1 },
        { id: 'c', text: 'C', position: 2 },
      ],
    });
    const component = createWith(question);
    const emitted: string[][] = [];
    component.submitAnswers.subscribe((ids) => emitted.push(ids));

    component.onOptionClick(question.answers[0]); // select A
    component.onOptionClick(question.answers[2]); // select C
    component.onOptionClick(question.answers[0]); // deselect A

    expect(component.pending()).toEqual(['c']);
    expect(component.isSelected(question.answers[2])).toBe(true);
    // Multiple choice should not emit until the user confirms.
    expect(emitted).toHaveLength(0);

    component.submitPending();
    expect(emitted).toEqual([['c']]);
  });

  it('seeds the allocation tray and resets it per question', () => {
    const component = createWith(
      makeQuestion({
        questionType: 'ALLOCATION',
        answers: [
          { id: 'i1', text: 'Item 1', position: 0 },
          { id: 'i2', text: 'Item 2', position: 1 },
        ],
        categories: [{ id: 'c1', key: 'good', label: 'Good', position: 0 }],
      }),
    );

    expect(component.tray().map((a) => a.id)).toEqual(['i1', 'i2']);
    expect(component.basketItems()['c1']).toEqual([]);
  });

  it('moves an item from the tray into a basket on drop', () => {
    const component = createWith(
      makeQuestion({
        questionType: 'ALLOCATION',
        answers: [
          { id: 'i1', text: 'Item 1', position: 0 },
          { id: 'i2', text: 'Item 2', position: 1 },
        ],
        categories: [{ id: 'c1', key: 'good', label: 'Good', position: 0 }],
      }),
    );

    component.drop(
      dragEvent(component.tray(), component.basketItems()['c1'], 0, 0),
    );

    expect(component.tray().map((a) => a.id)).toEqual(['i2']);
    expect(component.basketItems()['c1'].map((a) => a.id)).toEqual(['i1']);
  });

  it('emits allocations only once every item is placed', () => {
    const component = createWith(
      makeQuestion({
        questionType: 'ALLOCATION',
        answers: [{ id: 'i1', text: 'Item 1', position: 0 }],
        categories: [{ id: 'c1', key: 'good', label: 'Good', position: 0 }],
      }),
    );
    const emitted: { answerId: string; categoryId: string }[][] = [];
    component.submitAllocations.subscribe((a) => emitted.push(a));

    // Tray still has an unplaced item → nothing emitted.
    component.submitAllocation();
    expect(emitted).toHaveLength(0);

    component.drop(
      dragEvent(component.tray(), component.basketItems()['c1'], 0, 0),
    );
    component.submitAllocation();

    expect(emitted).toEqual([[{ answerId: 'i1', categoryId: 'c1' }]]);
  });
});

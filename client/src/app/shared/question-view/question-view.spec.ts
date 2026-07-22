import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { Answer, Question } from '../../core/models';
import { QuestionView } from './question-view';

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
function createWith(question: Question): QuestionView {
  TestBed.configureTestingModule({ imports: [QuestionView] });
  const fixture = TestBed.createComponent(QuestionView);
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

describe('QuestionView', () => {
  it('emits a single-choice answer immediately on click', () => {
    const question = makeQuestion({
      questionType: 'SINGLE_CHOICE',
      answers: [
        { id: 'a', text: 'A', position: 0, selectboxId: null },
        { id: 'b', text: 'B', position: 1, selectboxId: null },
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
        { id: 'a', text: 'A', position: 0, selectboxId: null },
        { id: 'b', text: 'B', position: 1, selectboxId: null },
        { id: 'c', text: 'C', position: 2, selectboxId: null },
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
          { id: 'i1', text: 'Item 1', position: 0, selectboxId: null },
          { id: 'i2', text: 'Item 2', position: 1, selectboxId: null },
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
          { id: 'i1', text: 'Item 1', position: 0, selectboxId: null },
          { id: 'i2', text: 'Item 2', position: 1, selectboxId: null },
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
        answers: [{ id: 'i1', text: 'Item 1', position: 0, selectboxId: null }],
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

  it('seeds the select-and-place pool with every option, answer area empty', () => {
    const component = createWith(
      makeQuestion({
        questionType: 'SELECT_AND_PLACE',
        answers: [
          { id: 'o1', text: 'First', position: 0, selectboxId: null },
          { id: 'o2', text: 'Second', position: 1, selectboxId: null },
          { id: 'o3', text: 'Distractor', position: 2, selectboxId: null },
        ],
      }),
    );

    expect(component.pool().map((a) => a.id)).toEqual(['o1', 'o2', 'o3']);
    expect(component.placed()).toEqual([]);
  });

  it('emits the placed option ids in order, and only when non-empty', () => {
    const component = createWith(
      makeQuestion({
        questionType: 'SELECT_AND_PLACE',
        answers: [
          { id: 'o1', text: 'First', position: 0, selectboxId: null },
          { id: 'o2', text: 'Second', position: 1, selectboxId: null },
          { id: 'o3', text: 'Distractor', position: 2, selectboxId: null },
        ],
      }),
    );
    const emitted: string[][] = [];
    component.submitPlacements.subscribe((ids) => emitted.push(ids));

    // Nothing placed yet → no emission.
    component.submitPlacement();
    expect(emitted).toHaveLength(0);

    // Place o2 then o1 into the answer area (so the order is o2, o1).
    component.dropPlacement(dragEvent(component.pool(), component.placed(), 1, 0));
    component.dropPlacement(dragEvent(component.pool(), component.placed(), 0, 1));

    expect(component.placed().map((a) => a.id)).toEqual(['o2', 'o1']);

    component.submitPlacement();
    expect(emitted).toEqual([['o2', 'o1']]);
  });

  it('grades each placed slot against the solution order (answered view)', () => {
    const question = makeQuestion({
      questionType: 'SELECT_AND_PLACE',
      answers: [
        { id: 'o1', text: 'First', position: 0, selectboxId: null },
        { id: 'o2', text: 'Second', position: 1, selectboxId: null },
        { id: 'o3', text: 'Distractor', position: 2, selectboxId: null },
      ],
    });
    TestBed.configureTestingModule({ imports: [QuestionView] });
    const fixture = TestBed.createComponent(QuestionView);
    fixture.componentRef.setInput('question', question);
    fixture.componentRef.setInput('answered', true);
    // The user placed o1 correctly but o3 where o2 belongs.
    fixture.componentRef.setInput('selectedPlacements', [
      { answerId: 'o1', position: 0 },
      { answerId: 'o3', position: 1 },
    ]);
    fixture.componentRef.setInput('correctPlacements', [
      { answerId: 'o1', position: 0 },
      { answerId: 'o2', position: 1 },
    ]);
    const component = fixture.componentInstance;

    expect(component.placedAnswers().map((a) => a.id)).toEqual(['o1', 'o3']);
    expect(component.correctOrderAnswers().map((a) => a.id)).toEqual([
      'o1',
      'o2',
    ]);
    expect(component.isPlacementCorrect(0)).toBe(true);
    expect(component.isPlacementCorrect(1)).toBe(false);
    expect(component.allPlacementsCorrect()).toBe(false);
  });

  it('groups options per selectbox and emits a chosen id per selectbox', () => {
    const question = makeQuestion({
      questionType: 'SELECTBOX',
      categories: [
        { id: 'auth', key: 'auth', label: 'Authentication:', position: 0 },
        { id: 'sspr', key: 'sspr', label: 'SSPR:', position: 1 },
      ],
      answers: [
        { id: 'a1', text: 'AD FS', position: 0, selectboxId: 'auth' },
        { id: 'a2', text: 'Pass-through', position: 1, selectboxId: 'auth' },
        { id: 's1', text: 'Device writeback', position: 2, selectboxId: 'sspr' },
        { id: 's2', text: 'Password writeback', position: 3, selectboxId: 'sspr' },
      ],
    });
    const component = createWith(question);
    const emitted: string[][] = [];
    component.submitAnswers.subscribe((ids) => emitted.push(ids));

    expect(component.optionsForSelectbox('auth').map((o) => o.id)).toEqual([
      'a1',
      'a2',
    ]);
    expect(component.optionsForSelectbox('sspr').map((o) => o.id)).toEqual([
      's1',
      's2',
    ]);

    // Only one selectbox chosen → nothing emitted yet.
    component.setSelectboxChoice('auth', 'a1');
    expect(component.allSelectboxesChosen()).toBe(false);
    component.submitSelectbox();
    expect(emitted).toHaveLength(0);

    component.setSelectboxChoice('sspr', 's2');
    expect(component.allSelectboxesChosen()).toBe(true);
    component.submitSelectbox();

    // One chosen option per selectbox, in selectbox order.
    expect(emitted).toEqual([['a1', 's2']]);
  });

  it('grades each selectbox against the solution (answered view)', () => {
    const question = makeQuestion({
      questionType: 'SELECTBOX',
      categories: [
        { id: 'auth', key: 'auth', label: 'Authentication:', position: 0 },
        { id: 'sspr', key: 'sspr', label: 'SSPR:', position: 1 },
      ],
      answers: [
        { id: 'a1', text: 'AD FS', position: 0, selectboxId: 'auth' },
        { id: 'a2', text: 'Pass-through', position: 1, selectboxId: 'auth' },
        { id: 's1', text: 'Device writeback', position: 2, selectboxId: 'sspr' },
        { id: 's2', text: 'Password writeback', position: 3, selectboxId: 'sspr' },
      ],
    });
    TestBed.configureTestingModule({ imports: [QuestionView] });
    const fixture = TestBed.createComponent(QuestionView);
    fixture.componentRef.setInput('question', question);
    fixture.componentRef.setInput('answered', true);
    // The user picked a1 (correct for auth) and s1 (wrong for sspr).
    fixture.componentRef.setInput('selectedAnswerIds', ['a1', 's1']);
    fixture.componentRef.setInput('correctAnswerIds', ['a1', 's2']);
    const component = fixture.componentInstance;

    expect(component.selectedOptionOf('auth')?.id).toBe('a1');
    expect(component.correctOptionOf('auth')?.id).toBe('a1');
    expect(component.isSelectboxCorrect('auth')).toBe(true);

    expect(component.selectedOptionOf('sspr')?.id).toBe('s1');
    expect(component.correctOptionOf('sspr')?.id).toBe('s2');
    expect(component.isSelectboxCorrect('sspr')).toBe(false);
  });
});

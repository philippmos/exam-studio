import { randomUUID } from 'node:crypto';

import {
  ALLOCATION_SOLUTION,
  allocationExamSpec,
  SELECT_AND_PLACE_SOLUTION,
  selectAndPlaceExamSpec,
  selectboxExamSpec,
  uniqueName,
} from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import {
  correctAllocationsOf,
  correctAnswerIdsOf,
  correctOrderOf,
  correctSelectboxIdsOf,
  getSession,
  startSession,
  submitAllocation,
  submitAnswer,
  submitPlacement,
  withFirstTwoSwapped,
  withOneMisplaced,
  withOneSelectboxWrong,
  wrongAnswerIdOf,
} from '../src/operations';
import { Allocation, ExamSession, SessionItem } from '../src/types';

const SUBMIT_MUTATION = `
  mutation Submit($sessionItemId: UUID!, $selectedAnswerIds: [UUID!]!) {
    submitAnswer(sessionItemId: $sessionItemId, selectedAnswerIds: $selectedAnswerIds) {
      sessionItemId
      isCorrect
      correctAnswerIds
    }
  }
`;

function singleChoiceItem(session: ExamSession, index = 0): SessionItem {
  return session.items.filter(
    (item) => item.question.questionType === 'SINGLE_CHOICE',
  )[index];
}

function multipleChoiceItem(session: ExamSession): SessionItem {
  return session.items.find(
    (item) => item.question.questionType === 'MULTIPLE_CHOICE',
  )!;
}

test.describe('submitAnswer', () => {
  test('accepts the correct single-choice answer', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = singleChoiceItem(session);
    const [correctId] = correctAnswerIdsOf(item);

    const result = await submitAnswer(gql, item.id, [correctId]);

    expect(result.sessionItemId).toBe(item.id);
    expect(result.isCorrect).toBe(true);
    expect(result.correctAnswerIds).toEqual([correctId]);
  });

  test('reveals the solution when a wrong answer is submitted', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = singleChoiceItem(session);

    const result = await submitAnswer(gql, item.id, [wrongAnswerIdOf(item)]);

    expect(result.isCorrect).toBe(false);
    expect(result.correctAnswerIds).toEqual(correctAnswerIdsOf(item));
  });

  test('persists answers on the session for review and resume', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const correctItem = singleChoiceItem(session, 0);
    const wrongItem = singleChoiceItem(session, 1);

    await submitAnswer(gql, correctItem.id, correctAnswerIdsOf(correctItem));
    const wrongAnswerId = wrongAnswerIdOf(wrongItem);
    await submitAnswer(gql, wrongItem.id, [wrongAnswerId]);

    const reloaded = (await getSession(gql, session.id))!;
    expect(reloaded.answered).toBe(2);
    expect(reloaded.correct).toBe(1);

    const reloadedCorrect = reloaded.items.find((i) => i.id === correctItem.id)!;
    expect(reloadedCorrect.isCorrect).toBe(true);
    expect(reloadedCorrect.answeredAt).not.toBeNull();
    expect(reloadedCorrect.selectedAnswerIds).toEqual(correctAnswerIdsOf(correctItem));
    // Once answered, the solution may be shown.
    expect(reloadedCorrect.correctAnswerIds).toEqual(correctAnswerIdsOf(correctItem));

    const reloadedWrong = reloaded.items.find((i) => i.id === wrongItem.id)!;
    expect(reloadedWrong.isCorrect).toBe(false);
    expect(reloadedWrong.selectedAnswerIds).toEqual([wrongAnswerId]);
    expect(reloadedWrong.correctAnswerIds).toEqual(correctAnswerIdsOf(wrongItem));
  });

  test('multiple choice requires exactly the set of correct answers', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = multipleChoiceItem(session);
    const correctIds = correctAnswerIdsOf(item);
    expect(correctIds.length).toBeGreaterThan(1);

    const result = await submitAnswer(gql, item.id, correctIds);

    expect(result.isCorrect).toBe(true);
    expect([...result.correctAnswerIds].sort()).toEqual([...correctIds].sort());
  });

  test('a subset of the correct answers is not enough', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = multipleChoiceItem(session);
    const [firstCorrectId] = correctAnswerIdsOf(item);

    const result = await submitAnswer(gql, item.id, [firstCorrectId]);

    expect(result.isCorrect).toBe(false);
  });

  test('correct answers plus a wrong one is not correct either', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = multipleChoiceItem(session);

    const result = await submitAnswer(gql, item.id, [
      ...correctAnswerIdsOf(item),
      wrongAnswerIdOf(item),
    ]);

    expect(result.isCorrect).toBe(false);
  });

  test('resubmitting replaces the previous answer', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = singleChoiceItem(session);
    const correctIds = correctAnswerIdsOf(item);

    const firstAttempt = await submitAnswer(gql, item.id, [wrongAnswerIdOf(item)]);
    expect(firstAttempt.isCorrect).toBe(false);

    const secondAttempt = await submitAnswer(gql, item.id, correctIds);
    expect(secondAttempt.isCorrect).toBe(true);

    const reloaded = (await getSession(gql, session.id))!;
    const reloadedItem = reloaded.items.find((i) => i.id === item.id)!;
    expect(reloadedItem.selectedAnswerIds).toEqual(correctIds);
    expect(reloadedItem.isCorrect).toBe(true);
    expect(reloaded.answered).toBe(1);
  });

  test('rejects an empty answer selection', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    const message = await gql.expectError(SUBMIT_MUTATION, {
      sessionItemId: singleChoiceItem(session).id,
      selectedAnswerIds: [],
    });
    expect(message).toContain('At least one answer must be selected');
  });

  test('rejects multiple answers for a single-choice question', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = singleChoiceItem(session);
    const answerIds = item.question.answers.slice(0, 2).map((a) => a.id);

    const message = await gql.expectError(SUBMIT_MUTATION, {
      sessionItemId: item.id,
      selectedAnswerIds: answerIds,
    });
    expect(message).toContain('Exactly one answer must be selected');
  });

  test('rejects answers that belong to a different question', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const [itemA, itemB] = session.items;

    const message = await gql.expectError(SUBMIT_MUTATION, {
      sessionItemId: itemA.id,
      selectedAnswerIds: [itemB.question.answers[0].id],
    });
    expect(message).toContain('do not belong to this question');
  });

  test('rejects an unknown session item', async ({ gql }) => {
    const message = await gql.expectError(SUBMIT_MUTATION, {
      sessionItemId: randomUUID(),
      selectedAnswerIds: [randomUUID()],
    });
    expect(message).toContain('Session item not found');
  });
});

const SUBMIT_ALLOC_MUTATION = `
  mutation Submit($sessionItemId: UUID!, $allocations: [AllocationInput!]) {
    submitAnswer(sessionItemId: $sessionItemId, allocations: $allocations) {
      sessionItemId
      isCorrect
    }
  }
`;

/** item.answerId -> chosen category id, for order-independent comparison. */
function placementMap(allocations: Allocation[]): Record<string, string> {
  return Object.fromEntries(allocations.map((a) => [a.answerId, a.categoryId]));
}

test.describe('submitAnswer (allocation)', () => {
  test('accepts a fully correct placement', async ({ gql, examFactory }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    expect(item.question.questionType).toBe('ALLOCATION');
    expect(item.question.categories.map((c) => c.key)).toEqual([
      'contained',
      'avoided',
    ]);
    expect(item.question.answers).toHaveLength(4);

    const result = await submitAllocation(
      gql,
      item.id,
      correctAllocationsOf(item, ALLOCATION_SOLUTION),
    );

    expect(result.isCorrect).toBe(true);
    // The full solution (item -> basket) is returned for the feedback view.
    expect(result.correctAllocations).toHaveLength(4);
  });

  test('one misplaced item fails the whole question', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    const result = await submitAllocation(
      gql,
      item.id,
      withOneMisplaced(item, ALLOCATION_SOLUTION),
    );

    expect(result.isCorrect).toBe(false);
    expect(result.correctAllocations).toHaveLength(4);
  });

  test('persists the placement for review and resume', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const allocations = correctAllocationsOf(item, ALLOCATION_SOLUTION);

    await submitAllocation(gql, item.id, allocations);

    const reloaded = (await getSession(gql, session.id))!;
    expect(reloaded.answered).toBe(1);
    expect(reloaded.correct).toBe(1);

    const ri = reloaded.items.find((i) => i.id === item.id)!;
    expect(ri.isCorrect).toBe(true);
    expect(ri.answeredAt).not.toBeNull();
    expect(ri.selectedAllocations).toHaveLength(4);
    expect(placementMap(ri.selectedAllocations)).toEqual(
      placementMap(allocations),
    );
    // Once answered, the solution may be shown.
    expect(ri.correctAllocations).toHaveLength(4);
    expect(placementMap(ri.correctAllocations!)).toEqual(
      placementMap(allocations),
    );
  });

  test('re-answering replaces the previous placement', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    const first = await submitAllocation(
      gql,
      item.id,
      withOneMisplaced(item, ALLOCATION_SOLUTION),
    );
    expect(first.isCorrect).toBe(false);

    const second = await submitAllocation(
      gql,
      item.id,
      correctAllocationsOf(item, ALLOCATION_SOLUTION),
    );
    expect(second.isCorrect).toBe(true);

    const reloaded = (await getSession(gql, session.id))!;
    expect(reloaded.answered).toBe(1);
    const ri = reloaded.items.find((i) => i.id === item.id)!;
    expect(ri.isCorrect).toBe(true);
    expect(ri.selectedAllocations).toHaveLength(4);
  });

  test('rejects a placement that leaves an item unsorted', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const partial = correctAllocationsOf(item, ALLOCATION_SOLUTION).slice(0, 2);

    const message = await gql.expectError(SUBMIT_ALLOC_MUTATION, {
      sessionItemId: item.id,
      allocations: partial,
    });
    expect(message).toContain('Every item must be sorted into a category');
  });

  test('rejects a category that belongs to no question', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const bogus = item.question.answers.map((a) => ({
      answerId: a.id,
      categoryId: randomUUID(),
    }));

    const message = await gql.expectError(SUBMIT_ALLOC_MUTATION, {
      sessionItemId: item.id,
      allocations: bogus,
    });
    expect(message).toContain('Selected categories do not belong to this question');
  });
});

const SUBMIT_PLACE_MUTATION = `
  mutation Submit($sessionItemId: UUID!, $placedAnswerIds: [UUID!]) {
    submitAnswer(sessionItemId: $sessionItemId, placedAnswerIds: $placedAnswerIds) {
      sessionItemId
      isCorrect
    }
  }
`;

test.describe('submitAnswer (select-and-place)', () => {
  test('serves the whole option pool including distractors', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    expect(item.question.questionType).toBe('SELECT_AND_PLACE');
    // 6 options in the pool, only 4 of which make up the answer.
    expect(item.question.answers).toHaveLength(6);
    expect(correctOrderOf(item, SELECT_AND_PLACE_SOLUTION)).toHaveLength(4);
  });

  test('accepts the exact correct order', async ({ gql, examFactory }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const order = correctOrderOf(item, SELECT_AND_PLACE_SOLUTION);

    const result = await submitPlacement(gql, item.id, order);

    expect(result.isCorrect).toBe(true);
    // The solution (option -> slot) is returned for the feedback view.
    expect(result.correctPlacements).toHaveLength(4);
    expect(
      [...result.correctPlacements]
        .sort((a, b) => a.position - b.position)
        .map((p) => p.answerId),
    ).toEqual(order);
  });

  test('the right options in the wrong order is incorrect', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const wrongOrder = withFirstTwoSwapped(
      correctOrderOf(item, SELECT_AND_PLACE_SOLUTION),
    );

    const result = await submitPlacement(gql, item.id, wrongOrder);

    expect(result.isCorrect).toBe(false);
    expect(result.correctPlacements).toHaveLength(4);
  });

  test('placing a distractor is incorrect', async ({ gql, examFactory }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const order = correctOrderOf(item, SELECT_AND_PLACE_SOLUTION);
    const distractor = item.question.answers.find(
      (a) => !order.includes(a.id),
    )!;

    // Replace the last placed option with a distractor.
    const withDistractor = [...order.slice(0, -1), distractor.id];
    const result = await submitPlacement(gql, item.id, withDistractor);

    expect(result.isCorrect).toBe(false);
  });

  test('persists the placement for review and resume', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const order = correctOrderOf(item, SELECT_AND_PLACE_SOLUTION);

    await submitPlacement(gql, item.id, order);

    const reloaded = (await getSession(gql, session.id))!;
    expect(reloaded.answered).toBe(1);
    expect(reloaded.correct).toBe(1);

    const ri = reloaded.items.find((i) => i.id === item.id)!;
    expect(ri.isCorrect).toBe(true);
    expect(ri.answeredAt).not.toBeNull();
    // The placement round-trips in the order it was submitted.
    expect(
      [...ri.selectedPlacements]
        .sort((a, b) => a.position - b.position)
        .map((p) => p.answerId),
    ).toEqual(order);
    expect(
      [...ri.correctPlacements!]
        .sort((a, b) => a.position - b.position)
        .map((p) => p.answerId),
    ).toEqual(order);
  });

  test('re-answering replaces the previous placement', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const order = correctOrderOf(item, SELECT_AND_PLACE_SOLUTION);

    const first = await submitPlacement(gql, item.id, withFirstTwoSwapped(order));
    expect(first.isCorrect).toBe(false);

    const second = await submitPlacement(gql, item.id, order);
    expect(second.isCorrect).toBe(true);

    const reloaded = (await getSession(gql, session.id))!;
    expect(reloaded.answered).toBe(1);
    const ri = reloaded.items.find((i) => i.id === item.id)!;
    expect(ri.isCorrect).toBe(true);
    expect(ri.selectedPlacements).toHaveLength(4);
  });

  test('rejects an empty placement', async ({ gql, examFactory }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    const message = await gql.expectError(SUBMIT_PLACE_MUTATION, {
      sessionItemId: item.id,
      placedAnswerIds: [],
    });
    expect(message).toContain('At least one option must be placed');
  });

  test('rejects an option that belongs to a different question', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectAndPlaceExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    const message = await gql.expectError(SUBMIT_PLACE_MUTATION, {
      sessionItemId: item.id,
      placedAnswerIds: [randomUUID()],
    });
    expect(message).toContain('do not belong to this question');
  });
});

// Selectbox questions reuse the choice submit path (selectedAnswerIds): one
// chosen option per selectbox, and the mere presence of the row is the pick.
const SUBMIT_SELECTBOX_MUTATION = `
  mutation Submit($sessionItemId: UUID!, $selectedAnswerIds: [UUID!]) {
    submitAnswer(sessionItemId: $sessionItemId, selectedAnswerIds: $selectedAnswerIds) {
      sessionItemId
      isCorrect
    }
  }
`;

test.describe('submitAnswer (selectbox)', () => {
  test('serves the options grouped into selectboxes', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectboxExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    expect(item.question.questionType).toBe('SELECTBOX');
    // Two selectboxes (categories), six options total, each grouped into one.
    expect(item.question.categories).toHaveLength(2);
    expect(item.question.answers).toHaveLength(6);
    for (const answer of item.question.answers) {
      expect(answer.selectboxId).not.toBeNull();
    }
    for (const box of item.question.categories) {
      const options = item.question.answers.filter(
        (a) => a.selectboxId === box.id,
      );
      expect(options).toHaveLength(3);
    }
    // Exactly one correct option per selectbox.
    expect(correctSelectboxIdsOf(item)).toHaveLength(2);
  });

  test('accepts the correct option in every selectbox', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectboxExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const correct = correctSelectboxIdsOf(item);

    const result = await submitAnswer(gql, item.id, correct);

    expect(result.isCorrect).toBe(true);
    expect([...result.correctAnswerIds].sort()).toEqual([...correct].sort());
  });

  test('one wrong selectbox fails the whole question', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectboxExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];

    const result = await submitAnswer(gql, item.id, withOneSelectboxWrong(item));

    expect(result.isCorrect).toBe(false);
    // The solution (one option per selectbox) is returned for the feedback view.
    expect([...result.correctAnswerIds].sort()).toEqual(
      [...correctSelectboxIdsOf(item)].sort(),
    );
  });

  test('rejects choosing two options in one selectbox', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectboxExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const correct = correctSelectboxIdsOf(item);
    const firstBox = item.question.answers.find(
      (a) => a.id === correct[0],
    )!.selectboxId;
    const extraInFirstBox = item.question.answers.find(
      (a) => a.selectboxId === firstBox && !correct.includes(a.id),
    )!;

    const message = await gql.expectError(SUBMIT_SELECTBOX_MUTATION, {
      sessionItemId: item.id,
      selectedAnswerIds: [...correct, extraInFirstBox.id],
    });
    expect(message).toContain('exactly one option for each selectbox');
  });

  test('rejects leaving a selectbox unanswered', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectboxExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    // Only the first selectbox's option — the second is left unchosen.
    const partial = [correctSelectboxIdsOf(item)[0]];

    const message = await gql.expectError(SUBMIT_SELECTBOX_MUTATION, {
      sessionItemId: item.id,
      selectedAnswerIds: partial,
    });
    expect(message).toContain('exactly one option for each selectbox');
  });

  test('persists the selection for review and resume', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.create(selectboxExamSpec(uniqueName()));
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    const correct = correctSelectboxIdsOf(item);

    await submitAnswer(gql, item.id, correct);

    const reloaded = (await getSession(gql, session.id))!;
    expect(reloaded.answered).toBe(1);
    expect(reloaded.correct).toBe(1);

    const ri = reloaded.items.find((i) => i.id === item.id)!;
    expect(ri.isCorrect).toBe(true);
    expect(ri.answeredAt).not.toBeNull();
    expect([...ri.selectedAnswerIds].sort()).toEqual([...correct].sort());
    // Once answered, the solution may be shown.
    expect([...ri.correctAnswerIds!].sort()).toEqual([...correct].sort());
  });
});

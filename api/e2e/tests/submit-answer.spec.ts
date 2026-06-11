import { randomUUID } from 'node:crypto';

import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  getSession,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';
import { ExamSession, SessionItem } from '../src/types';

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

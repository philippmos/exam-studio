import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  getReviewDue,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';
import { ExamSession, SessionItem } from '../src/types';

function singleChoiceItem(session: ExamSession, index = 0): SessionItem {
  return session.items.filter(
    (item) => item.question.questionType === 'SINGLE_CHOICE',
  )[index];
}

function itemForQuestion(session: ExamSession, questionId: string): SessionItem {
  const item = session.items.find((i) => i.question.id === questionId);
  if (!item) {
    throw new Error(`No session item for question ${questionId}.`);
  }
  return item;
}

test.describe('spaced repetition (Leitner review)', () => {
  test('correct answers climb the Leitner ladder, a wrong answer resets it', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    // First-ever answer of a new question: getting it right puts it in box 2.
    const first = await startSession(gql, exam.id, 'ALL_RANDOM');
    const target = singleChoiceItem(first);
    const questionId = target.question.id;
    const r1 = await submitAnswer(gql, target.id, correctAnswerIdsOf(target));
    expect(r1.reviewBox).toBe(2);
    expect(r1.reviewIntervalDays).toBeGreaterThan(0);

    // Answering it correctly again promotes it one more box, further out.
    const second = await startSession(gql, exam.id, 'ALL_RANDOM');
    const again = itemForQuestion(second, questionId);
    const r2 = await submitAnswer(gql, again.id, correctAnswerIdsOf(again));
    expect(r2.reviewBox).toBe(3);
    expect(r2.reviewIntervalDays).toBeGreaterThan(r1.reviewIntervalDays);

    // A wrong answer drops it back to box 1, due again the next day.
    const third = await startSession(gql, exam.id, 'ALL_RANDOM');
    const lapse = itemForQuestion(third, questionId);
    const r3 = await submitAnswer(gql, lapse.id, [wrongAnswerIdOf(lapse)]);
    expect(r3.reviewBox).toBe(1);
    expect(r3.reviewIntervalDays).toBe(1);
  });

  test('a freshly answered question is scheduled ahead, not due right now', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    // Nothing answered yet -> no review state -> nothing due.
    await expect(getReviewDue(gql, exam.id)).resolves.toEqual([]);

    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    for (const item of session.items) {
      await submitAnswer(gql, item.id, correctAnswerIdsOf(item));
    }

    // Each answer schedules its question at least a day out, so a review
    // session started immediately afterwards finds nothing due.
    await expect(getReviewDue(gql, exam.id)).resolves.toEqual([]);
    const review = await startSession(gql, exam.id, 'DUE_REVIEW');
    expect(review.total).toBe(0);
    expect(review.items).toHaveLength(0);
  });
});

import { randomUUID } from 'node:crypto';

import { SECTION_CRYPTOGRAPHY, SECTION_NETWORKING } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  getExamStats,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';

test.describe('examStats', () => {
  test('returns null for an unknown exam', async ({ gql }) => {
    await expect(getExamStats(gql, randomUUID())).resolves.toBeNull();
  });

  test('a fresh exam reports zero progress', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();

    const stats = (await getExamStats(gql, exam.id))!;

    expect(stats.examId).toBe(exam.id);
    expect(stats.examName).toBe(exam.name);
    expect(stats.totalQuestions).toBe(5);
    expect(stats.attemptedQuestions).toBe(0);
    expect(stats.masteredQuestions).toBe(0);
    expect(stats.strugglingQuestions).toBe(0);
    expect(stats.unattemptedQuestions).toBe(5);
    expect(stats.totalAttempts).toBe(0);
    expect(stats.accuracy).toBe(0);
    expect(stats.coverage).toBe(0);
    expect(stats.mastery).toBe(0);
    expect(stats.sessionsCount).toBe(0);
    expect(stats.lastActivity).toBeNull();

    // Per-section breakdown is ordered by section position.
    expect(stats.sections.map((s) => s.name)).toEqual([
      SECTION_NETWORKING,
      SECTION_CRYPTOGRAPHY,
    ]);
    expect(stats.sections.map((s) => s.totalQuestions)).toEqual([3, 2]);
    for (const section of stats.sections) {
      expect(section.attemptedQuestions).toBe(0);
      expect(section.masteredQuestions).toBe(0);
    }
  });

  test('aggregates attempts, mastery and per-section progress', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const networkingId = exam.sections.find((s) => s.name === SECTION_NETWORKING)!.id;

    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const networkingItems = session.items.filter(
      (item) => item.question.sectionId === networkingId,
    );
    const multipleChoiceItem = session.items.find(
      (item) => item.question.questionType === 'MULTIPLE_CHOICE',
    )!;

    // Networking: one correct, one wrong. Cryptography: multiple choice correct.
    await submitAnswer(gql, networkingItems[0].id, correctAnswerIdsOf(networkingItems[0]));
    await submitAnswer(gql, networkingItems[1].id, [wrongAnswerIdOf(networkingItems[1])]);
    await submitAnswer(gql, multipleChoiceItem.id, correctAnswerIdsOf(multipleChoiceItem));

    const stats = (await getExamStats(gql, exam.id))!;

    expect(stats.totalQuestions).toBe(5);
    expect(stats.attemptedQuestions).toBe(3);
    expect(stats.masteredQuestions).toBe(2);
    expect(stats.strugglingQuestions).toBe(1);
    expect(stats.unattemptedQuestions).toBe(2);
    expect(stats.totalAttempts).toBe(3);
    expect(stats.correctAttempts).toBe(2);
    expect(stats.incorrectAttempts).toBe(1);
    expect(stats.accuracy).toBeCloseTo(2 / 3, 5);
    expect(stats.coverage).toBeCloseTo(3 / 5, 5);
    expect(stats.mastery).toBeCloseTo(2 / 5, 5);
    expect(stats.sessionsCount).toBe(1);
    expect(stats.lastActivity).not.toBeNull();

    const networking = stats.sections.find((s) => s.name === SECTION_NETWORKING)!;
    expect(networking.totalQuestions).toBe(3);
    expect(networking.attemptedQuestions).toBe(2);
    expect(networking.masteredQuestions).toBe(1);
    expect(networking.strugglingQuestions).toBe(1);
    expect(networking.correctAttempts).toBe(1);
    expect(networking.incorrectAttempts).toBe(1);
    expect(networking.accuracy).toBeCloseTo(0.5, 5);
    expect(networking.mastery).toBeCloseTo(1 / 3, 5);

    const cryptography = stats.sections.find((s) => s.name === SECTION_CRYPTOGRAPHY)!;
    expect(cryptography.totalQuestions).toBe(2);
    expect(cryptography.attemptedQuestions).toBe(1);
    expect(cryptography.masteredQuestions).toBe(1);
    expect(cryptography.strugglingQuestions).toBe(0);
    expect(cryptography.accuracy).toBeCloseTo(1, 5);
    expect(cryptography.mastery).toBeCloseTo(0.5, 5);
  });

  test('repeated attempts increase attempts but not the question counts', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const firstSession = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = firstSession.items[0];
    await submitAnswer(gql, item.id, correctAnswerIdsOf(item));

    const secondSession = await startSession(gql, exam.id, 'ALL_RANDOM');
    const sameQuestionItem = secondSession.items.find(
      (i) => i.question.id === item.question.id,
    )!;
    await submitAnswer(gql, sameQuestionItem.id, [wrongAnswerIdOf(sameQuestionItem)]);

    const stats = (await getExamStats(gql, exam.id))!;

    expect(stats.totalAttempts).toBe(2);
    expect(stats.correctAttempts).toBe(1);
    expect(stats.incorrectAttempts).toBe(1);
    // The question was answered correctly once, so it stays mastered.
    expect(stats.attemptedQuestions).toBe(1);
    expect(stats.masteredQuestions).toBe(1);
    expect(stats.strugglingQuestions).toBe(0);
    expect(stats.sessionsCount).toBe(2);
  });
});

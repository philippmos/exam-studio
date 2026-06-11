import { randomUUID } from 'node:crypto';

import { defaultExamSpec, SECTION_NETWORKING, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';

const START_MUTATION = `
  mutation Start($examId: UUID!, $mode: SessionMode!, $sectionId: UUID) {
    startSession(examId: $examId, mode: $mode, sectionId: $sectionId) { id }
  }
`;

test.describe('startSession', () => {
  test('ALL_RANDOM snapshots every question of the exam exactly once', async ({
    gql,
    examFactory,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);

    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    expect(session.examId).toBe(exam.id);
    expect(session.mode).toBe('ALL_RANDOM');
    expect(session.sectionId).toBeNull();
    expect(session.finishedAt).toBeNull();
    expect(session.total).toBe(5);
    expect(session.answered).toBe(0);
    expect(session.correct).toBe(0);

    // Items are an ordered snapshot: positions 0..n-1 without gaps.
    expect(session.items.map((item) => item.position)).toEqual([0, 1, 2, 3, 4]);

    // Every question of the document appears exactly once (order is shuffled).
    const questionTexts = session.items.map((item) => item.question.text).sort();
    const expectedTexts = spec.questions.map((q) => q.question).sort();
    expect(questionTexts).toEqual(expectedTexts);
  });

  test('a fresh session does not reveal any correctness information', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    for (const item of session.items) {
      expect(item.selectedAnswerIds).toEqual([]);
      expect(item.correctAnswerIds).toBeNull();
      expect(item.isCorrect).toBeNull();
      expect(item.answeredAt).toBeNull();
      expect(item.question.answers.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('the schema does not expose is_correct on answers at all', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    const message = await gql.expectError(
      `query Leak($id: UUID!) {
        session(id: $id) { items { question { answers { isCorrect } } } }
      }`,
      { id: session.id },
    );
    expect(message).toContain("Cannot query field 'isCorrect'");
  });

  test('BY_SECTION only contains questions of the chosen section', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const networking = exam.sections.find((s) => s.name === SECTION_NETWORKING)!;

    const session = await startSession(gql, exam.id, 'BY_SECTION', networking.id);

    expect(session.mode).toBe('BY_SECTION');
    expect(session.sectionId).toBe(networking.id);
    expect(session.total).toBe(networking.questionCount);
    for (const item of session.items) {
      expect(item.question.sectionId).toBe(networking.id);
    }
  });

  test('BY_SECTION requires a sectionId', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();

    const message = await gql.expectError(START_MUTATION, {
      examId: exam.id,
      mode: 'BY_SECTION',
      sectionId: null,
    });
    expect(message).toContain('sectionId is required');
  });

  test('UNANSWERED skips questions that were already answered correctly', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const firstRun = await startSession(gql, exam.id, 'ALL_RANDOM');

    // Answer one question correctly and another one incorrectly.
    const [masteredItem, failedItem] = firstRun.items;
    await submitAnswer(gql, masteredItem.id, correctAnswerIdsOf(masteredItem));
    await submitAnswer(gql, failedItem.id, [wrongAnswerIdOf(failedItem)]);

    const retry = await startSession(gql, exam.id, 'UNANSWERED');

    expect(retry.total).toBe(4);
    const retryQuestionIds = retry.items.map((item) => item.question.id);
    expect(retryQuestionIds).not.toContain(masteredItem.question.id);
    expect(retryQuestionIds).toContain(failedItem.question.id);
  });

  test('fails for an unknown exam', async ({ gql }) => {
    const message = await gql.expectError(START_MUTATION, {
      examId: randomUUID(),
      mode: 'ALL_RANDOM',
      sectionId: null,
    });
    expect(message).toContain('Exam not found');
  });
});

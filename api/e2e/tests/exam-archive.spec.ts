import { randomUUID } from 'node:crypto';

import { expect, test } from '../src/fixtures';
import {
  getArchivedExams,
  getExam,
  getExams,
  getExamStats,
  getSessions,
  setExamArchived,
  startSession,
  submitAnswer,
  correctAnswerIdsOf,
} from '../src/operations';

test.describe('exam archiving', () => {
  test('archiving hides the exam from the dashboard list but keeps it reachable', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const archived = await setExamArchived(gql, exam.id, true);
    expect(archived.archived).toBe(true);

    // Gone from the active list, present in the archive list.
    const active = await getExams(gql);
    expect(active.some((e) => e.id === exam.id)).toBe(false);
    const archivedList = await getArchivedExams(gql);
    expect(archivedList.some((e) => e.id === exam.id)).toBe(true);

    // Still fetchable by id (its progress page keeps working).
    const byId = await getExam(gql, exam.id);
    expect(byId).not.toBeNull();
    expect(byId!.archived).toBe(true);
  });

  test('restoring brings the exam back to the dashboard list', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setExamArchived(gql, exam.id, true);

    const restored = await setExamArchived(gql, exam.id, false);
    expect(restored.archived).toBe(false);

    const active = await getExams(gql);
    expect(active.some((e) => e.id === exam.id)).toBe(true);
    const archivedList = await getArchivedExams(gql);
    expect(archivedList.some((e) => e.id === exam.id)).toBe(false);
  });

  test('a freshly imported exam is active by default', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const byId = await getExam(gql, exam.id);
    expect(byId!.archived).toBe(false);
  });

  test('starting a session for an archived exam is rejected', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setExamArchived(gql, exam.id, true);

    const message = await gql.expectError(
      `mutation Start($examId: UUID!, $mode: SessionMode!) {
        startSession(examId: $examId, mode: $mode) { id }
      }`,
      { examId: exam.id, mode: 'ALL_RANDOM' },
    );
    expect(message).toContain('archived');
  });

  test('archived exams keep their history for statistics and sessions', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    // Answer one question, then archive the exam.
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const item = session.items[0];
    await submitAnswer(gql, item.id, correctAnswerIdsOf(item));
    await setExamArchived(gql, exam.id, true);

    // The recorded attempt still surfaces in the exam's statistics...
    const stats = await getExamStats(gql, exam.id);
    expect(stats).not.toBeNull();
    expect(stats!.totalAttempts).toBe(1);
    expect(stats!.correctAttempts).toBe(1);

    // ...and the session is still listed for the exam.
    const sessions = await getSessions(gql, exam.id);
    expect(sessions.some((s) => s.id === session.id)).toBe(true);
  });

  test('setExamArchived reports an error for an unknown exam', async ({ gql }) => {
    const message = await gql.expectError(
      `mutation SetArchived($examId: UUID!, $archived: Boolean!) {
        setExamArchived(examId: $examId, archived: $archived) { id }
      }`,
      { examId: randomUUID(), archived: true },
    );
    expect(message).toContain('not found');
  });
});

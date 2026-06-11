import { randomUUID } from 'node:crypto';

import { SECTION_NETWORKING } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  deleteExam,
  deleteSession,
  finishSession,
  getExam,
  getSession,
  getSessions,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';

test.describe('session lifecycle', () => {
  test('finishSession stamps finishedAt and keeps the results', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const [first, second] = session.items;

    await submitAnswer(gql, first.id, correctAnswerIdsOf(first));
    await submitAnswer(gql, second.id, [wrongAnswerIdOf(second)]);

    const finished = await finishSession(gql, session.id);

    expect(finished.finishedAt).not.toBeNull();
    expect(Date.parse(finished.finishedAt!)).not.toBeNaN();
    expect(finished.total).toBe(5);
    expect(finished.answered).toBe(2);
    expect(finished.correct).toBe(1);
  });

  test('finishSession fails for an unknown session', async ({ gql }) => {
    const message = await gql.expectError(
      `mutation Finish($id: UUID!) { finishSession(id: $id) { id } }`,
      { id: randomUUID() },
    );
    expect(message).toContain('Session not found');
  });

  test('session returns null for an unknown id', async ({ gql }) => {
    await expect(getSession(gql, randomUUID())).resolves.toBeNull();
  });

  test('sessions overview reports progress, newest first', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const networking = exam.sections.find((s) => s.name === SECTION_NETWORKING)!;

    const olderSession = await startSession(gql, exam.id, 'ALL_RANDOM');
    const answeredItem = olderSession.items[0];
    await submitAnswer(gql, answeredItem.id, correctAnswerIdsOf(answeredItem));
    await finishSession(gql, olderSession.id);

    const newerSession = await startSession(gql, exam.id, 'BY_SECTION', networking.id);

    const overviews = await getSessions(gql, exam.id);

    expect(overviews.map((o) => o.id)).toEqual([newerSession.id, olderSession.id]);

    const [newer, older] = overviews;
    expect(newer.examName).toBe(exam.name);
    expect(newer.mode).toBe('BY_SECTION');
    expect(newer.sectionName).toBe(SECTION_NETWORKING);
    expect(newer.total).toBe(networking.questionCount);
    expect(newer.answered).toBe(0);
    expect(newer.finishedAt).toBeNull();

    expect(older.mode).toBe('ALL_RANDOM');
    expect(older.sectionName).toBeNull();
    expect(older.total).toBe(5);
    expect(older.answered).toBe(1);
    expect(older.correct).toBe(1);
    expect(older.finishedAt).not.toBeNull();
  });

  test('the unfiltered sessions overview includes sessions of all exams', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    const overviews = await getSessions(gql);

    expect(overviews.map((o) => o.id)).toContain(session.id);
  });

  test('deleteSession removes the session but keeps the exam', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    await expect(deleteSession(gql, session.id)).resolves.toBe(true);
    await expect(getSession(gql, session.id)).resolves.toBeNull();
    await expect(getExam(gql, exam.id)).resolves.not.toBeNull();

    await expect(deleteSession(gql, session.id)).resolves.toBe(false);
  });

  test('deleting an exam cascades to its sessions', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    await expect(deleteExam(gql, exam.id)).resolves.toBe(true);

    await expect(getSession(gql, session.id)).resolves.toBeNull();
    await expect(getSessions(gql, exam.id)).resolves.toEqual([]);
  });
});

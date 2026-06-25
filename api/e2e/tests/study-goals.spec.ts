import { randomUUID } from 'node:crypto';

import { expect, test } from '../src/fixtures';
import {
  clearStudyGoal,
  correctAnswerIdsOf,
  getExam,
  getStudyGoalProgress,
  setStudyGoal,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';

/** UTC calendar day of "now", matching the API's default bucketing. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Monday of the ISO week the given day belongs to. */
function mondayOf(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

test.describe('study goals', () => {
  test('a fresh exam has no goal and no progress entry', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    expect(exam.studyGoal).toBeNull();
    await expect(getStudyGoalProgress(gql, exam.id)).resolves.toEqual([]);
  });

  test('setStudyGoal stores and replaces the goal', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const daily = await setStudyGoal(gql, exam.id, 'DAILY', 10);
    expect(daily.studyGoal).toEqual({
      period: 'DAILY',
      target: 10,
      source: 'MANUAL',
    });

    // The goal is persisted, not just echoed by the mutation.
    const reloaded = await getExam(gql, exam.id);
    expect(reloaded!.studyGoal).toEqual({
      period: 'DAILY',
      target: 10,
      source: 'MANUAL',
    });

    // Setting again replaces the previous goal.
    const weekly = await setStudyGoal(gql, exam.id, 'WEEKLY', 100);
    expect(weekly.studyGoal).toEqual({
      period: 'WEEKLY',
      target: 100,
      source: 'MANUAL',
    });
  });

  test('rejects invalid targets and unknown exams', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const mutation = `mutation SetGoal($examId: UUID!, $period: GoalPeriod!, $target: Int!) {
      setStudyGoal(examId: $examId, period: $period, target: $target) { id }
    }`;

    const zeroTarget = await gql.expectError(mutation, {
      examId: exam.id,
      period: 'DAILY',
      target: 0,
    });
    expect(zeroTarget).toContain('at least 1');

    const unknownExam = await gql.expectError(mutation, {
      examId: randomUUID(),
      period: 'DAILY',
      target: 10,
    });
    expect(unknownExam).toContain('Exam not found');
  });

  test('clearStudyGoal removes the goal and its progress entry', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setStudyGoal(gql, exam.id, 'DAILY', 10);

    const cleared = await clearStudyGoal(gql, exam.id);

    expect(cleared.studyGoal).toBeNull();
    await expect(getStudyGoalProgress(gql, exam.id)).resolves.toEqual([]);
  });

  test('counts every question answered in the current daily period', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setStudyGoal(gql, exam.id, 'DAILY', 5);

    const fresh = await getStudyGoalProgress(gql, exam.id);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({
      examId: exam.id,
      period: 'DAILY',
      target: 5,
      answered: 0,
    });

    // Guard against the rare midnight rollover between submit and assert.
    const dayBefore = todayUtc();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const [first, second, third] = session.items;
    await submitAnswer(gql, first.id, correctAnswerIdsOf(first));
    await submitAnswer(gql, second.id, correctAnswerIdsOf(second));
    // Wrong answers count too: the goal tracks practice volume, not accuracy.
    await submitAnswer(gql, third.id, [wrongAnswerIdOf(third)]);

    const progress = await getStudyGoalProgress(gql, exam.id);
    const dayAfter = todayUtc();

    expect(progress).toHaveLength(1);
    expect(progress[0].answered).toBe(3);
    expect([dayBefore, dayAfter]).toContain(progress[0].periodStart);

    // Re-attempting a question in another session counts again.
    const second_session = await startSession(gql, exam.id, 'ALL_RANDOM');
    await submitAnswer(
      gql,
      second_session.items[0].id,
      correctAnswerIdsOf(second_session.items[0]),
    );
    const after = await getStudyGoalProgress(gql, exam.id);
    expect(after[0].answered).toBe(4);
  });

  test('weekly goals start on Monday of the current week', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setStudyGoal(gql, exam.id, 'WEEKLY', 100);

    const dayBefore = todayUtc();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    await submitAnswer(gql, session.items[0].id, correctAnswerIdsOf(session.items[0]));

    const progress = await getStudyGoalProgress(gql, exam.id);
    const dayAfter = todayUtc();

    expect(progress).toHaveLength(1);
    expect(progress[0].period).toBe('WEEKLY');
    expect(progress[0].answered).toBe(1);
    expect([mondayOf(dayBefore), mondayOf(dayAfter)]).toContain(
      progress[0].periodStart,
    );
  });

  test('progress is tracked per exam', async ({ gql, examFactory }) => {
    const examA = await examFactory.createDefault();
    const examB = await examFactory.createDefault();
    await setStudyGoal(gql, examA.id, 'DAILY', 10);
    await setStudyGoal(gql, examB.id, 'WEEKLY', 100);

    const session = await startSession(gql, examA.id, 'ALL_RANDOM');
    await submitAnswer(gql, session.items[0].id, correctAnswerIdsOf(session.items[0]));

    const progressA = await getStudyGoalProgress(gql, examA.id);
    expect(progressA[0].answered).toBe(1);

    const progressB = await getStudyGoalProgress(gql, examB.id);
    expect(progressB[0].answered).toBe(0);

    // The unfiltered list runs over a shared database (tests run in parallel),
    // so only assert it contains this test's exams.
    const all = await getStudyGoalProgress(gql);
    const ids = all.map((entry) => entry.examId);
    expect(ids).toContain(examA.id);
    expect(ids).toContain(examB.id);
  });
});

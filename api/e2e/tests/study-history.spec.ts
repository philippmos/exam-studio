import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  getStudyHistory,
  startSession,
  submitAnswer,
  wrongAnswerIdOf,
} from '../src/operations';

/** UTC calendar day of "now", matching the API's default bucketing. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDay: string, days: number): string {
  return new Date(Date.parse(`${isoDay}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

test.describe('studyHistory', () => {
  test('a fresh exam has no history', async ({ gql, examFactory }) => {
    const exam = await examFactory.createDefault();

    await expect(getStudyHistory(gql, exam.id)).resolves.toEqual([]);
  });

  test('buckets answered questions by day with a correct/incorrect split', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    const [first, second, third] = session.items;

    // Guard against the rare midnight rollover between submit and assert.
    const dayBefore = todayUtc();
    await submitAnswer(gql, first.id, correctAnswerIdsOf(first));
    await submitAnswer(gql, second.id, correctAnswerIdsOf(second));
    await submitAnswer(gql, third.id, [wrongAnswerIdOf(third)]);

    const history = await getStudyHistory(gql, exam.id);
    const dayAfter = todayUtc();

    expect(history).toHaveLength(1);
    expect([dayBefore, dayAfter]).toContain(history[0].day);
    expect(history[0].total).toBe(3);
    expect(history[0].correct).toBe(2);
    expect(history[0].incorrect).toBe(1);
  });

  test('is filtered per exam and accumulated globally', async ({
    gql,
    examFactory,
  }) => {
    const examA = await examFactory.createDefault();
    const examB = await examFactory.createDefault();

    const sessionA = await startSession(gql, examA.id, 'ALL_RANDOM');
    await submitAnswer(gql, sessionA.items[0].id, correctAnswerIdsOf(sessionA.items[0]));

    const sessionB = await startSession(gql, examB.id, 'ALL_RANDOM');
    await submitAnswer(gql, sessionB.items[0].id, correctAnswerIdsOf(sessionB.items[0]));
    await submitAnswer(gql, sessionB.items[1].id, [wrongAnswerIdOf(sessionB.items[1])]);

    const historyA = await getStudyHistory(gql, examA.id);
    expect(historyA).toHaveLength(1);
    expect(historyA[0].total).toBe(1);
    expect(historyA[0].correct).toBe(1);

    const historyB = await getStudyHistory(gql, examB.id);
    expect(historyB).toHaveLength(1);
    expect(historyB[0].total).toBe(2);
    expect(historyB[0].correct).toBe(1);
    expect(historyB[0].incorrect).toBe(1);

    // The global history runs over a shared database (tests run in parallel),
    // so only assert it contains at least this test's attempts.
    const global = await getStudyHistory(gql);
    const todayBucket = global.find((d) => d.day === historyA[0].day);
    expect(todayBucket).toBeDefined();
    expect(todayBucket!.total).toBeGreaterThanOrEqual(3);
  });

  test('shifts day buckets by the timezone offset', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    await submitAnswer(gql, session.items[0].id, correctAnswerIdsOf(session.items[0]));

    const utc = await getStudyHistory(gql, exam.id, 0);
    // +24h pushes every timestamp into the next calendar day, regardless of
    // the time of day this test runs.
    const shifted = await getStudyHistory(gql, exam.id, 24 * 60);

    expect(utc).toHaveLength(1);
    expect(shifted).toHaveLength(1);
    expect(shifted[0].day).toBe(addDays(utc[0].day, 1));
    expect(shifted[0].total).toBe(utc[0].total);
  });

  test('history is ordered oldest day first', async ({ gql }) => {
    const global = await getStudyHistory(gql);
    const days = global.map((d) => d.day);

    expect([...days].sort()).toEqual(days);
  });
});

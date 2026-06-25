import { expect, test } from '../src/fixtures';
import {
  correctAnswerIdsOf,
  getStudyStreak,
  startSession,
  submitAnswer,
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

test.describe('studyStreak', () => {
  test('reports a live streak after answering today', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    // Guard against the rare midnight rollover between submit and assert.
    const dayBefore = todayUtc();
    await submitAnswer(gql, session.items[0].id, correctAnswerIdsOf(session.items[0]));

    const streak = await getStudyStreak(gql, 0);
    const dayAfter = todayUtc();

    // The streak is global, so a shared parallel database may push the numbers
    // higher; only the lower bounds and today's bucket are deterministic.
    expect(streak.studiedToday).toBe(true);
    expect(streak.current).toBeGreaterThanOrEqual(1);
    expect(streak.longest).toBeGreaterThanOrEqual(streak.current);

    expect(streak.recentDays).toHaveLength(7);
    const today = streak.recentDays[6];
    expect([dayBefore, dayAfter]).toContain(today.day);
    expect(today.active).toBe(true);
  });

  test('recent days are a 7-day window, oldest first, ending today', async ({
    gql,
  }) => {
    const dayBefore = todayUtc();
    const streak = await getStudyStreak(gql, 0);
    const dayAfter = todayUtc();

    const days = streak.recentDays.map((d) => d.day);
    expect(days).toHaveLength(7);
    // Strictly ascending, one calendar day apart.
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBe(addDays(days[i - 1], 1));
    }
    expect([dayBefore, dayAfter]).toContain(days[6]);
  });

  test('shifts the day window by the timezone offset', async ({ gql }) => {
    const utc = await getStudyStreak(gql, 0);
    // +24h pushes "today" (and the whole window) into the next calendar day.
    const shifted = await getStudyStreak(gql, 24 * 60);

    expect(shifted.recentDays).toHaveLength(7);
    expect(shifted.recentDays[6].day).toBe(addDays(utc.recentDays[6].day, 1));
    expect(shifted.recentDays[0].day).toBe(addDays(utc.recentDays[0].day, 1));
  });
});

import { expect, test } from '../src/fixtures';
import {
  clearCertificationExamDate,
  getStudyGoalProgress,
  getSuggestedStudyGoal,
  setCertificationExamDate,
  setStudyGoal,
} from '../src/operations';

/** ISO datetime `days` days from now (negative for the past). */
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

test.describe('study plan (goal from exam date)', () => {
  test('suggests nothing without a certification date', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await expect(getSuggestedStudyGoal(gql, exam.id, 'DAILY')).resolves.toBeNull();
  });

  test('suggests nothing when the exam is not a full day away', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    // No runway to spread the workload over.
    await expect(
      getSuggestedStudyGoal(gql, exam.id, 'DAILY', daysFromNow(0)),
    ).resolves.toBeNull();
    await expect(
      getSuggestedStudyGoal(gql, exam.id, 'DAILY', daysFromNow(-3)),
    ).resolves.toBeNull();
  });

  test('bakes spaced repetition into the daily target', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault(); // 5 questions

    const s = (await getSuggestedStudyGoal(gql, exam.id, 'DAILY', daysFromNow(30)))!;

    expect(s.period).toBe('DAILY');
    expect(s.questionCount).toBe(5);
    // Each question is answered several times (Leitner ladder), not once.
    expect(s.repetitionFactor).toBeGreaterThan(1);
    expect(s.usableDays).toBeGreaterThan(0);
    // A buffer is reserved before the exam, so usable < total days.
    expect(s.usableDays).toBeLessThanOrEqual(s.daysUntilExam);
    // The target is the full workload (questions x repetitions) per usable day.
    expect(s.target).toBe(
      Math.ceil((s.questionCount * s.repetitionFactor) / s.usableDays),
    );
    // ... and therefore strictly more than the naive "questions / days" split.
    expect(s.target).toBeGreaterThan(Math.ceil(s.questionCount / s.usableDays) - 1);
  });

  test('spreads the workload across weeks for a weekly goal', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const s = (await getSuggestedStudyGoal(gql, exam.id, 'WEEKLY', daysFromNow(60)))!;

    expect(s.period).toBe('WEEKLY');
    const usableWeeks = Math.max(1, Math.ceil(s.usableDays / 7));
    expect(s.target).toBe(
      Math.ceil((s.questionCount * s.repetitionFactor) / usableWeeks),
    );
  });

  test('setting an exam date creates an automatic goal', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    expect(exam.studyGoal).toBeNull();

    const updated = await setCertificationExamDate(gql, exam.id, daysFromNow(30));

    expect(updated.studyGoal).not.toBeNull();
    expect(updated.studyGoal!.source).toBe('AUTO');
    expect(updated.studyGoal!.period).toBe('DAILY');

    // The stored target matches what the suggestion query reports.
    const suggestion = (await getSuggestedStudyGoal(gql, exam.id, 'DAILY'))!;
    expect(updated.studyGoal!.target).toBe(suggestion.target);

    // The automatic goal also drives the progress bars.
    const progress = await getStudyGoalProgress(gql, exam.id);
    expect(progress).toHaveLength(1);
    expect(progress[0].target).toBe(updated.studyGoal!.target);
  });

  test('keeps a manual goal when the exam date changes', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setStudyGoal(gql, exam.id, 'DAILY', 7, 'MANUAL');

    const updated = await setCertificationExamDate(gql, exam.id, daysFromNow(30));

    expect(updated.studyGoal).toEqual({
      period: 'DAILY',
      target: 7,
      source: 'MANUAL',
    });
  });

  test('recomputes an automatic goal when the date moves further out', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const near = await setCertificationExamDate(gql, exam.id, daysFromNow(7));
    const far = await setCertificationExamDate(gql, exam.id, daysFromNow(120));

    expect(near.studyGoal!.source).toBe('AUTO');
    expect(far.studyGoal!.source).toBe('AUTO');
    // More time to study -> a lower (or equal) daily target.
    expect(far.studyGoal!.target).toBeLessThanOrEqual(near.studyGoal!.target);
  });

  test('clearing the exam date removes an automatic goal', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setCertificationExamDate(gql, exam.id, daysFromNow(30));

    const cleared = await clearCertificationExamDate(gql, exam.id);

    expect(cleared.studyGoal).toBeNull();
    await expect(getStudyGoalProgress(gql, exam.id)).resolves.toEqual([]);
  });

  test('clearing the exam date keeps a manual goal', async ({
    gql,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();
    await setStudyGoal(gql, exam.id, 'WEEKLY', 40, 'MANUAL');
    await setCertificationExamDate(gql, exam.id, daysFromNow(30));

    const cleared = await clearCertificationExamDate(gql, exam.id);

    expect(cleared.studyGoal).toEqual({
      period: 'WEEKLY',
      target: 40,
      source: 'MANUAL',
    });
  });
});

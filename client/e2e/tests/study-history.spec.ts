import { smallExamSpec, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/dashboard-page';
import { ExamDetailPage } from '../src/pages/exam-detail-page';
import { QuizPage } from '../src/pages/quiz-page';

test.describe('study history', () => {
  test('charts my answers per day on the learning progress page', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    // Answer all 3 questions, one of them wrong.
    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('all');
    await quiz.completeSession(3, { wrongAnswers: 1 });
    await quiz.expectSummary(2, 3);

    await page.getByRole('button', { name: 'Dashboard' }).click();
    await dashboard.openLearningProgress(name);

    // The study activity panel shows one bar (today) for this fresh exam.
    await expect(page.getByText('Study activity')).toBeVisible();
    const chart = page.locator('app-study-history-chart');
    await expect(chart.locator('.fill.total')).toHaveCount(1);

    await chart.locator('.slot').first().hover();
    await expect(page.getByRole('tooltip')).toContainText(
      '3 answered · 2 correct · 1 incorrect',
    );

    // The metric toggle recolours the bar for the selected series.
    await chart.locator('mat-button-toggle', { hasText: 'Correct' }).click();
    await expect(chart.locator('.fill.correct')).toHaveCount(1);
    await chart.locator('mat-button-toggle', { hasText: 'Incorrect' }).click();
    await expect(chart.locator('.fill.incorrect')).toHaveCount(1);
  });

  test('accumulates activity across exams on the statistics page', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('all');
    await quiz.completeSession(3);

    await page.getByRole('link', { name: 'Statistics' }).click();
    await expect(page).toHaveURL(/\/statistics$/);
    await expect(
      page.getByRole('heading', { name: 'Study history' }),
    ).toBeVisible();

    // The database is shared with other parallel tests, so only assert that
    // the global view contains activity, not exact numbers.
    await expect(page.getByText('Questions answered')).toBeVisible();
    await expect(page.getByText('Study days')).toBeVisible();
    const bars = page.locator('app-study-history-chart .fill.total');
    expect(await bars.count()).toBeGreaterThanOrEqual(1);
  });
});

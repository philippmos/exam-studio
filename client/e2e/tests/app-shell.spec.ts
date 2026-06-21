import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/dashboard-page';

test.describe('app shell', () => {
  test('navigates between the exams, sessions and statistics areas', async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await expect(page.getByRole('link', { name: 'Exam Studio' })).toBeVisible();

    await page.getByRole('link', { name: 'Sessions' }).click();
    await expect(page).toHaveURL(/\/sessions$/);
    await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();

    await page.getByRole('link', { name: 'Statistics' }).click();
    await expect(page).toHaveURL(/\/statistics$/);
    await expect(
      page.getByRole('heading', { name: 'Study history' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Exams' }).click();
    await expect(page.getByRole('heading', { name: 'Your exams' })).toBeVisible();
  });

  test('shows the seeded sample exam on the dashboard', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Imported by the global setup ("create + seed the database" step).
    const sampleCard = dashboard.examCard('Sample: Network Fundamentals');
    await expect(sampleCard).toBeVisible();
    await expect(sampleCard).toContainText('2 modules');
    await expect(sampleCard).toContainText('5 questions');
  });

  test('unknown routes redirect to the dashboard', async ({ page }) => {
    await page.goto('/this/route/does-not-exist');
    await expect(page.getByRole('heading', { name: 'Your exams' })).toBeVisible();
  });
});

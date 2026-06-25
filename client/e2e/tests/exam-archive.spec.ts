import { smallExamSpec, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { ArchivePage } from '../src/pages/archive-page';
import { DashboardPage } from '../src/pages/dashboard-page';

test.describe('exam archiving', () => {
  test('archiving moves an exam to the archive and restoring brings it back', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName('Archive Me');
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const card = dashboard.examCard(name);
    await expect(card).toBeVisible();

    // Deleting is no longer offered on the dashboard — only archiving is.
    await expect(card.getByRole('button', { name: 'Archive exam' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Delete exam' })).toHaveCount(0);

    // Archiving removes the card from the dashboard.
    await dashboard.archiveExam(name);
    await expect(page.getByText(`"${name}" archived.`)).toBeVisible();
    await expect(dashboard.examCard(name)).toBeHidden();

    // The exam now lives on the archive page.
    await page.getByRole('link', { name: 'Archive' }).click();
    await expect(page).toHaveURL(/\/archive$/);
    const archive = new ArchivePage(page);
    await expect(archive.examCard(name)).toBeVisible();

    // Restoring it returns it to the dashboard.
    await archive.restoreExam(name);
    await expect(page.getByText(`"${name}" restored.`)).toBeVisible();
    await expect(archive.examCard(name)).toBeHidden();

    await dashboard.goto();
    await expect(dashboard.examCard(name)).toBeVisible();
  });

  test('opening an archived exam by direct URL redirects to the dashboard', async ({
    page,
    api,
    examFactory,
  }) => {
    const name = uniqueName('Archived Redirect');
    const exam = await examFactory.create(smallExamSpec(name));
    await api.setExamArchived(exam.id, true);

    await page.goto(`/exams/${exam.id}`);

    await expect(
      page.getByRole('heading', { name: 'Your exams' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

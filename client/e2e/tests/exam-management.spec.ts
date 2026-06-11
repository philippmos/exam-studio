import { smallExamSpec, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/dashboard-page';

test.describe('exam management', () => {
  test('deleting an exam requires confirmation', async ({ page, examFactory }) => {
    const name = uniqueName('Delete Me');
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    // Cancelling the confirm dialog keeps the exam.
    await dashboard.requestDeleteExam(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(dashboard.examCard(name)).toBeVisible();

    // Confirming deletes it.
    await dashboard.requestDeleteExam(name);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();

    await expect(page.getByText('Exam deleted.')).toBeVisible();
    await expect(dashboard.examCard(name)).toBeHidden();
  });
});

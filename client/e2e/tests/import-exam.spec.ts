import { buildPayload, smallExamSpec, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/dashboard-page';
import { ExamDetailPage } from '../src/pages/exam-detail-page';

test.describe('exam import', () => {
  test('imports an exam from a JSON file', async ({ page, api }) => {
    const name = uniqueName('UI Import');
    const dashboard = new DashboardPage(page);

    try {
      await dashboard.goto();
      const dialog = await dashboard.openImportDialog();

      // Without a file the import action is disabled.
      const importButton = dialog.getByRole('button', { name: 'Import', exact: true });
      await expect(importButton).toBeDisabled();

      await dashboard.chooseImportFile(
        `${name}.json`,
        buildPayload(smallExamSpec(name)),
      );
      // The chosen file name is reflected on the picker button.
      await expect(dialog.getByRole('button', { name: `${name}.json` })).toBeVisible();

      await importButton.click();

      await expect(page.getByText(`Imported "${name}".`)).toBeVisible();
      const card = dashboard.examCard(name);
      await expect(card).toBeVisible();
      await expect(card).toContainText('Playwright UI Suite');
      await expect(card).toContainText('1 modules');
      await expect(card).toContainText('3 questions');
    } finally {
      await api.deleteExamsByName(name);
    }
  });

  test('adds new questions to an existing exam and skips duplicates', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName('UI Add Questions');
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.expectLoaded(name);
    await expect(page.getByText('1 modules · 3 questions')).toBeVisible();

    // Upload the original three questions (duplicates) plus one brand-new one.
    const upload = smallExamSpec(name);
    upload.questions.push({
      question: 'Which HTTP method is both safe and idempotent?',
      section_key: 'core',
      question_type: 'single_choice',
      answers: [{ text: 'GET', is_correct: true }, { text: 'POST' }],
    });

    await detail.addQuestions(`${name}.json`, buildPayload(upload));

    await expect(
      page.getByText(
        'Added 1 question. 3 already-imported questions were skipped.',
      ),
    ).toBeVisible();
    // The header reflects the single new question; nothing was removed.
    await expect(page.getByText('1 modules · 4 questions')).toBeVisible();
  });

  test('rejects an invalid file and keeps the dialog open', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    const dialog = await dashboard.openImportDialog();

    await dashboard.chooseImportFile('broken.json', 'this is not json {');
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();

    // The API error is surfaced in the dialog instead of closing it.
    await expect(dialog.getByText(/Invalid JSON/)).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Import exam' })).toBeVisible();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

import { smallExamSpec, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { ArchivePage } from '../src/pages/archive-page';

test.describe('exam management', () => {
  test('an exam can only be deleted from the archive, with confirmation', async ({
    page,
    api,
    examFactory,
  }) => {
    const name = uniqueName('Delete Me');
    const exam = await examFactory.create(smallExamSpec(name));
    // Deletion lives on the archive page now, so archive the exam first.
    await api.setExamArchived(exam.id, true);

    const archive = new ArchivePage(page);
    await archive.goto();
    await expect(archive.examCard(name)).toBeVisible();

    // Cancelling the confirm dialog keeps the exam.
    await archive.requestDeleteExam(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(archive.examCard(name)).toBeVisible();

    // Confirming deletes it.
    await archive.requestDeleteExam(name);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();

    await expect(page.getByText('Exam deleted.')).toBeVisible();
    await expect(archive.examCard(name)).toBeHidden();
  });
});

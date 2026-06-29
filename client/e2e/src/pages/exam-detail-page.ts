import { expect, Page } from '@playwright/test';

export type StartMode = 'all' | 'by-section' | 'unanswered';

const MODE_LABELS: Record<StartMode, string> = {
  all: 'All questions, shuffled',
  'by-section': 'A specific module',
  unanswered: 'Only not-yet-correct',
};

export class ExamDetailPage {
  constructor(readonly page: Page) {}

  async expectLoaded(examName: string): Promise<void> {
    await expect(this.page.getByRole('heading', { name: examName })).toBeVisible();
    await expect(
      this.page.getByRole('button', { name: 'Start exam mode' }),
    ).toBeVisible();
  }

  /** Opens the session setup dialog, picks a mode and starts the session. */
  async startExamMode(
    mode: StartMode = 'all',
    options: { sectionName?: string } = {},
  ): Promise<void> {
    await this.page.getByRole('button', { name: 'Start exam mode' }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Start exam mode' }),
    ).toBeVisible();

    await dialog.getByRole('radio', { name: MODE_LABELS[mode] }).check();

    if (mode === 'by-section') {
      await dialog.getByRole('combobox').click();
      // Material renders select options in an overlay outside the dialog.
      await this.page
        .getByRole('option', { name: options.sectionName! })
        .click();
    }

    await dialog.getByRole('button', { name: 'Start' }).click();
    await expect(this.page).toHaveURL(/\/sessions\//);
  }

  /**
   * Opens the "Add questions" dialog, uploads a JSON document and confirms.
   * The dialog closes itself on success (a snackbar then reports the result).
   */
  async addQuestions(fileName: string, content: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Add questions' }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Add questions' }),
    ).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'application/json',
      buffer: Buffer.from(content, 'utf-8'),
    });

    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  }
}

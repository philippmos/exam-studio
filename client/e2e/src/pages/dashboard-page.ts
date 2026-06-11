import { expect, Locator, Page } from '@playwright/test';

export class DashboardPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(
      this.page.getByRole('heading', { name: 'Your exams' }),
    ).toBeVisible();
  }

  examCard(examName: string): Locator {
    return this.page.locator('app-exam-card').filter({ hasText: examName });
  }

  async openExam(examName: string): Promise<void> {
    await this.examCard(examName).getByRole('button', { name: 'Open' }).click();
  }

  async openLearningProgress(examName: string): Promise<void> {
    await this.examCard(examName)
      .getByRole('button', { name: 'Learning progress' })
      .click();
  }

  /** Clicks the delete icon on the card; the confirm dialog is left open. */
  async requestDeleteExam(examName: string): Promise<void> {
    await this.examCard(examName)
      .getByRole('button', { name: 'Delete exam' })
      .click();
    await expect(
      this.page.getByRole('heading', { name: 'Delete exam' }),
    ).toBeVisible();
  }

  importDialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async openImportDialog(): Promise<Locator> {
    await this.page.getByRole('button', { name: 'Import exam' }).first().click();
    const dialog = this.importDialog();
    await expect(dialog.getByRole('heading', { name: 'Import exam' })).toBeVisible();
    return dialog;
  }

  /** Selects a virtual file in the (hidden) file input of the import dialog. */
  async chooseImportFile(fileName: string, content: string): Promise<void> {
    await this.page.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: 'application/json',
      buffer: Buffer.from(content, 'utf-8'),
    });
  }
}

import { expect, Locator, Page } from '@playwright/test';

export class ArchivePage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/archive');
    await expect(
      this.page.getByRole('heading', { name: 'Archive' }),
    ).toBeVisible();
  }

  examCard(examName: string): Locator {
    return this.page.locator('mat-card').filter({ hasText: examName });
  }

  async restoreExam(examName: string): Promise<void> {
    await this.examCard(examName).getByRole('button', { name: 'Restore' }).click();
  }

  /** Clicks the delete icon on the archived card; leaves the confirm dialog open. */
  async requestDeleteExam(examName: string): Promise<void> {
    await this.examCard(examName)
      .getByRole('button', { name: 'Delete exam' })
      .click();
    await expect(
      this.page.getByRole('heading', { name: 'Delete exam' }),
    ).toBeVisible();
  }
}

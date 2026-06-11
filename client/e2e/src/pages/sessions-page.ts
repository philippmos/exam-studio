import { expect, Locator, Page } from '@playwright/test';

export class SessionsPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/sessions');
    await expect(this.page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  }

  sessionCard(examName: string): Locator {
    return this.page.locator('.session-card').filter({ hasText: examName });
  }

  async continueSession(examName: string): Promise<void> {
    await this.sessionCard(examName)
      .getByRole('button', { name: 'Continue' })
      .click();
    await expect(this.page).toHaveURL(/\/sessions\//);
  }

  async deleteSession(examName: string): Promise<void> {
    await this.sessionCard(examName)
      .getByRole('button', { name: 'Delete session' })
      .click();
    const dialog = this.page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Delete session' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
  }
}

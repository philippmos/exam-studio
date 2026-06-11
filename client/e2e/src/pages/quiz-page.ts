import { expect, Locator, Page } from '@playwright/test';

import { CORRECT_PREFIX, WRONG_PREFIX } from '../exam-payload';

/**
 * Page object for the quiz runner (/sessions/:id).
 *
 * Questions are shuffled by the API, so the helpers never assume an order:
 * they recognise correct/wrong answers via the "Correct:"/"Wrong:" text
 * markers from the test fixtures and detect multiple-choice questions via
 * the "Check answer" button.
 */
export class QuizPage {
  constructor(readonly page: Page) {}

  private get positionLabel(): Locator {
    return this.page.locator('.position');
  }

  private get options(): Locator {
    return this.page.locator('button.option');
  }

  private get checkAnswerButton(): Locator {
    return this.page.getByRole('button', { name: 'Check answer' });
  }

  async expectQuestion(current: number, total: number): Promise<void> {
    await expect(this.positionLabel).toHaveText(`Question ${current} / ${total}`);
  }

  /** Answers the question on screen; asserts the right/wrong feedback. */
  async answerCurrentQuestion(correctly: boolean): Promise<void> {
    await expect(this.options.first()).toBeVisible();
    const isMultipleChoice = await this.checkAnswerButton.isVisible();

    if (isMultipleChoice) {
      if (correctly) {
        for (const option of await this.options
          .filter({ hasText: CORRECT_PREFIX })
          .all()) {
          await option.click();
        }
      } else {
        await this.options.filter({ hasText: WRONG_PREFIX }).first().click();
      }
      await this.checkAnswerButton.click();
    } else {
      const marker = correctly ? CORRECT_PREFIX : WRONG_PREFIX;
      await this.options.filter({ hasText: marker }).first().click();
    }

    await this.expectFeedback(correctly);
  }

  async expectFeedback(correct: boolean): Promise<void> {
    const feedback = this.page.locator(correct ? '.feedback.correct' : '.feedback.wrong');
    await expect(feedback).toContainText(correct ? 'Correct' : 'Incorrect');
  }

  /** The correct answer is highlighted after answering (review mode). */
  async expectSolutionHighlighted(): Promise<void> {
    await expect(
      this.options.filter({ hasText: CORRECT_PREFIX }).first(),
    ).toHaveClass(/correct/);
  }

  async next(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next' }).click();
  }

  async finish(): Promise<void> {
    await this.page.getByRole('button', { name: 'Finish' }).click();
  }

  /**
   * Answers every remaining question and finishes the session.
   * The first `wrongAnswers` questions are answered incorrectly.
   */
  async completeSession(
    total: number,
    options: { startAt?: number; wrongAnswers?: number } = {},
  ): Promise<void> {
    const startAt = options.startAt ?? 1;
    const wrongAnswers = options.wrongAnswers ?? 0;

    for (let current = startAt; current <= total; current++) {
      await this.expectQuestion(current, total);
      await this.answerCurrentQuestion(current - startAt >= wrongAnswers);
      if (current < total) {
        await this.next();
      } else {
        await this.finish();
      }
    }
  }

  async expectSummary(correct: number, total: number): Promise<void> {
    await expect(
      this.page.getByRole('heading', { name: 'Session complete' }),
    ).toBeVisible();
    await expect(this.page.locator('.score')).toContainText(
      `${correct} / ${total} correct`,
    );
    await expect(this.page.locator('.accuracy')).toContainText(
      `${Math.round((correct / total) * 100)}% accuracy`,
    );
  }

  /** Exits via the Exit button and confirms the dialog. */
  async exitSession(): Promise<void> {
    await this.page.getByRole('button', { name: 'Exit' }).click();
    const dialog = this.page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Exit session?' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Exit' }).click();
  }
}

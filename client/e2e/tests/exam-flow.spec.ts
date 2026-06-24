import {
  ALLOCATION_SOLUTION,
  allocationExamSpec,
  EXPLANATION_MARKER,
  SECTION_CRYPTOGRAPHY,
  smallExamSpec,
  twoSectionExamSpec,
  uniqueName,
} from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/dashboard-page';
import { ExamDetailPage } from '../src/pages/exam-detail-page';
import { QuizPage } from '../src/pages/quiz-page';

test.describe('exam mode', () => {
  test('runs a full session and answers everything correctly', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);

    await detail.expectLoaded(name);
    await expect(page.getByText('1 modules · 3 questions')).toBeVisible();
    await expect(page.getByText('Core Concepts')).toBeVisible();

    await detail.startExamMode('all');
    await quiz.completeSession(3);

    await quiz.expectSummary(3, 3);

    await page.getByRole('button', { name: 'Back to exam' }).click();
    await detail.expectLoaded(name);
  });

  test('reveals the solution on a wrong answer and tracks the score', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('all');

    // First question: answer deliberately wrong, the solution gets highlighted.
    await quiz.expectQuestion(1, 3);
    await quiz.answerCurrentQuestion(false);
    await quiz.expectSolutionHighlighted();
    await quiz.next();

    // Answer the rest correctly and finish.
    await quiz.completeSession(3, { startAt: 2 });
    await quiz.expectSummary(2, 3);

    // The learning progress page reflects the attempt.
    await page.getByRole('button', { name: 'Dashboard' }).click();
    await dashboard.openLearningProgress(name);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('Learning progress')).toBeVisible();
    await expect(page.getByText('3 / 3 questions seen')).toBeVisible();
    await expect(page.getByText('2 / 3 answered correctly')).toBeVisible();
    await expect(page.getByText('2 / 3 attempts correct')).toBeVisible();
  });

  test('reveals the question explanation only after answering', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('all');

    // Hidden while the question is unanswered, shown once it is answered.
    await quiz.expectQuestion(1, 3);
    await quiz.expectNoExplanation();
    await quiz.answerCurrentQuestion(true);
    await quiz.expectExplanation(EXPLANATION_MARKER);
  });

  test('practises a single module via the session setup dialog', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(twoSectionExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('by-section', { sectionName: SECTION_CRYPTOGRAPHY });

    // The cryptography module has 2 of the 5 questions.
    await quiz.expectQuestion(1, 2);

    await quiz.exitSession();
    await detail.expectLoaded(name);
  });

  test('sorts an allocation question into baskets via drag and drop', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(allocationExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);

    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('all');

    await quiz.expectQuestion(1, 1);
    await quiz.answerAllocation(ALLOCATION_SOLUTION);
    await quiz.expectFeedback(true);

    await quiz.finish();
    await quiz.expectSummary(1, 1);
  });
});

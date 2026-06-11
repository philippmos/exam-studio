import { smallExamSpec, uniqueName } from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { DashboardPage } from '../src/pages/dashboard-page';
import { ExamDetailPage } from '../src/pages/exam-detail-page';
import { QuizPage } from '../src/pages/quiz-page';
import { SessionsPage } from '../src/pages/sessions-page';

test.describe('session management', () => {
  test('a session can be exited, resumed and finally deleted', async ({
    page,
    examFactory,
  }) => {
    const name = uniqueName();
    await examFactory.create(smallExamSpec(name));

    const dashboard = new DashboardPage(page);
    const detail = new ExamDetailPage(page);
    const quiz = new QuizPage(page);
    const sessions = new SessionsPage(page);

    // Start a session and answer the first of three questions.
    await dashboard.goto();
    await dashboard.openExam(name);
    await detail.startExamMode('all');
    await quiz.expectQuestion(1, 3);
    await quiz.answerCurrentQuestion(true);

    // Exit — answers are persisted.
    await quiz.exitSession();
    await detail.expectLoaded(name);

    // The session shows up as "in progress" with its answer count.
    await sessions.goto();
    const card = sessions.sessionCard(name);
    await expect(card).toBeVisible();
    await expect(card).toContainText('All questions');
    await expect(card).toContainText('1 / 3 answered');

    // Resuming jumps to the first unanswered question.
    await sessions.continueSession(name);
    await quiz.expectQuestion(2, 3);

    // Finish the rest and check the summary.
    await quiz.completeSession(3, { startAt: 2 });
    await quiz.expectSummary(3, 3);

    // Now the session is listed as completed with its result …
    await sessions.goto();
    await expect(card).toContainText('3 / 3 correct');
    await expect(card.getByRole('button', { name: 'Review' })).toBeVisible();

    // … and can be deleted after confirmation.
    await sessions.deleteSession(name);
    await expect(page.getByText('Session deleted.')).toBeVisible();
    await expect(sessions.sessionCard(name)).toBeHidden();
  });
});

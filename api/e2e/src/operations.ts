import { GraphqlClient } from './graphql-client';
import {
  AddQuestionsResult,
  Allocation,
  AnswerResult,
  Exam,
  ExamSession,
  ExamStats,
  GoalPeriod,
  ReviewDue,
  SessionItem,
  SessionMode,
  SessionOverview,
  StudyDayStats,
  StudyGoalProgress,
  StudyGoalSource,
  StudyStreak,
  SuggestedStudyGoal,
} from './types';

/** Typed wrappers around the GraphQL operations used by the tests. */

export const EXAM_FIELDS = `
  id
  name
  issuer
  createdAt
  questionCount
  studyGoal {
    period
    target
    source
  }
  archived
  sections {
    id
    name
    position
    questionCount
  }
`;

export const SESSION_FIELDS = `
  id
  examId
  mode
  sectionId
  createdAt
  finishedAt
  total
  answered
  correct
  items {
    id
    position
    selectedAnswerIds
    selectedAllocations {
      answerId
      categoryId
    }
    selectedPlacements {
      answerId
      position
    }
    correctAnswerIds
    correctAllocations {
      answerId
      categoryId
    }
    correctPlacements {
      answerId
      position
    }
    isCorrect
    answeredAt
    question {
      id
      text
      explanation
      sectionId
      questionType
      answers {
        id
        text
        position
        selectboxId
      }
      categories {
        id
        key
        label
        position
      }
    }
  }
`;

const SESSION_OVERVIEW_FIELDS = `
  id
  examId
  examName
  mode
  sectionId
  sectionName
  createdAt
  finishedAt
  total
  answered
  correct
`;

const EXAM_STATS_FIELDS = `
  examId
  examName
  totalQuestions
  attemptedQuestions
  masteredQuestions
  strugglingQuestions
  unattemptedQuestions
  totalAttempts
  correctAttempts
  incorrectAttempts
  accuracy
  coverage
  mastery
  sessionsCount
  lastActivity
  sections {
    sectionId
    name
    totalQuestions
    attemptedQuestions
    masteredQuestions
    strugglingQuestions
    correctAttempts
    incorrectAttempts
    accuracy
    mastery
  }
`;

export async function importExam(gql: GraphqlClient, payload: string): Promise<Exam> {
  const data = await gql.query<{ importExam: Exam }>(
    `mutation Import($payload: String!) { importExam(payload: $payload) { ${EXAM_FIELDS} } }`,
    { payload },
  );
  return data.importExam;
}

export async function addExamQuestions(
  gql: GraphqlClient,
  examId: string,
  payload: string,
): Promise<AddQuestionsResult> {
  const data = await gql.query<{ addExamQuestions: AddQuestionsResult }>(
    `mutation AddQuestions($examId: UUID!, $payload: String!) {
      addExamQuestions(examId: $examId, payload: $payload) {
        exam { ${EXAM_FIELDS} }
        added
        skipped
      }
    }`,
    { examId, payload },
  );
  return data.addExamQuestions;
}

export async function deleteExam(gql: GraphqlClient, id: string): Promise<boolean> {
  const data = await gql.query<{ deleteExam: boolean }>(
    `mutation Delete($id: UUID!) { deleteExam(id: $id) }`,
    { id },
  );
  return data.deleteExam;
}

export async function getExams(gql: GraphqlClient): Promise<Exam[]> {
  const data = await gql.query<{ exams: Exam[] }>(
    `query Exams { exams { ${EXAM_FIELDS} } }`,
  );
  return data.exams;
}

export async function getExam(gql: GraphqlClient, id: string): Promise<Exam | null> {
  const data = await gql.query<{ exam: Exam | null }>(
    `query Exam($id: UUID!) { exam(id: $id) { ${EXAM_FIELDS} } }`,
    { id },
  );
  return data.exam;
}

export async function getArchivedExams(gql: GraphqlClient): Promise<Exam[]> {
  const data = await gql.query<{ archivedExams: Exam[] }>(
    `query ArchivedExams { archivedExams { ${EXAM_FIELDS} } }`,
  );
  return data.archivedExams;
}

export async function setExamArchived(
  gql: GraphqlClient,
  examId: string,
  archived: boolean,
): Promise<Exam> {
  const data = await gql.query<{ setExamArchived: Exam }>(
    `mutation SetArchived($examId: UUID!, $archived: Boolean!) {
      setExamArchived(examId: $examId, archived: $archived) { ${EXAM_FIELDS} }
    }`,
    { examId, archived },
  );
  return data.setExamArchived;
}

export async function startSession(
  gql: GraphqlClient,
  examId: string,
  mode: SessionMode,
  sectionId: string | null = null,
): Promise<ExamSession> {
  const data = await gql.query<{ startSession: ExamSession }>(
    `mutation Start($examId: UUID!, $mode: SessionMode!, $sectionId: UUID) {
      startSession(examId: $examId, mode: $mode, sectionId: $sectionId) { ${SESSION_FIELDS} }
    }`,
    { examId, mode, sectionId },
  );
  return data.startSession;
}

export async function getSession(
  gql: GraphqlClient,
  id: string,
): Promise<ExamSession | null> {
  const data = await gql.query<{ session: ExamSession | null }>(
    `query Session($id: UUID!) { session(id: $id) { ${SESSION_FIELDS} } }`,
    { id },
  );
  return data.session;
}

export async function getSessions(
  gql: GraphqlClient,
  examId: string | null = null,
): Promise<SessionOverview[]> {
  const data = await gql.query<{ sessions: SessionOverview[] }>(
    `query Sessions($examId: UUID) { sessions(examId: $examId) { ${SESSION_OVERVIEW_FIELDS} } }`,
    { examId },
  );
  return data.sessions;
}

const SUBMIT_RESULT_FIELDS = `
  sessionItemId
  isCorrect
  correctAnswerIds
  correctAllocations {
    answerId
    categoryId
  }
  correctPlacements {
    answerId
    position
  }
  reviewBox
  reviewIntervalDays
`;

export async function submitAnswer(
  gql: GraphqlClient,
  sessionItemId: string,
  selectedAnswerIds: string[],
  tzOffsetMinutes = 0,
): Promise<AnswerResult> {
  const data = await gql.query<{ submitAnswer: AnswerResult }>(
    `mutation Submit(
      $sessionItemId: UUID!
      $selectedAnswerIds: [UUID!]
      $tzOffsetMinutes: Int!
    ) {
      submitAnswer(
        sessionItemId: $sessionItemId
        selectedAnswerIds: $selectedAnswerIds
        tzOffsetMinutes: $tzOffsetMinutes
      ) { ${SUBMIT_RESULT_FIELDS} }
    }`,
    { sessionItemId, selectedAnswerIds, tzOffsetMinutes },
  );
  return data.submitAnswer;
}

export async function submitAllocation(
  gql: GraphqlClient,
  sessionItemId: string,
  allocations: Allocation[],
  tzOffsetMinutes = 0,
): Promise<AnswerResult> {
  const data = await gql.query<{ submitAnswer: AnswerResult }>(
    `mutation Submit(
      $sessionItemId: UUID!
      $allocations: [AllocationInput!]
      $tzOffsetMinutes: Int!
    ) {
      submitAnswer(
        sessionItemId: $sessionItemId
        allocations: $allocations
        tzOffsetMinutes: $tzOffsetMinutes
      ) { ${SUBMIT_RESULT_FIELDS} }
    }`,
    { sessionItemId, allocations, tzOffsetMinutes },
  );
  return data.submitAnswer;
}

export async function submitPlacement(
  gql: GraphqlClient,
  sessionItemId: string,
  placedAnswerIds: string[],
  tzOffsetMinutes = 0,
): Promise<AnswerResult> {
  const data = await gql.query<{ submitAnswer: AnswerResult }>(
    `mutation Submit(
      $sessionItemId: UUID!
      $placedAnswerIds: [UUID!]
      $tzOffsetMinutes: Int!
    ) {
      submitAnswer(
        sessionItemId: $sessionItemId
        placedAnswerIds: $placedAnswerIds
        tzOffsetMinutes: $tzOffsetMinutes
      ) { ${SUBMIT_RESULT_FIELDS} }
    }`,
    { sessionItemId, placedAnswerIds, tzOffsetMinutes },
  );
  return data.submitAnswer;
}

export async function getStudyStreak(
  gql: GraphqlClient,
  tzOffsetMinutes = 0,
): Promise<StudyStreak> {
  const data = await gql.query<{ studyStreak: StudyStreak }>(
    `query Streak($tzOffsetMinutes: Int!) {
      studyStreak(tzOffsetMinutes: $tzOffsetMinutes) {
        current
        longest
        studiedToday
        recentDays { day active }
      }
    }`,
    { tzOffsetMinutes },
  );
  return data.studyStreak;
}

export async function getReviewDue(
  gql: GraphqlClient,
  examId: string | null = null,
): Promise<ReviewDue[]> {
  const data = await gql.query<{ reviewDue: ReviewDue[] }>(
    `query ReviewDue($examId: UUID) {
      reviewDue(examId: $examId) { examId dueCount }
    }`,
    { examId },
  );
  return data.reviewDue;
}

export async function finishSession(
  gql: GraphqlClient,
  id: string,
): Promise<ExamSession> {
  const data = await gql.query<{ finishSession: ExamSession }>(
    `mutation Finish($id: UUID!) { finishSession(id: $id) { ${SESSION_FIELDS} } }`,
    { id },
  );
  return data.finishSession;
}

export async function deleteSession(gql: GraphqlClient, id: string): Promise<boolean> {
  const data = await gql.query<{ deleteSession: boolean }>(
    `mutation DeleteSession($id: UUID!) { deleteSession(id: $id) }`,
    { id },
  );
  return data.deleteSession;
}

export async function getExamStats(
  gql: GraphqlClient,
  examId: string,
): Promise<ExamStats | null> {
  const data = await gql.query<{ examStats: ExamStats | null }>(
    `query Stats($examId: UUID!) { examStats(examId: $examId) { ${EXAM_STATS_FIELDS} } }`,
    { examId },
  );
  return data.examStats;
}

export async function getStudyHistory(
  gql: GraphqlClient,
  examId: string | null = null,
  tzOffsetMinutes = 0,
): Promise<StudyDayStats[]> {
  const data = await gql.query<{ studyHistory: StudyDayStats[] }>(
    `query StudyHistory($examId: UUID, $tzOffsetMinutes: Int!) {
      studyHistory(examId: $examId, tzOffsetMinutes: $tzOffsetMinutes) {
        day
        total
        correct
        incorrect
      }
    }`,
    { examId, tzOffsetMinutes },
  );
  return data.studyHistory;
}

export async function setStudyGoal(
  gql: GraphqlClient,
  examId: string,
  period: GoalPeriod,
  target: number,
  source: StudyGoalSource = 'MANUAL',
): Promise<Exam> {
  const data = await gql.query<{ setStudyGoal: Exam }>(
    `mutation SetGoal(
      $examId: UUID!
      $period: GoalPeriod!
      $target: Int!
      $source: StudyGoalSource!
    ) {
      setStudyGoal(
        examId: $examId
        period: $period
        target: $target
        source: $source
      ) { ${EXAM_FIELDS} }
    }`,
    { examId, period, target, source },
  );
  return data.setStudyGoal;
}

export async function setCertificationExamDate(
  gql: GraphqlClient,
  examId: string,
  examAt: string,
): Promise<Exam> {
  const data = await gql.query<{ setCertificationExamDate: Exam }>(
    `mutation SetExamDate($examId: UUID!, $examAt: DateTime!) {
      setCertificationExamDate(examId: $examId, examAt: $examAt) { ${EXAM_FIELDS} }
    }`,
    { examId, examAt },
  );
  return data.setCertificationExamDate;
}

export async function clearCertificationExamDate(
  gql: GraphqlClient,
  examId: string,
): Promise<Exam> {
  const data = await gql.query<{ clearCertificationExamDate: Exam }>(
    `mutation ClearExamDate($examId: UUID!) {
      clearCertificationExamDate(examId: $examId) { ${EXAM_FIELDS} }
    }`,
    { examId },
  );
  return data.clearCertificationExamDate;
}

export async function getSuggestedStudyGoal(
  gql: GraphqlClient,
  examId: string,
  period: GoalPeriod = 'DAILY',
  examAt: string | null = null,
): Promise<SuggestedStudyGoal | null> {
  const data = await gql.query<{ suggestedStudyGoal: SuggestedStudyGoal | null }>(
    `query Suggest($examId: UUID!, $period: GoalPeriod!, $examAt: DateTime) {
      suggestedStudyGoal(examId: $examId, period: $period, examAt: $examAt) {
        period
        target
        questionCount
        repetitionFactor
        daysUntilExam
        usableDays
      }
    }`,
    { examId, period, examAt },
  );
  return data.suggestedStudyGoal;
}

export async function clearStudyGoal(
  gql: GraphqlClient,
  examId: string,
): Promise<Exam> {
  const data = await gql.query<{ clearStudyGoal: Exam }>(
    `mutation ClearGoal($examId: UUID!) {
      clearStudyGoal(examId: $examId) { ${EXAM_FIELDS} }
    }`,
    { examId },
  );
  return data.clearStudyGoal;
}

export async function getStudyGoalProgress(
  gql: GraphqlClient,
  examId: string | null = null,
  tzOffsetMinutes = 0,
): Promise<StudyGoalProgress[]> {
  const data = await gql.query<{ studyGoalProgress: StudyGoalProgress[] }>(
    `query GoalProgress($examId: UUID, $tzOffsetMinutes: Int!) {
      studyGoalProgress(examId: $examId, tzOffsetMinutes: $tzOffsetMinutes) {
        examId
        period
        target
        answered
        periodStart
      }
    }`,
    { examId, tzOffsetMinutes },
  );
  return data.studyGoalProgress;
}

/** Ids of the answers marked as correct via the text convention (CORRECT_PREFIX). */
export function correctAnswerIdsOf(item: SessionItem): string[] {
  return item.question.answers
    .filter((answer) => answer.text.startsWith('Correct:'))
    .map((answer) => answer.id);
}

/** Id of one wrong answer of the item's question. */
export function wrongAnswerIdOf(item: SessionItem): string {
  const wrongAnswer = item.question.answers.find(
    (answer) => !answer.text.startsWith('Correct:'),
  );
  if (!wrongAnswer) {
    throw new Error(`Question "${item.question.text}" has no wrong answer.`);
  }
  return wrongAnswer.id;
}

function categoryIdByKey(item: SessionItem): Map<string, string> {
  return new Map(item.question.categories.map((c) => [c.key, c.id]));
}

/**
 * The fully correct placement of an allocation item, reconstructed from a
 * "item text -> category key" solution (the API hides the solution itself).
 */
export function correctAllocationsOf(
  item: SessionItem,
  solution: Record<string, string>,
): Allocation[] {
  const byKey = categoryIdByKey(item);
  return item.question.answers.map((answer) => ({
    answerId: answer.id,
    categoryId: byKey.get(solution[answer.text])!,
  }));
}

/** The correct placement, but with the first item moved into a wrong basket. */
export function withOneMisplaced(
  item: SessionItem,
  solution: Record<string, string>,
): Allocation[] {
  const allocations = correctAllocationsOf(item, solution);
  const firstItem = item.question.answers[0];
  const wrongCategory = item.question.categories.find(
    (c) => c.key !== solution[firstItem.text],
  )!;
  return allocations.map((alloc) =>
    alloc.answerId === firstItem.id
      ? { ...alloc, categoryId: wrongCategory.id }
      : alloc,
  );
}

/**
 * The fully correct placed order (answer ids) of a select-and-place question,
 * reconstructed from an "item text -> 1-based rank" solution (undefined rank =
 * distractor, never placed). The API hides the solution itself.
 */
export function correctOrderOf(
  item: SessionItem,
  solution: Record<string, number | undefined>,
): string[] {
  return item.question.answers
    .filter((answer) => solution[answer.text] !== undefined)
    .sort((a, b) => solution[a.text]! - solution[b.text]!)
    .map((answer) => answer.id);
}

/** The correct order with the first two positions swapped (a wrong order). */
export function withFirstTwoSwapped(order: string[]): string[] {
  if (order.length < 2) {
    return [...order];
  }
  const swapped = [...order];
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  return swapped;
}

/**
 * The correct selectbox selection: every option marked with CORRECT_PREFIX.
 * Each selectbox has exactly one correct option, so this is one option per
 * selectbox — the full correct answer. (The API hides which option is correct.)
 */
export function correctSelectboxIdsOf(item: SessionItem): string[] {
  return correctAnswerIdsOf(item);
}

/**
 * The correct selectbox selection with one selectbox's option swapped for a
 * wrong option *in the same selectbox*, so it stays structurally valid (one
 * option per selectbox) but grades as incorrect.
 */
export function withOneSelectboxWrong(item: SessionItem): string[] {
  const correct = correctSelectboxIdsOf(item);
  const firstCorrect = item.question.answers.find((a) => a.id === correct[0])!;
  const wrongInSameBox = item.question.answers.find(
    (a) =>
      a.selectboxId === firstCorrect.selectboxId &&
      !a.text.startsWith('Correct:'),
  )!;
  return correct.map((id) => (id === firstCorrect.id ? wrongInSameBox.id : id));
}

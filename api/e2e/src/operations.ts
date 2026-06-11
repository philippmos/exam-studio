import { GraphqlClient } from './graphql-client';
import {
  AnswerResult,
  Exam,
  ExamSession,
  ExamStats,
  GoalPeriod,
  SessionItem,
  SessionMode,
  SessionOverview,
  StudyDayStats,
  StudyGoalProgress,
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
  }
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
    correctAnswerIds
    isCorrect
    answeredAt
    question {
      id
      text
      sectionId
      questionType
      answers {
        id
        text
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

export async function submitAnswer(
  gql: GraphqlClient,
  sessionItemId: string,
  selectedAnswerIds: string[],
): Promise<AnswerResult> {
  const data = await gql.query<{ submitAnswer: AnswerResult }>(
    `mutation Submit($sessionItemId: UUID!, $selectedAnswerIds: [UUID!]!) {
      submitAnswer(sessionItemId: $sessionItemId, selectedAnswerIds: $selectedAnswerIds) {
        sessionItemId
        isCorrect
        correctAnswerIds
      }
    }`,
    { sessionItemId, selectedAnswerIds },
  );
  return data.submitAnswer;
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
): Promise<Exam> {
  const data = await gql.query<{ setStudyGoal: Exam }>(
    `mutation SetGoal($examId: UUID!, $period: GoalPeriod!, $target: Int!) {
      setStudyGoal(examId: $examId, period: $period, target: $target) { ${EXAM_FIELDS} }
    }`,
    { examId, period, target },
  );
  return data.setStudyGoal;
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

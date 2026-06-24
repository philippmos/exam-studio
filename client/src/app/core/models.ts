export interface Answer {
  id: string;
  text: string;
  position: number;
}

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';

export interface Question {
  id: string;
  text: string;
  sectionId: string;
  questionType: QuestionType;
  answers: Answer[];
}

export interface Section {
  id: string;
  name: string;
  position: number;
  questionCount: number;
}

export type GoalPeriod = 'DAILY' | 'WEEKLY';

/** Per-exam study goal: answer `target` questions per `period`. */
export interface StudyGoal {
  period: GoalPeriod;
  target: number;
}

/** Progress of one exam's study goal within the current period. */
export interface StudyGoalProgress {
  examId: string;
  period: GoalPeriod;
  target: number;
  answered: number;
  periodStart: string; // ISO date the current period began on
}

export interface Exam {
  id: string;
  name: string;
  issuer: string | null;
  createdAt: string;
  questionCount: number;
  studyGoal: StudyGoal | null;
  sections: Section[];
}

export type SessionMode =
  | 'ALL_RANDOM'
  | 'BY_SECTION'
  | 'UNANSWERED'
  | 'DUE_REVIEW';

/** Questions of one exam currently due for spaced-repetition review. */
export interface ReviewDue {
  examId: string;
  dueCount: number;
}

export interface SessionItem {
  id: string;
  position: number;
  question: Question;
  selectedAnswerIds: string[];
  correctAnswerIds: string[] | null;
  isCorrect: boolean | null;
  answeredAt: string | null;
}

export interface ExamSession {
  id: string;
  examId: string;
  mode: SessionMode;
  sectionId: string | null;
  createdAt: string;
  finishedAt: string | null;
  total: number;
  answered: number;
  correct: number;
  items: SessionItem[];
}

export interface SessionOverview {
  id: string;
  examId: string;
  examName: string;
  mode: SessionMode;
  sectionId: string | null;
  sectionName: string | null;
  createdAt: string;
  finishedAt: string | null;
  total: number;
  answered: number;
  correct: number;
}

export interface AnswerResult {
  sessionItemId: string;
  isCorrect: boolean;
  correctAnswerIds: string[];
  /** Leitner box the question landed in after this answer. */
  reviewBox: number;
  /** Days until the question is due for review again. */
  reviewIntervalDays: number;
}

/** Result of the session-setup dialog. */
export interface SessionSetup {
  mode: SessionMode;
  sectionId: string | null;
}

/** Questions answered on one calendar day (study-history chart data). */
export interface StudyDayStats {
  day: string; // ISO date, e.g. "2026-06-11"
  total: number;
  correct: number;
  incorrect: number;
}

export interface SectionStats {
  sectionId: string;
  name: string;
  totalQuestions: number;
  attemptedQuestions: number;
  masteredQuestions: number;
  strugglingQuestions: number;
  correctAttempts: number;
  incorrectAttempts: number;
  accuracy: number;
  mastery: number;
}

export interface ExamStats {
  examId: string;
  examName: string;
  totalQuestions: number;
  attemptedQuestions: number;
  masteredQuestions: number;
  strugglingQuestions: number;
  unattemptedQuestions: number;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  accuracy: number;
  coverage: number;
  mastery: number;
  sessionsCount: number;
  lastActivity: string | null;
  sections: SectionStats[];
}

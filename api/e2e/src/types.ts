/** Response shapes of the GraphQL schema, as consumed by the tests. */

export interface Section {
  id: string;
  name: string;
  position: number;
  questionCount: number;
}

export type GoalPeriod = 'DAILY' | 'WEEKLY';

/** Whether a study goal was typed by hand or derived from the exam date. */
export type StudyGoalSource = 'MANUAL' | 'AUTO';

/** Per-exam study goal: answer `target` questions per `period`. */
export interface StudyGoal {
  period: GoalPeriod;
  target: number;
  source: StudyGoalSource;
}

/** A study goal proposed from the certification exam date. */
export interface SuggestedStudyGoal {
  period: GoalPeriod;
  target: number;
  questionCount: number;
  repetitionFactor: number;
  daysUntilExam: number;
  usableDays: number;
}

export interface Exam {
  id: string;
  name: string;
  issuer: string | null;
  createdAt: string;
  questionCount: number;
  studyGoal: StudyGoal | null;
  /** Archived exams are hidden from the dashboard and cannot start sessions. */
  archived: boolean;
  sections: Section[];
}

/** Progress of one exam's study goal within the current period. */
export interface StudyGoalProgress {
  examId: string;
  period: GoalPeriod;
  target: number;
  answered: number;
  periodStart: string; // ISO date, e.g. "2026-06-11"
}

/** One day of the streak's recent-activity strip. */
export interface StreakDay {
  day: string; // ISO date, e.g. "2026-06-25"
  active: boolean;
}

/** Consecutive-day study streak across all exams. */
export interface StudyStreak {
  current: number;
  longest: number;
  studiedToday: boolean;
  recentDays: StreakDay[];
}

export interface Answer {
  id: string;
  text: string;
  position: number;
}

export interface Category {
  id: string;
  key: string;
  label: string;
  position: number;
}

export interface Allocation {
  answerId: string;
  categoryId: string;
}

export interface Question {
  id: string;
  text: string;
  explanation: string | null;
  sectionId: string;
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'ALLOCATION';
  answers: Answer[];
  categories: Category[];
}

export interface SessionItem {
  id: string;
  position: number;
  selectedAnswerIds: string[];
  selectedAllocations: Allocation[];
  correctAnswerIds: string[] | null;
  correctAllocations: Allocation[] | null;
  isCorrect: boolean | null;
  answeredAt: string | null;
  question: Question;
}

export type SessionMode =
  | 'ALL_RANDOM'
  | 'BY_SECTION'
  | 'UNANSWERED'
  | 'DUE_REVIEW';

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
  correctAllocations: Allocation[];
  reviewBox: number;
  reviewIntervalDays: number;
}

/** Questions of one exam currently due for spaced-repetition review. */
export interface ReviewDue {
  examId: string;
  dueCount: number;
}

/** Questions answered on one calendar day. */
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

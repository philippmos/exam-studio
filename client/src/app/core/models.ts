export interface Answer {
  id: string;
  text: string;
  position: number;
}

/** A target basket of an allocation question. */
export interface Category {
  id: string;
  key: string;
  label: string;
  position: number;
}

/** One item (answer) sorted into a category — a single drag-and-drop placement. */
export interface Allocation {
  answerId: string;
  categoryId: string;
}

export type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'ALLOCATION';

export interface Question {
  id: string;
  text: string;
  /** Description of the question/answer, shown once answered; null if none. */
  explanation: string | null;
  sectionId: string;
  questionType: QuestionType;
  /** Choice options, or the items to sort for an allocation question. */
  answers: Answer[];
  /** Baskets for an allocation question; empty for choice questions. */
  categories: Category[];
}

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

/**
 * A study goal proposed from the certification exam date. `target` is the
 * per-`period` number to aim for; the rest explains how it was derived.
 */
export interface SuggestedStudyGoal {
  period: GoalPeriod;
  target: number;
  questionCount: number;
  repetitionFactor: number;
  daysUntilExam: number;
  usableDays: number;
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
  /** When the user sits the real certification exam; null if not scheduled. */
  certificationExamAt: string | null;
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
  /** The user's allocation placements (item -> basket); empty for choice. */
  selectedAllocations: Allocation[];
  correctAnswerIds: string[] | null;
  /** Solution of an allocation question; empty for choice, null until answered. */
  correctAllocations: Allocation[] | null;
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
  /** Solution of an allocation question (item -> basket); empty for choice. */
  correctAllocations: Allocation[];
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

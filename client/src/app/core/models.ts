export interface Answer {
  id: string;
  text: string;
  position: number;
}

export interface Question {
  id: string;
  number: number;
  text: string;
  sectionId: string;
  answers: Answer[];
}

export interface Section {
  id: string;
  name: string;
  position: number;
  questionCount: number;
}

export interface Exam {
  id: string;
  name: string;
  issuer: string | null;
  createdAt: string;
  questionCount: number;
  sections: Section[];
}

export type SessionMode = 'ALL_RANDOM' | 'BY_SECTION' | 'UNANSWERED';

export interface SessionItem {
  id: string;
  position: number;
  question: Question;
  selectedAnswerId: string | null;
  correctAnswerId: string | null;
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

export interface AnswerResult {
  sessionItemId: string;
  isCorrect: boolean;
  correctAnswerId: string;
}

/** Result of the session-setup dialog. */
export interface SessionSetup {
  mode: SessionMode;
  sectionId: string | null;
}

import { randomUUID } from 'node:crypto';

/**
 * Builders for exam import payloads (the `exam.json` document format).
 *
 * The GraphQL API intentionally never exposes which answer is correct
 * (AnswerType has no isCorrect field), so the tests encode correctness in
 * the answer *text*: every correct answer starts with CORRECT_PREFIX. Tests
 * use that marker to deliberately answer right or wrong.
 */

export const CORRECT_PREFIX = 'Correct:';
export const WRONG_PREFIX = 'Wrong:';

export interface AnswerSpec {
  text: string;
  is_correct?: boolean;
}

export interface CategorySpec {
  key: string;
  label: string;
}

export interface ItemSpec {
  text: string;
  correct_category: string;
}

export interface QuestionSpec {
  question: string;
  section_key: string;
  question_type?: 'single_choice' | 'multiple_choice' | 'allocation';
  // Choice questions carry answers; allocation questions carry categories + items.
  answers?: AnswerSpec[];
  categories?: CategorySpec[];
  items?: ItemSpec[];
  // Optional description of the question/answer, revealed once answered.
  explanation?: string;
}

export interface SectionSpec {
  key: string;
  name: string;
}

export interface ExamSpec {
  name: string;
  issuer?: string;
  sections: SectionSpec[];
  questions: QuestionSpec[];
}

/** Serialises an exam spec into the JSON string the importExam mutation expects. */
export function buildPayload(exam: ExamSpec): string {
  return JSON.stringify({ exam });
}

/** A unique exam name so parallel tests and repeated local runs never collide. */
export function uniqueName(prefix = 'API E2E Exam'): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function correct(text: string): AnswerSpec {
  return { text: `${CORRECT_PREFIX} ${text}`, is_correct: true };
}

function wrong(text: string): AnswerSpec {
  return { text: `${WRONG_PREFIX} ${text}` };
}

export const SECTION_NETWORKING = 'Networking';
export const SECTION_CRYPTOGRAPHY = 'Cryptography';

/**
 * The default test exam: 2 sections, 5 questions.
 *
 *   Networking   — 3 single-choice questions
 *   Cryptography — 1 single-choice + 1 multiple-choice (2 correct answers)
 */
export function defaultExamSpec(name: string): ExamSpec {
  return {
    name,
    issuer: 'Playwright Test Suite',
    sections: [
      { key: 'networking', name: SECTION_NETWORKING },
      { key: 'cryptography', name: SECTION_CRYPTOGRAPHY },
    ],
    questions: [
      {
        question: 'Which device forwards packets between different networks?',
        section_key: 'networking',
        question_type: 'single_choice',
        answers: [
          correct('A router'),
          wrong('A keyboard'),
          wrong('A monitor'),
          wrong('A power strip'),
        ],
      },
      {
        question: 'Which port does HTTPS use by default?',
        section_key: 'networking',
        question_type: 'single_choice',
        answers: [wrong('Port 21'), correct('Port 443'), wrong('Port 25')],
      },
      {
        question: 'Which protocol resolves hostnames to IP addresses?',
        section_key: 'networking',
        question_type: 'single_choice',
        answers: [wrong('DHCP'), wrong('SMTP'), correct('DNS')],
      },
      {
        question: 'Which of these is an asymmetric encryption algorithm?',
        section_key: 'cryptography',
        question_type: 'single_choice',
        answers: [correct('RSA'), wrong('AES'), wrong('SHA-256')],
      },
      {
        question: 'Which of the following are symmetric ciphers? (multiple answers)',
        section_key: 'cryptography',
        question_type: 'multiple_choice',
        answers: [
          correct('AES'),
          correct('ChaCha20'),
          wrong('MD5'),
          wrong('Base64'),
        ],
      },
    ],
  };
}

/**
 * The intended placement of the allocation question's items: item text ->
 * the category key it belongs to. The API never reveals the solution, so the
 * tests reconstruct the correct (and a deliberately wrong) placement from this.
 */
export const ALLOCATION_SOLUTION: Record<string, string> = {
  'Interfaces.': 'contained',
  'Responsibility.': 'contained',
  'Internal structure.': 'avoided',
  'Hints for the implementation.': 'avoided',
};

/** 1 section, 1 allocation question (sort 4 items into 2 baskets). */
export function allocationExamSpec(name: string): ExamSpec {
  return {
    name,
    issuer: 'Playwright Test Suite',
    sections: [{ key: 'architecture', name: 'Architecture' }],
    questions: [
      {
        question:
          'Which information should be contained in a black-box description ' +
          'and which should be avoided?',
        section_key: 'architecture',
        question_type: 'allocation',
        categories: [
          { key: 'contained', label: 'Contained' },
          { key: 'avoided', label: 'Avoided' },
        ],
        items: Object.entries(ALLOCATION_SOLUTION).map(
          ([text, correct_category]) => ({ text, correct_category }),
        ),
      },
    ],
  };
}

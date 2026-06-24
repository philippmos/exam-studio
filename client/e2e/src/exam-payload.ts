import { randomUUID } from 'node:crypto';

/**
 * Builders for exam import payloads (the `exam.json` document format).
 *
 * The app never shows which answer is correct before answering, so the tests
 * encode correctness in the answer *text*: correct answers start with
 * "Correct:", wrong ones with "Wrong:". The quiz page object uses these
 * markers to deliberately answer right or wrong — independent of the
 * question shuffle.
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
}

export interface ExamSpec {
  name: string;
  issuer?: string;
  sections: { key: string; name: string }[];
  questions: QuestionSpec[];
}

export function buildPayload(exam: ExamSpec): string {
  return JSON.stringify({ exam });
}

/** A unique exam name so parallel tests and repeated local runs never collide. */
export function uniqueName(prefix = 'UI E2E Exam'): string {
  return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function correct(text: string): AnswerSpec {
  return { text: `${CORRECT_PREFIX} ${text}`, is_correct: true };
}

function wrong(text: string): AnswerSpec {
  return { text: `${WRONG_PREFIX} ${text}` };
}

/** 1 section, 3 questions (2 single-choice + 1 multiple-choice). */
export function smallExamSpec(name: string): ExamSpec {
  return {
    name,
    issuer: 'Playwright UI Suite',
    sections: [{ key: 'core', name: 'Core Concepts' }],
    questions: [
      {
        question: 'Which HTTP status code signals "Not Found"?',
        section_key: 'core',
        question_type: 'single_choice',
        answers: [correct('404'), wrong('200'), wrong('500')],
      },
      {
        question: 'Which data format does the exam import use?',
        section_key: 'core',
        question_type: 'single_choice',
        answers: [wrong('XML'), correct('JSON'), wrong('CSV')],
      },
      {
        question: 'Which of the following are HTTP methods? (multiple answers)',
        section_key: 'core',
        question_type: 'multiple_choice',
        answers: [correct('GET'), correct('POST'), wrong('FETCH'), wrong('SEND')],
      },
    ],
  };
}

export const SECTION_NETWORKING = 'Networking';
export const SECTION_CRYPTOGRAPHY = 'Cryptography';

/** 2 sections (3 + 2 questions) — used to exercise the by-section mode. */
export function twoSectionExamSpec(name: string): ExamSpec {
  return {
    name,
    issuer: 'Playwright UI Suite',
    sections: [
      { key: 'networking', name: SECTION_NETWORKING },
      { key: 'cryptography', name: SECTION_CRYPTOGRAPHY },
    ],
    questions: [
      {
        question: 'Which device forwards packets between different networks?',
        section_key: 'networking',
        question_type: 'single_choice',
        answers: [correct('A router'), wrong('A keyboard'), wrong('A monitor')],
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
        answers: [correct('AES'), correct('ChaCha20'), wrong('MD5'), wrong('Base64')],
      },
    ],
  };
}

/**
 * The intended placement of the allocation question's items: item text ->
 * the category label it belongs to. The quiz page object drives the drag &
 * drop from this and asserts the result.
 */
export const ALLOCATION_SOLUTION: Record<string, string> = {
  'Interfaces.': 'Contained',
  'Responsibility.': 'Contained',
  'Internal structure.': 'Avoided',
  'Hints for the implementation.': 'Avoided',
};

/** 1 section, 1 allocation question (sort 4 items into 2 baskets). */
export function allocationExamSpec(name: string): ExamSpec {
  return {
    name,
    issuer: 'Playwright UI Suite',
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
        items: [
          { text: 'Interfaces.', correct_category: 'contained' },
          { text: 'Responsibility.', correct_category: 'contained' },
          { text: 'Internal structure.', correct_category: 'avoided' },
          { text: 'Hints for the implementation.', correct_category: 'avoided' },
        ],
      },
    ],
  };
}

import {
  buildPayload,
  defaultExamSpec,
  ExamSpec,
  QuestionSpec,
  SECTION_CRYPTOGRAPHY,
  SECTION_NETWORKING,
  uniqueName,
} from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { addExamQuestions, getExam, startSession } from '../src/operations';

const ADD_MUTATION = `
  mutation AddQuestions($examId: UUID!, $payload: String!) {
    addExamQuestions(examId: $examId, payload: $payload) {
      exam { id }
      added
      skipped
    }
  }
`;

/** A single-choice question with one correct answer, for building uploads. */
function question(text: string, sectionKey: string): QuestionSpec {
  return {
    question: text,
    section_key: sectionKey,
    question_type: 'single_choice',
    answers: [
      { text: 'Right', is_correct: true },
      { text: 'Wrong A' },
      { text: 'Wrong B' },
    ],
  };
}

/** The default exam's two sections, reused so uploads match by name. */
function sectionsOfDefault(): ExamSpec['sections'] {
  return [
    { key: 'networking', name: SECTION_NETWORKING },
    { key: 'cryptography', name: SECTION_CRYPTOGRAPHY },
  ];
}

test.describe('addExamQuestions', () => {
  test('adds only new questions and skips the ones already present', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);
    expect(exam.questionCount).toBe(5);

    // Upload: one question that already exists (verbatim) plus two new ones.
    const upload: ExamSpec = {
      name: spec.name,
      sections: sectionsOfDefault(),
      questions: [
        spec.questions[0], // duplicate of an existing question
        question('Which layer does TCP operate at?', 'networking'),
        question('What does a hash function produce?', 'cryptography'),
      ],
    };

    const result = await addExamQuestions(gql, exam.id, buildPayload(upload));

    expect(result.added).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.exam.questionCount).toBe(7);
    // The two new questions land in their (existing) modules.
    expect(result.exam.sections.map((s) => s.questionCount)).toEqual([4, 3]);
  });

  test('skips duplicate questions within the same upload', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);

    const newText = 'Which command lists open network ports?';
    const upload: ExamSpec = {
      name: spec.name,
      sections: sectionsOfDefault(),
      questions: [question(newText, 'networking'), question(newText, 'networking')],
    };

    const result = await addExamQuestions(gql, exam.id, buildPayload(upload));

    // The first copy is added, the second (identical text) is skipped.
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.exam.questionCount).toBe(6);
  });

  test('re-uploading the original document adds nothing', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);

    const result = await addExamQuestions(gql, exam.id, buildPayload(spec));

    expect(result.added).toBe(0);
    expect(result.skipped).toBe(5);
    expect(result.exam.questionCount).toBe(5);
  });

  test('creates a new module for a question in a previously-unknown section', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);
    expect(exam.sections).toHaveLength(2);

    const upload: ExamSpec = {
      name: spec.name,
      sections: [...sectionsOfDefault(), { key: 'security', name: 'Security' }],
      questions: [question('What is a zero-day vulnerability?', 'security')],
    };

    const result = await addExamQuestions(gql, exam.id, buildPayload(upload));

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.exam.sections).toHaveLength(3);

    const security = result.exam.sections.find((s) => s.name === 'Security');
    expect(security).toBeTruthy();
    expect(security!.questionCount).toBe(1);
    // The new module is appended after the existing ones.
    expect(security!.position).toBe(2);
  });

  test('a newly added question is part of a session', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);

    const newText = 'Which protocol secures HTTP traffic?';
    const upload: ExamSpec = {
      name: spec.name,
      sections: sectionsOfDefault(),
      questions: [question(newText, 'networking')],
    };
    await addExamQuestions(gql, exam.id, buildPayload(upload));

    const session = await startSession(gql, exam.id, 'ALL_RANDOM');
    expect(session.total).toBe(6);
    expect(session.items.map((i) => i.question.text)).toContain(newText);
  });

  test('a rejected upload leaves the exam unchanged', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const exam = await examFactory.create(spec);

    const upload: ExamSpec = {
      name: spec.name,
      sections: sectionsOfDefault(),
      questions: [
        {
          question: 'This has a bogus type',
          section_key: 'networking',
          question_type: 'essay' as never,
          answers: [{ text: 'A', is_correct: true }],
        },
      ],
    };

    const message = await gql.expectError(ADD_MUTATION, {
      examId: exam.id,
      payload: buildPayload(upload),
    });
    expect(message).toContain("unknown question_type 'essay'");

    // Nothing was added: the count is still the original five.
    const after = await getExam(gql, exam.id);
    expect(after?.questionCount).toBe(5);
  });

  test('rejects adding questions to an exam that does not exist', async ({
    gql,
  }) => {
    const message = await gql.expectError(ADD_MUTATION, {
      examId: '00000000-0000-0000-0000-000000000000',
      payload: buildPayload(defaultExamSpec(uniqueName())),
    });
    expect(message).toContain('Exam not found.');
  });
});

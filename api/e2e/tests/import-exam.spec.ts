import {
  allocationExamSpec,
  buildPayload,
  defaultExamSpec,
  SECTION_CRYPTOGRAPHY,
  SECTION_NETWORKING,
  uniqueName,
} from '../src/exam-payload';
import { expect, test } from '../src/fixtures';
import { startSession } from '../src/operations';

const IMPORT_MUTATION = `
  mutation Import($payload: String!) {
    importExam(payload: $payload) { id name }
  }
`;

test.describe('importExam', () => {
  test('imports a valid exam document with sections and questions', async ({
    examFactory,
  }) => {
    const name = uniqueName();
    const exam = await examFactory.create(defaultExamSpec(name));

    expect(exam.id).toBeTruthy();
    expect(exam.name).toBe(name);
    expect(exam.issuer).toBe('Playwright Test Suite');
    expect(Date.parse(exam.createdAt)).not.toBeNaN();
    expect(exam.questionCount).toBe(5);

    // Sections come back ordered by their position in the document.
    expect(exam.sections.map((s) => s.name)).toEqual([
      SECTION_NETWORKING,
      SECTION_CRYPTOGRAPHY,
    ]);
    expect(exam.sections.map((s) => s.position)).toEqual([0, 1]);
    expect(exam.sections.map((s) => s.questionCount)).toEqual([3, 2]);
  });

  test('importing the same document twice creates two independent exams', async ({
    examFactory,
  }) => {
    const spec = defaultExamSpec(uniqueName());

    const first = await examFactory.create(spec);
    const second = await examFactory.create(spec);

    expect(first.id).not.toBe(second.id);
    expect(second.name).toBe(first.name);
    expect(second.questionCount).toBe(first.questionCount);
  });

  test('rejects a payload that is not valid JSON', async ({ gql }) => {
    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: 'this is not json{',
    });
    expect(message).toContain('Invalid JSON');
  });

  test('rejects a document without an exam object', async ({ gql }) => {
    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: JSON.stringify({ something: 'else' }),
    });
    expect(message).toContain("must contain an 'exam' object");
  });

  test('rejects an exam without a name', async ({ gql }) => {
    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: JSON.stringify({ exam: { sections: [], questions: [] } }),
    });
    expect(message).toContain("missing a 'name'");
  });

  test('rejects a section without key or name', async ({ gql }) => {
    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: JSON.stringify({
        exam: { name: uniqueName(), sections: [{ key: 'only-key' }], questions: [] },
      }),
    });
    expect(message).toContain("needs both 'key' and 'name'");
  });

  test('rejects a question referencing an unknown section', async ({ gql }) => {
    const spec = defaultExamSpec(uniqueName());
    spec.questions[0].section_key = 'does-not-exist';

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain("references unknown section 'does-not-exist'");
  });

  test('rejects a question without answers', async ({ gql }) => {
    const spec = defaultExamSpec(uniqueName());
    spec.questions[0].answers = [];

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain("non-empty 'answers' list");
  });

  test('rejects an unknown question type', async ({ gql }) => {
    const spec = defaultExamSpec(uniqueName());
    spec.questions[0].question_type = 'essay' as never;

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain("unknown question_type 'essay'");
  });

  test('rejects a single-choice question without exactly one correct answer', async ({
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    spec.questions[0].answers = [
      { text: 'A', is_correct: true },
      { text: 'B', is_correct: true },
      { text: 'C' },
    ];

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain('must have exactly one correct answer, found 2');
  });

  test('rejects a multiple-choice question without any correct answer', async ({
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const multipleChoice = spec.questions.find(
      (q) => q.question_type === 'multiple_choice',
    )!;
    multipleChoice.answers = [{ text: 'A' }, { text: 'B' }];

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain('must have at least one correct answer');
  });

  test('a rejected import does not create an exam', async ({ gql }) => {
    const name = uniqueName('Rejected Import');
    const spec = defaultExamSpec(name);
    spec.questions[0].section_key = 'does-not-exist';

    await gql.expectError(IMPORT_MUTATION, { payload: buildPayload(spec) });

    const data = await gql.query<{ exams: { name: string }[] }>(
      `query { exams { name } }`,
    );
    expect(data.exams.map((e) => e.name)).not.toContain(name);
  });

  test('imports and exposes an optional question explanation', async ({
    examFactory,
    gql,
  }) => {
    const spec = defaultExamSpec(uniqueName());
    const explained = spec.questions[0];
    explained.explanation =
      'A router operates at layer 3 and forwards packets between networks.';

    const exam = await examFactory.create(spec);
    const session = await startSession(gql, exam.id, 'ALL_RANDOM');

    // Questions are shuffled, so match them by text rather than position.
    const explainedItem = session.items.find(
      (i) => i.question.text === explained.question,
    )!;
    expect(explainedItem.question.explanation).toBe(explained.explanation);

    // A question imported without an explanation exposes null.
    const plainItem = session.items.find(
      (i) => i.question.text === spec.questions[1].question,
    )!;
    expect(plainItem.question.explanation).toBeNull();
  });

  test('imports an allocation question', async ({ examFactory }) => {
    const exam = await examFactory.create(allocationExamSpec(uniqueName()));

    expect(exam.questionCount).toBe(1);
    expect(exam.sections.map((s) => s.questionCount)).toEqual([1]);
  });

  test('rejects an allocation question without categories', async ({ gql }) => {
    const spec = allocationExamSpec(uniqueName());
    delete spec.questions[0].categories;

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain("needs a non-empty 'categories' list");
  });

  test('rejects an allocation question without items', async ({ gql }) => {
    const spec = allocationExamSpec(uniqueName());
    spec.questions[0].items = [];

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain("needs a non-empty 'items' list");
  });

  test('rejects an item referencing an unknown category', async ({ gql }) => {
    const spec = allocationExamSpec(uniqueName());
    spec.questions[0].items![0].correct_category = 'does-not-exist';

    const message = await gql.expectError(IMPORT_MUTATION, {
      payload: buildPayload(spec),
    });
    expect(message).toContain("references unknown category 'does-not-exist'");
  });
});

import { randomUUID } from 'node:crypto';

import { expect, test } from '../src/fixtures';
import { deleteExam, getExam, getExams } from '../src/operations';

test.describe('exam queries', () => {
  test('exams lists an imported exam for the dashboard', async ({
    gql,
    examFactory,
  }) => {
    const created = await examFactory.createDefault();

    const exams = await getExams(gql);
    const found = exams.find((exam) => exam.id === created.id);

    expect(found, 'imported exam should be part of the exams list').toBeDefined();
    expect(found!.name).toBe(created.name);
    expect(found!.questionCount).toBe(5);
    expect(found!.sections).toHaveLength(2);
  });

  test('exam returns a single exam by id', async ({ gql, examFactory }) => {
    const created = await examFactory.createDefault();

    const exam = await getExam(gql, created.id);

    expect(exam).not.toBeNull();
    expect(exam!.id).toBe(created.id);
    expect(exam!.sections.map((s) => s.questionCount)).toEqual([3, 2]);
  });

  test('exam returns null for an unknown id', async ({ gql }) => {
    const exam = await getExam(gql, randomUUID());
    expect(exam).toBeNull();
  });

  test('deleteExam removes the exam and reports success', async ({
    gql,
    examFactory,
  }) => {
    const created = await examFactory.createDefault();

    await expect(deleteExam(gql, created.id)).resolves.toBe(true);
    await expect(getExam(gql, created.id)).resolves.toBeNull();

    // Deleting it again is a no-op and reports false.
    await expect(deleteExam(gql, created.id)).resolves.toBe(false);
  });

  test('deleteExam returns false for an unknown id', async ({ gql }) => {
    await expect(deleteExam(gql, randomUUID())).resolves.toBe(false);
  });
});

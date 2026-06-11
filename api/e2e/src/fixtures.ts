import { test as base } from '@playwright/test';

import { buildPayload, defaultExamSpec, ExamSpec, uniqueName } from './exam-payload';
import { GraphqlClient } from './graphql-client';
import { importExam } from './operations';
import { Exam } from './types';

export interface ExamFactory {
  /** Imports an exam from a spec and registers it for cleanup. */
  create(spec: ExamSpec): Promise<Exam>;
  /** Imports the default 2-section/5-question exam under a unique name. */
  createDefault(): Promise<Exam>;
}

interface ApiFixtures {
  gql: GraphqlClient;
  examFactory: ExamFactory;
}

/**
 * Test fixtures for the API suite.
 *
 * `examFactory` keeps every test self-contained: each test imports its own
 * uniquely named exam and everything it created is deleted afterwards
 * (deleting an exam cascades to sections, questions and sessions), so tests
 * can run in parallel and repeatedly against the same database.
 */
export const test = base.extend<ApiFixtures>({
  gql: async ({ request }, use) => {
    await use(new GraphqlClient(request));
  },

  examFactory: async ({ gql }, use) => {
    const createdExamIds: string[] = [];

    const create = async (spec: ExamSpec) => {
      const exam = await importExam(gql, buildPayload(spec));
      createdExamIds.push(exam.id);
      return exam;
    };

    await use({
      create,
      createDefault: () => create(defaultExamSpec(uniqueName())),
    });

    for (const id of createdExamIds) {
      // Best-effort cleanup; an exam may already be gone if the test deleted it.
      await gql
        .execute(`mutation Delete($id: UUID!) { deleteExam(id: $id) }`, { id })
        .catch(() => undefined);
    }
  },
});

export { expect } from '@playwright/test';

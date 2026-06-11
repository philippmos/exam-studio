import { test as base } from '@playwright/test';

import { ApiClient, ImportedExam } from './api-client';
import { buildPayload, ExamSpec } from './exam-payload';

export interface ExamFactory {
  /** Imports an exam through the API and registers it for cleanup. */
  create(spec: ExamSpec): Promise<ImportedExam>;
}

interface ClientFixtures {
  api: ApiClient;
  examFactory: ExamFactory;
}

/**
 * Fixtures for the UI suite. Every test seeds its own uniquely named exam via
 * `examFactory` and all of it is deleted afterwards (cascades to sessions),
 * so tests are order-independent, parallel-safe and repeatable locally.
 */
export const test = base.extend<ClientFixtures>({
  api: async ({}, use) => {
    const api = await ApiClient.create();
    await use(api);
    await api.dispose();
  },

  examFactory: async ({ api }, use) => {
    const createdExamIds: string[] = [];

    await use({
      create: async (spec: ExamSpec) => {
        const exam = await api.importExam(buildPayload(spec));
        createdExamIds.push(exam.id);
        return exam;
      },
    });

    for (const id of createdExamIds) {
      await api.tryDeleteExam(id);
    }
  },
});

export { expect } from '@playwright/test';

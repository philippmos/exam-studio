import { APIRequestContext, expect, request } from '@playwright/test';

export const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export interface ImportedExam {
  id: string;
  name: string;
  questionCount: number;
  sections: { id: string; name: string; questionCount: number }[];
}

/**
 * Direct GraphQL access to the API, used to *arrange* test data quickly
 * (seeding exams, cleanup). The UI flows themselves are exercised in the
 * browser — this client only avoids slow UI detours for setup/teardown.
 */
export class ApiClient {
  private constructor(private readonly context: APIRequestContext) {}

  static async create(): Promise<ApiClient> {
    return new ApiClient(await request.newContext({ baseURL: API_URL }));
  }

  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await this.context.post('/graphql', {
      data: { query, variables },
    });
    expect(
      response.ok(),
      `GraphQL endpoint answered HTTP ${response.status()}`,
    ).toBeTruthy();
    const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
    expect(
      body.errors,
      `GraphQL errors: ${JSON.stringify(body.errors)}`,
    ).toBeUndefined();
    return body.data as T;
  }

  async importExam(payload: string): Promise<ImportedExam> {
    const data = await this.gql<{ importExam: ImportedExam }>(
      `mutation Import($payload: String!) {
        importExam(payload: $payload) {
          id
          name
          questionCount
          sections { id name questionCount }
        }
      }`,
      { payload },
    );
    return data.importExam;
  }

  /** Archive or restore an exam directly, to arrange archive-flow tests. */
  async setExamArchived(id: string, archived: boolean): Promise<void> {
    await this.gql(
      `mutation SetArchived($id: UUID!, $archived: Boolean!) {
        setExamArchived(examId: $id, archived: $archived) { id }
      }`,
      { id, archived },
    );
  }

  /** Cleanup for exams created through the UI (their id is not known upfront). */
  async deleteExamsByName(name: string): Promise<void> {
    const data = await this.gql<{ exams: { id: string; name: string }[] }>(
      `query { exams { id name } }`,
    );
    for (const exam of data.exams.filter((e) => e.name === name)) {
      await this.tryDeleteExam(exam.id);
    }
  }

  /** Best-effort delete used by fixture cleanup. */
  async tryDeleteExam(id: string): Promise<void> {
    await this.context
      .post('/graphql', {
        data: {
          query: `mutation Delete($id: UUID!) { deleteExam(id: $id) }`,
          variables: { id },
        },
      })
      .catch(() => undefined);
  }
}

import { FullConfig, request } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HEALTH_TIMEOUT_MS = 120_000;
const HEALTH_POLL_INTERVAL_MS = 2_000;

/**
 * Global setup: wait until the API (and therefore its database) is ready,
 * then seed the database with the sample exam.
 *
 * In CI the database starts empty, so this fulfils the "create + seed the
 * database in the pipeline" step. The seed is idempotent: it is skipped when
 * an exam with the same name already exists (e.g. on local re-runs).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:8000';
  await waitForApi(baseURL);
  await seedSampleExam(baseURL);
}

async function waitForApi(baseURL: string): Promise<void> {
  const context = await request.newContext({ baseURL });
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = 'no response yet';

  try {
    while (Date.now() < deadline) {
      try {
        const response = await context.get('/health');
        if (response.ok()) {
          return;
        }
        lastError = `HTTP ${response.status()}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
    }
  } finally {
    await context.dispose();
  }

  throw new Error(
    `API at ${baseURL} did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s ` +
      `(last error: ${lastError}). Is the API running? Locally: docker compose up -d db api`,
  );
}

async function seedSampleExam(baseURL: string): Promise<void> {
  const payload = readFileSync(
    path.join(__dirname, 'fixtures', 'sample-exam.json'),
    'utf-8',
  );
  const sampleName = (JSON.parse(payload) as { exam: { name: string } }).exam.name;

  const context = await request.newContext({ baseURL });
  try {
    const existing = await context.post('/graphql', {
      data: { query: 'query { exams { name } }' },
    });
    const existingNames: string[] =
      (await existing.json()).data?.exams.map((e: { name: string }) => e.name) ?? [];
    if (existingNames.includes(sampleName)) {
      console.log(`Seed: exam "${sampleName}" already present, skipping import.`);
      return;
    }

    const response = await context.post('/graphql', {
      data: {
        query:
          'mutation Seed($payload: String!) { importExam(payload: $payload) { id name questionCount } }',
        variables: { payload },
      },
    });
    const body = await response.json();
    if (body.errors?.length) {
      throw new Error(`Seeding the sample exam failed: ${body.errors[0].message}`);
    }
    console.log(
      `Seed: imported "${body.data.importExam.name}" ` +
        `(${body.data.importExam.questionCount} questions).`,
    );
  } finally {
    await context.dispose();
  }
}

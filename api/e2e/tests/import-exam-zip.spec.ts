import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '../src/fixtures';
import { deleteExam, startSession } from '../src/operations';

/**
 * ZIP import (`POST /import/zip`, `POST /import/exams/:id/zip`).
 *
 * Image-carrying imports are a multipart upload to the REST endpoints (binary
 * payloads do not belong on GraphQL). These tests need the Azurite blob
 * emulator running next to the API (see `ci/e2e-services.gitlab-ci.yml`; locally
 * `docker compose up -d api` starts it too).
 */

const ZIP_PATH = path.join(
  __dirname,
  '..',
  'fixtures',
  'sample-exam-with-image.zip',
);
const zipBuffer = (): Buffer => readFileSync(ZIP_PATH);
const zipUpload = () => ({
  file: {
    name: 'exam.zip',
    mimeType: 'application/zip',
    buffer: zipBuffer(),
  },
});

test.describe('ZIP import', () => {
  test('imports a bundle and serves a signed image URL in the question', async ({
    request,
    gql,
  }) => {
    const response = await request.post('/import/zip', {
      multipart: zipUpload(),
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const { examId } = (await response.json()) as { examId: string };
    expect(examId).toBeTruthy();

    try {
      const session = await startSession(gql, examId, 'ALL_RANDOM');
      const question = session.items[0].question;

      // The bundled reference is resolved to a signed blob URL — not the stored
      // media:// placeholder, and not the original images/ path.
      expect(question.text).not.toContain('media://');
      expect(question.text).not.toContain('images/diagram.png');

      const src = question.text.match(/src="([^"]+)"/)?.[1];
      expect(src, 'the question should contain an <img src>').toBeTruthy();
      expect(src as string).toMatch(/^https?:\/\//);
      expect(src as string).toContain('sig='); // a SAS-signed URL

      // The signed URL actually serves the image bytes.
      const image = await request.get(src as string);
      expect(
        image.ok(),
        `signed image URL not reachable: HTTP ${image.status()}`,
      ).toBeTruthy();
      expect((await image.body()).length).toBeGreaterThan(0);
    } finally {
      await deleteExam(gql, examId).catch(() => undefined);
    }
  });

  test('adds questions from a bundle, deduping on image content', async ({
    request,
    examFactory,
  }) => {
    const exam = await examFactory.createDefault();

    const response = await request.post(`/import/exams/${exam.id}/zip`, {
      multipart: zipUpload(),
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const added = (await response.json()) as {
      examId: string;
      added: number;
      skipped: number;
    };
    expect(added.added).toBe(1);
    expect(added.skipped).toBe(0);

    // Re-adding the same bundle is a no-op: the stored media:// reference and the
    // incoming images/ one resolve to the same image content.
    const again = await request.post(`/import/exams/${exam.id}/zip`, {
      multipart: zipUpload(),
    });
    expect(again.ok(), await again.text()).toBeTruthy();
    const reAdded = (await again.json()) as { added: number; skipped: number };
    expect(reAdded.added).toBe(0);
    expect(reAdded.skipped).toBe(1);
  });

  test('rejects an upload that is not a ZIP archive', async ({ request }) => {
    const response = await request.post('/import/zip', {
      multipart: {
        file: {
          name: 'exam.zip',
          mimeType: 'application/zip',
          buffer: Buffer.from('this is not a zip archive'),
        },
      },
    });
    expect(response.status()).toBe(400);
    expect(((await response.json()) as { detail: string }).detail).toContain(
      'ZIP',
    );
  });
});

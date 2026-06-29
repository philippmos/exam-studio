import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from './auth-service';
import { ExamService } from './exam-service';
import { Exam } from './models';

interface GraphqlBody {
  query: string;
  variables: Record<string, unknown>;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeExam(): Exam {
  return {
    id: 'abc',
    name: 'Test exam',
    issuer: null,
    createdAt: '2026-01-01T00:00:00Z',
    questionCount: 0,
    studyGoal: null,
    certificationExamAt: null,
    archived: false,
    sections: [],
  };
}

describe('ExamService', () => {
  let service: ExamService;
  let fetchApi: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchApi = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { fetchApi } }],
    });
    service = TestBed.inject(ExamService);
  });

  function lastBody(): GraphqlBody {
    const init = fetchApi.mock.calls.at(-1)![1] as RequestInit;
    return JSON.parse(init.body as string) as GraphqlBody;
  }

  it('getExams queries the exams field and unwraps the list', async () => {
    const exam = makeExam();
    fetchApi.mockResolvedValue(jsonResponse({ data: { exams: [exam] } }));

    const result = await firstValueFrom(service.getExams());

    expect(lastBody().query).toContain('exams');
    expect(result).toEqual([exam]);
  });

  it('getExam passes the id variable and unwraps the exam', async () => {
    fetchApi.mockResolvedValue(jsonResponse({ data: { exam: null } }));

    const result = await firstValueFrom(service.getExam('abc'));

    expect(lastBody().variables).toEqual({ id: 'abc' });
    expect(result).toBeNull();
  });

  it('setExamArchived maps id -> examId in the mutation variables', async () => {
    fetchApi.mockResolvedValue(
      jsonResponse({ data: { setExamArchived: makeExam() } }),
    );

    await firstValueFrom(service.setExamArchived('abc', true));

    const body = lastBody();
    expect(body.query).toContain('setExamArchived');
    expect(body.variables).toEqual({ id: 'abc', archived: true });
  });
});

import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../environments/environment';
import { ExamService } from './exam-service';
import { Exam } from './models';

interface GraphqlBody {
  query: string;
  variables: Record<string, unknown>;
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
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getExams queries the exams field and unwraps the list', () => {
    const exam = makeExam();
    let result: Exam[] | undefined;
    service.getExams().subscribe((exams) => (result = exams));

    const req = httpMock.expectOne(environment.graphqlUrl);
    expect((req.request.body as GraphqlBody).query).toContain('exams');
    req.flush({ data: { exams: [exam] } });

    expect(result).toEqual([exam]);
  });

  it('getExam passes the id variable and unwraps the exam', () => {
    let result: Exam | null | undefined;
    service.getExam('abc').subscribe((exam) => (result = exam));

    const req = httpMock.expectOne(environment.graphqlUrl);
    expect((req.request.body as GraphqlBody).variables).toEqual({ id: 'abc' });
    req.flush({ data: { exam: null } });

    expect(result).toBeNull();
  });

  it('setExamArchived maps id -> examId in the mutation variables', () => {
    service.setExamArchived('abc', true).subscribe();

    const req = httpMock.expectOne(environment.graphqlUrl);
    const body = req.request.body as GraphqlBody;
    expect(body.query).toContain('setExamArchived');
    expect(body.variables).toEqual({ id: 'abc', archived: true });
    req.flush({ data: { setExamArchived: makeExam() } });
  });
});

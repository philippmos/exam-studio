import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { GraphqlService } from './graphql.service';
import {
  AnswerResult,
  Exam,
  ExamSession,
  SessionMode,
} from './models';

const EXAM_FIELDS = `
  id
  name
  issuer
  createdAt
  questionCount
  sections {
    id
    name
    position
    questionCount
  }
`;

const SESSION_FIELDS = `
  id
  examId
  mode
  sectionId
  createdAt
  finishedAt
  total
  answered
  correct
  items {
    id
    position
    selectedAnswerId
    correctAnswerId
    isCorrect
    answeredAt
    question {
      id
      number
      text
      sectionId
      answers {
        id
        text
        position
      }
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly graphql = inject(GraphqlService);

  getExams(): Observable<Exam[]> {
    return this.graphql
      .request<{ exams: Exam[] }>(`query { exams { ${EXAM_FIELDS} } }`)
      .pipe(map((data) => data.exams));
  }

  getExam(id: string): Observable<Exam | null> {
    return this.graphql
      .request<{ exam: Exam | null }>(
        `query Exam($id: UUID!) { exam(id: $id) { ${EXAM_FIELDS} } }`,
        { id },
      )
      .pipe(map((data) => data.exam));
  }

  getSession(id: string): Observable<ExamSession | null> {
    return this.graphql
      .request<{ session: ExamSession | null }>(
        `query Session($id: UUID!) { session(id: $id) { ${SESSION_FIELDS} } }`,
        { id },
      )
      .pipe(map((data) => data.session));
  }

  importExam(payload: string): Observable<Exam> {
    return this.graphql
      .request<{ importExam: Exam }>(
        `mutation Import($payload: String!) {
          importExam(payload: $payload) { ${EXAM_FIELDS} }
        }`,
        { payload },
      )
      .pipe(map((data) => data.importExam));
  }

  deleteExam(id: string): Observable<boolean> {
    return this.graphql
      .request<{ deleteExam: boolean }>(
        `mutation Delete($id: UUID!) { deleteExam(id: $id) }`,
        { id },
      )
      .pipe(map((data) => data.deleteExam));
  }

  startSession(
    examId: string,
    mode: SessionMode,
    sectionId: string | null,
  ): Observable<ExamSession> {
    return this.graphql
      .request<{ startSession: ExamSession }>(
        `mutation Start($examId: UUID!, $mode: SessionMode!, $sectionId: UUID) {
          startSession(examId: $examId, mode: $mode, sectionId: $sectionId) {
            ${SESSION_FIELDS}
          }
        }`,
        { examId, mode, sectionId },
      )
      .pipe(map((data) => data.startSession));
  }

  submitAnswer(
    sessionItemId: string,
    selectedAnswerId: string,
  ): Observable<AnswerResult> {
    return this.graphql
      .request<{ submitAnswer: AnswerResult }>(
        `mutation Submit($sessionItemId: UUID!, $selectedAnswerId: UUID!) {
          submitAnswer(
            sessionItemId: $sessionItemId
            selectedAnswerId: $selectedAnswerId
          ) {
            sessionItemId
            isCorrect
            correctAnswerId
          }
        }`,
        { sessionItemId, selectedAnswerId },
      )
      .pipe(map((data) => data.submitAnswer));
  }

  finishSession(id: string): Observable<ExamSession> {
    return this.graphql
      .request<{ finishSession: ExamSession }>(
        `mutation Finish($id: UUID!) {
          finishSession(id: $id) { ${SESSION_FIELDS} }
        }`,
        { id },
      )
      .pipe(map((data) => data.finishSession));
  }
}

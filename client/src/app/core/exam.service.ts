import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { GraphqlService } from './graphql.service';
import {
  AnswerResult,
  Exam,
  ExamSession,
  ExamStats,
  SessionMode,
  SessionOverview,
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
    selectedAnswerIds
    correctAnswerIds
    isCorrect
    answeredAt
    question {
      id
      text
      sectionId
      questionType
      answers {
        id
        text
        position
      }
    }
  }
`;

const SESSION_OVERVIEW_FIELDS = `
  id
  examId
  examName
  mode
  sectionId
  sectionName
  createdAt
  finishedAt
  total
  answered
  correct
`;

const EXAM_STATS_FIELDS = `
  examId
  examName
  totalQuestions
  attemptedQuestions
  masteredQuestions
  strugglingQuestions
  unattemptedQuestions
  totalAttempts
  correctAttempts
  incorrectAttempts
  accuracy
  coverage
  mastery
  sessionsCount
  lastActivity
  sections {
    sectionId
    name
    totalQuestions
    attemptedQuestions
    masteredQuestions
    strugglingQuestions
    correctAttempts
    incorrectAttempts
    accuracy
    mastery
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

  getSessions(examId: string | null = null): Observable<SessionOverview[]> {
    return this.graphql
      .request<{ sessions: SessionOverview[] }>(
        `query Sessions($examId: UUID) {
          sessions(examId: $examId) { ${SESSION_OVERVIEW_FIELDS} }
        }`,
        { examId },
      )
      .pipe(map((data) => data.sessions));
  }

  getExamStats(examId: string): Observable<ExamStats | null> {
    return this.graphql
      .request<{ examStats: ExamStats | null }>(
        `query Stats($examId: UUID!) { examStats(examId: $examId) { ${EXAM_STATS_FIELDS} } }`,
        { examId },
      )
      .pipe(map((data) => data.examStats));
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
    selectedAnswerIds: string[],
  ): Observable<AnswerResult> {
    return this.graphql
      .request<{ submitAnswer: AnswerResult }>(
        `mutation Submit($sessionItemId: UUID!, $selectedAnswerIds: [UUID!]!) {
          submitAnswer(
            sessionItemId: $sessionItemId
            selectedAnswerIds: $selectedAnswerIds
          ) {
            sessionItemId
            isCorrect
            correctAnswerIds
          }
        }`,
        { sessionItemId, selectedAnswerIds },
      )
      .pipe(map((data) => data.submitAnswer));
  }

  deleteSession(id: string): Observable<boolean> {
    return this.graphql
      .request<{ deleteSession: boolean }>(
        `mutation DeleteSession($id: UUID!) { deleteSession(id: $id) }`,
        { id },
      )
      .pipe(map((data) => data.deleteSession));
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

import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { GraphqlService } from './graphql.service';
import {
  Allocation,
  AnswerResult,
  Exam,
  ExamSession,
  ExamStats,
  GoalPeriod,
  ReviewDue,
  SessionMode,
  SessionOverview,
  StudyDayStats,
  StudyGoalProgress,
  StudyGoalSource,
  SuggestedStudyGoal,
} from './models';

const EXAM_FIELDS = `
  id
  name
  issuer
  createdAt
  questionCount
  studyGoal {
    period
    target
    source
  }
  certificationExamAt
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
    selectedAllocations {
      answerId
      categoryId
    }
    correctAnswerIds
    correctAllocations {
      answerId
      categoryId
    }
    isCorrect
    answeredAt
    question {
      id
      text
      explanation
      sectionId
      questionType
      answers {
        id
        text
        position
      }
      categories {
        id
        key
        label
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

  /** Per-day answer history, across all exams or one exam's, oldest first. */
  getStudyHistory(examId: string | null = null): Observable<StudyDayStats[]> {
    return this.graphql
      .request<{ studyHistory: StudyDayStats[] }>(
        `query StudyHistory($examId: UUID, $tzOffsetMinutes: Int!) {
          studyHistory(examId: $examId, tzOffsetMinutes: $tzOffsetMinutes) {
            day
            total
            correct
            incorrect
          }
        }`,
        // The API buckets by UTC unless told the browser's local offset.
        { examId, tzOffsetMinutes: -new Date().getTimezoneOffset() },
      )
      .pipe(map((data) => data.studyHistory));
  }

  /** Questions due for spaced-repetition review, per exam (all or one). */
  getReviewDue(examId: string | null = null): Observable<ReviewDue[]> {
    return this.graphql
      .request<{ reviewDue: ReviewDue[] }>(
        `query ReviewDue($examId: UUID) {
          reviewDue(examId: $examId) {
            examId
            dueCount
          }
        }`,
        { examId },
      )
      .pipe(map((data) => data.reviewDue));
  }

  /** Current-period progress of every exam that has a study goal. */
  getStudyGoalProgress(
    examId: string | null = null,
  ): Observable<StudyGoalProgress[]> {
    return this.graphql
      .request<{ studyGoalProgress: StudyGoalProgress[] }>(
        `query GoalProgress($examId: UUID, $tzOffsetMinutes: Int!) {
          studyGoalProgress(examId: $examId, tzOffsetMinutes: $tzOffsetMinutes) {
            examId
            period
            target
            answered
            periodStart
          }
        }`,
        // Period boundaries (midnight / Monday) are local, not UTC.
        { examId, tzOffsetMinutes: -new Date().getTimezoneOffset() },
      )
      .pipe(map((data) => data.studyGoalProgress));
  }

  setStudyGoal(
    examId: string,
    period: GoalPeriod,
    target: number,
    source: StudyGoalSource = 'MANUAL',
  ): Observable<Exam> {
    return this.graphql
      .request<{ setStudyGoal: Exam }>(
        `mutation SetGoal(
          $examId: UUID!
          $period: GoalPeriod!
          $target: Int!
          $source: StudyGoalSource!
        ) {
          setStudyGoal(
            examId: $examId
            period: $period
            target: $target
            source: $source
          ) {
            ${EXAM_FIELDS}
          }
        }`,
        { examId, period, target, source },
      )
      .pipe(map((data) => data.setStudyGoal));
  }

  /**
   * Study goal suggested from a certification date: the exam's stored date, or
   * `examAt` to preview one before saving. Resolves to `null` when no date is
   * known or the exam can't be sensibly planned (e.g. the date is too close).
   */
  getSuggestedStudyGoal(
    examId: string,
    period: GoalPeriod,
    examAt: string | null = null,
  ): Observable<SuggestedStudyGoal | null> {
    return this.graphql
      .request<{ suggestedStudyGoal: SuggestedStudyGoal | null }>(
        `query Suggest($examId: UUID!, $period: GoalPeriod!, $examAt: DateTime) {
          suggestedStudyGoal(examId: $examId, period: $period, examAt: $examAt) {
            period
            target
            questionCount
            repetitionFactor
            daysUntilExam
            usableDays
          }
        }`,
        { examId, period, examAt },
      )
      .pipe(map((data) => data.suggestedStudyGoal));
  }

  clearStudyGoal(examId: string): Observable<Exam> {
    return this.graphql
      .request<{ clearStudyGoal: Exam }>(
        `mutation ClearGoal($examId: UUID!) {
          clearStudyGoal(examId: $examId) { ${EXAM_FIELDS} }
        }`,
        { examId },
      )
      .pipe(map((data) => data.clearStudyGoal));
  }

  /** Schedule the certification exam; `examAt` is an ISO 8601 datetime. */
  setCertificationExamDate(examId: string, examAt: string): Observable<Exam> {
    return this.graphql
      .request<{ setCertificationExamDate: Exam }>(
        `mutation SetExamDate($examId: UUID!, $examAt: DateTime!) {
          setCertificationExamDate(examId: $examId, examAt: $examAt) {
            ${EXAM_FIELDS}
          }
        }`,
        { examId, examAt },
      )
      .pipe(map((data) => data.setCertificationExamDate));
  }

  clearCertificationExamDate(examId: string): Observable<Exam> {
    return this.graphql
      .request<{ clearCertificationExamDate: Exam }>(
        `mutation ClearExamDate($examId: UUID!) {
          clearCertificationExamDate(examId: $examId) { ${EXAM_FIELDS} }
        }`,
        { examId },
      )
      .pipe(map((data) => data.clearCertificationExamDate));
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

  /** Submit a single/multiple-choice selection. */
  submitAnswer(
    sessionItemId: string,
    selectedAnswerIds: string[],
  ): Observable<AnswerResult> {
    return this.submit(sessionItemId, { selectedAnswerIds });
  }

  /** Submit an allocation: every item sorted into a basket. */
  submitAllocation(
    sessionItemId: string,
    allocations: Allocation[],
  ): Observable<AnswerResult> {
    return this.submit(sessionItemId, { allocations });
  }

  private submit(
    sessionItemId: string,
    answer: { selectedAnswerIds?: string[]; allocations?: Allocation[] },
  ): Observable<AnswerResult> {
    return this.graphql
      .request<{ submitAnswer: AnswerResult }>(
        `mutation Submit(
          $sessionItemId: UUID!
          $selectedAnswerIds: [UUID!]
          $allocations: [AllocationInput!]
          $tzOffsetMinutes: Int!
        ) {
          submitAnswer(
            sessionItemId: $sessionItemId
            selectedAnswerIds: $selectedAnswerIds
            allocations: $allocations
            tzOffsetMinutes: $tzOffsetMinutes
          ) {
            sessionItemId
            isCorrect
            correctAnswerIds
            correctAllocations {
              answerId
              categoryId
            }
            reviewBox
            reviewIntervalDays
          }
        }`,
        // The next review date is pinned to the user's local day, not UTC.
        {
          sessionItemId,
          selectedAnswerIds: answer.selectedAnswerIds ?? [],
          allocations: answer.allocations ?? [],
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
        },
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

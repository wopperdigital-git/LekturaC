import { fromDbConfig } from '@/quiz/types'
import type { Announcement, Attempt, ClassRoom, Member, Person, Posting, QuizSummary, StudentQuiz } from './types'

/*
  Row shapes exactly as PostgREST returns them, the column lists that request
  them, and the mapping to app types. Kept together so a column cannot be
  selected under one name and read under another.
*/

export const PERSON_COLUMNS = 'id, display_name, email'
export const CLASS_COLUMNS = 'id, teacher_id, name, description, join_code, created_at'
export const MEMBER_COLUMNS = 'class_id, student_id, joined_at'
export const ANNOUNCEMENT_COLUMNS = 'id, class_id, title, body, created_at, updated_at'
export const QUIZ_COLUMNS = 'id, title, deck_title, presentation_id, created_at, code, quiz_type, quiz_questions(slide_number)'
/** No `quiz_questions(...)` embed: a student cannot read questions, so it would only ever be empty. */
export const STUDENT_QUIZ_COLUMNS = 'id, title, code, quiz_type, created_at'
export const POSTING_COLUMNS = 'quiz_id, class_id, posted_at'
export const ATTEMPT_COLUMNS = 'quiz_id, class_id, student_id, score, submitted_at'

export interface PersonRow {
  id: string
  display_name: string | null
  email: string | null
}

export interface ClassRow {
  id: string
  teacher_id: string
  name: string
  description: string | null
  join_code: string
  created_at: string
}

export interface MemberRow {
  class_id: string
  student_id: string
  joined_at: string
}

export interface AnnouncementRow {
  id: string
  class_id: string
  title: string
  body: string | null
  created_at: string
  updated_at: string
}

export interface QuizRow {
  id: string
  title: string
  deck_title: string
  presentation_id: string | null
  created_at: string
  code: string
  quiz_type: string
  quiz_questions?: { slide_number: number }[] | null
}

export interface StudentQuizRow {
  id: string
  title: string
  code: string
  quiz_type: string
  created_at: string
}

export interface PostingRow {
  quiz_id: string
  class_id: string
  posted_at: string
}

export interface AttemptRow {
  quiz_id: string
  class_id: string
  student_id: string
  /** Postgres `numeric` — a number in JSON, but read defensively. */
  score: number | string
  submitted_at: string
}

export function personFromRow(row: PersonRow): Person {
  return { id: row.id, displayName: row.display_name ?? '', email: row.email ?? '' }
}

export function classFromRow(row: ClassRow): ClassRoom {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.name,
    description: row.description ?? '',
    joinCode: row.join_code,
    createdAt: row.created_at,
  }
}

export function memberFromRow(row: MemberRow): Member {
  return { classId: row.class_id, studentId: row.student_id, joinedAt: row.joined_at }
}

export function announcementFromRow(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    classId: row.class_id,
    title: row.title,
    body: row.body ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function quizFromRow(row: QuizRow): QuizSummary {
  return {
    id: row.id,
    title: row.title,
    deckTitle: row.deck_title,
    presentationId: row.presentation_id,
    createdAt: row.created_at,
    slideNumbers: (row.quiz_questions ?? []).map((q) => q.slide_number),
    code: row.code,
    quizType: fromDbConfig(row.quiz_type, {}).type,
  }
}

export function studentQuizFromRow(row: StudentQuizRow): StudentQuiz {
  return {
    id: row.id,
    title: row.title,
    code: row.code,
    quizType: fromDbConfig(row.quiz_type, {}).type,
    createdAt: row.created_at,
  }
}

export function postingFromRow(row: PostingRow): Posting {
  return { quizId: row.quiz_id, classId: row.class_id, postedAt: row.posted_at }
}

export function attemptFromRow(row: AttemptRow): Attempt {
  return {
    quizId: row.quiz_id,
    classId: row.class_id,
    studentId: row.student_id,
    score: Number(row.score),
    submittedAt: row.submitted_at,
  }
}

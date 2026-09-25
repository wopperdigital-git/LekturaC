/*
  The classroom as the app sees it — camelCase, parsed, never a raw row.
  Rows become these in `rows.ts`; nothing else in the app touches row shapes.
  Timestamps stay ISO strings as Supabase returns them.
*/

import type { QuizType } from '@/quiz/types'

/** Anyone shown by name: a student on a roster, a teacher on a class card. */
export interface Person {
  id: string
  displayName: string
  email: string
}

export interface ClassRoom {
  id: string
  teacherId: string
  name: string
  description: string
  joinCode: string
  createdAt: string
}

export interface ClassDetails {
  name: string
  description: string
}

export interface Member {
  classId: string
  studentId: string
  joinedAt: string
}

export interface Announcement {
  id: string
  classId: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface AnnouncementDetails {
  title: string
  body: string
}

export interface QuizSummary {
  id: string
  title: string
  deckTitle: string
  /** `null` once the source deck has been deleted. */
  presentationId: string | null
  createdAt: string
  /** 1-based slide numbers the questions cite, one entry per question. */
  slideNumbers: number[]
  /** The share code students use at `/quiz/:code`. */
  code: string
  quizType: QuizType
}

/** A quiz posted to a class. */
export interface Posting {
  quizId: string
  classId: string
  postedAt: string
}

export interface Attempt {
  quizId: string
  classId: string
  studentId: string
  /** 0–1. */
  score: number
  submittedAt: string
}

/** Everything a teacher's classroom pages read, loaded in one go. */
export interface TeacherClassroom {
  classes: ClassRoom[]
  members: Member[]
  students: Person[]
  announcements: Announcement[]
  quizzes: QuizSummary[]
  postings: Posting[]
  attempts: Attempt[]
}

/**
 * A quiz as a student sees it: enough to list it and open it. No question count
 * and no answers — `quiz_questions` is owner-only, so a student's read of it
 * (or an embed of it) is empty by design.
 */
export interface StudentQuiz {
  id: string
  title: string
  /** The share code, i.e. the `/quiz/:code` they open. */
  code: string
  quizType: QuizType
  createdAt: string
}

/** Everything a student's class pages read. */
export interface StudentClassroom {
  classes: ClassRoom[]
  teachers: Person[]
  announcements: Announcement[]
  /** Only quizzes posted to a class the student is in (RLS: `quizzes_select`). */
  quizzes: StudentQuiz[]
  postings: Posting[]
  /** The student's own attempts (RLS: `quiz_attempts_select` = own rows). */
  attempts: Attempt[]
}

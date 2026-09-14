import { ensureSession, supabase, supabaseConfigured } from '@/lib/supabaseClient'
import { normalizeJoinCode } from './joinCode'
import {
  ANNOUNCEMENT_COLUMNS,
  ATTEMPT_COLUMNS,
  CLASS_COLUMNS,
  MEMBER_COLUMNS,
  PERSON_COLUMNS,
  POSTING_COLUMNS,
  QUIZ_COLUMNS,
  announcementFromRow,
  attemptFromRow,
  classFromRow,
  memberFromRow,
  personFromRow,
  postingFromRow,
  quizFromRow,
  type AnnouncementRow,
  type AttemptRow,
  type ClassRow,
  type MemberRow,
  type PersonRow,
  type PostingRow,
  type QuizRow,
} from './rows'
import type {
  AnnouncementDetails,
  ClassDetails,
  ClassRoom,
  StudentClassroom,
  TeacherClassroom,
} from './types'

/*
  Every classroom read and write. Pages call these and never build a query —
  the same rule briefDrafts.ts follows — so RLS assumptions live in one file.

  Errors are thrown as Supabase hands them back (plain objects); pages pass
  them through `describeError`. RPC refusals are re-thrown as `Error` with the
  bare message, because the SQL raises sentences meant for the user and the
  error code appended by `describeError` would only clutter them.
*/

type Result = { data: unknown; error: unknown }

async function db() {
  if (!supabaseConfigured || !supabase) throw new Error('Supabase is not configured.')
  await ensureSession()
  return supabase
}

function many<T>(result: Result): T[] {
  if (result.error) throw result.error
  return (result.data ?? []) as T[]
}

/**
 * For an update or delete: RLS turns a write the caller may not make into
 * "0 rows affected" rather than an error, which would otherwise read as success.
 */
function changed(result: Result): void {
  if (result.error) throw result.error
  if (!Array.isArray(result.data) || result.data.length === 0) {
    throw new Error("That change wasn't saved — it may already be gone. Reload and try again.")
  }
}

function rpcValue<T>(result: Result): T {
  if (result.error) {
    const message = (result.error as { message?: unknown }).message
    throw new Error(typeof message === 'string' && message ? message : 'Something went wrong.')
  }
  return result.data as T
}

/** RLS scopes this: a teacher gets the classes they own, a student the ones they are in. */
export async function listMyClasses(): Promise<ClassRoom[]> {
  const client = await db()
  return many<ClassRow>(
    await client.from('classes').select(CLASS_COLUMNS).order('created_at', { ascending: false }),
  ).map(classFromRow)
}

export async function loadTeacherClassroom(): Promise<TeacherClassroom> {
  const client = await db()
  const classes = await listMyClasses()
  const classIds = classes.map((c) => c.id)

  const quizzesRequest = client.from('quizzes').select(QUIZ_COLUMNS).order('created_at', { ascending: false })

  if (classIds.length === 0) {
    const quizzes = many<QuizRow>(await quizzesRequest).map(quizFromRow)
    return { classes, members: [], students: [], announcements: [], quizzes, postings: [], attempts: [] }
  }

  const [memberResult, announcementResult, quizResult, postingResult, attemptResult] = await Promise.all([
    client.from('class_members').select(MEMBER_COLUMNS).in('class_id', classIds),
    client
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    quizzesRequest,
    client.from('quiz_classes').select(POSTING_COLUMNS).in('class_id', classIds),
    client.from('quiz_attempts').select(ATTEMPT_COLUMNS).in('class_id', classIds),
  ])

  const members = many<MemberRow>(memberResult).map(memberFromRow)
  const studentIds = [...new Set(members.map((m) => m.studentId))]
  const students =
    studentIds.length === 0
      ? []
      : many<PersonRow>(await client.from('profiles').select(PERSON_COLUMNS).in('id', studentIds)).map(personFromRow)

  return {
    classes,
    members,
    students,
    announcements: many<AnnouncementRow>(announcementResult).map(announcementFromRow),
    quizzes: many<QuizRow>(quizResult).map(quizFromRow),
    postings: many<PostingRow>(postingResult).map(postingFromRow),
    attempts: many<AttemptRow>(attemptResult).map(attemptFromRow),
  }
}

export async function loadStudentClassroom(): Promise<StudentClassroom> {
  const client = await db()
  const classes = await listMyClasses()
  if (classes.length === 0) return { classes, teachers: [], announcements: [] }

  const teacherIds = [...new Set(classes.map((c) => c.teacherId))]
  const [teacherResult, announcementResult] = await Promise.all([
    client.from('profiles').select(PERSON_COLUMNS).in('id', teacherIds),
    client
      .from('announcements')
      .select(ANNOUNCEMENT_COLUMNS)
      .in('class_id', classes.map((c) => c.id))
      .order('created_at', { ascending: false }),
  ])

  return {
    classes,
    teachers: many<PersonRow>(teacherResult).map(personFromRow),
    announcements: many<AnnouncementRow>(announcementResult).map(announcementFromRow),
  }
}

export async function createClass(details: ClassDetails): Promise<ClassRoom> {
  const client = await db()
  const [row] = many<ClassRow>(
    await client
      .from('classes')
      .insert({ name: details.name.trim(), description: details.description.trim() })
      .select(CLASS_COLUMNS),
  )
  if (!row) throw new Error('The class was not created.')
  return classFromRow(row)
}

export async function updateClass(id: string, details: ClassDetails): Promise<void> {
  const client = await db()
  changed(
    await client
      .from('classes')
      .update({ name: details.name.trim(), description: details.description.trim() })
      .eq('id', id)
      .select('id'),
  )
}

export async function deleteClass(id: string): Promise<void> {
  const client = await db()
  changed(await client.from('classes').delete().eq('id', id).select('id'))
}

export async function regenerateJoinCode(classId: string): Promise<string> {
  const client = await db()
  return rpcValue<string>(await client.rpc('regenerate_join_code', { p_class_id: classId }))
}

/** Joins by code and returns the class id. */
export async function joinClass(code: string): Promise<string> {
  const client = await db()
  return rpcValue<string>(await client.rpc('join_class', { p_code: normalizeJoinCode(code) }))
}

/** A teacher removing a student, or a student leaving — RLS allows both. */
export async function removeMembership(classId: string, studentId: string): Promise<void> {
  const client = await db()
  changed(
    await client
      .from('class_members')
      .delete()
      .eq('class_id', classId)
      .eq('student_id', studentId)
      .select('class_id'),
  )
}

export async function createAnnouncement(classId: string, details: AnnouncementDetails): Promise<void> {
  const client = await db()
  many(
    await client
      .from('announcements')
      .insert({ class_id: classId, title: details.title.trim(), body: details.body.trim() })
      .select('id'),
  )
}

export async function updateAnnouncement(id: string, details: AnnouncementDetails): Promise<void> {
  const client = await db()
  changed(
    await client
      .from('announcements')
      .update({ title: details.title.trim(), body: details.body.trim() })
      .eq('id', id)
      .select('id'),
  )
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const client = await db()
  changed(await client.from('announcements').delete().eq('id', id).select('id'))
}

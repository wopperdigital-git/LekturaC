import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Routes, Route, useParams } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { CreatePage } from '@/pages/CreatePage'
import { DraftsPage } from '@/pages/DraftsPage'
import { VideosPage } from '@/pages/VideosPage'
import { EditorPage } from '@/pages/EditorPage'
import { PresentPage } from '@/pages/PresentPage'
import { QuizPage } from '@/pages/QuizPage'
import { LessonPage } from '@/pages/LessonPage'
import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireRole } from '@/components/auth/RequireRole'
import { RequireAdmin } from '@/components/auth/RequireAdmin'
import { AdminPage } from '@/pages/AdminPage'
import { AdminLoginPage } from '@/pages/AdminLoginPage'
import { ClassesPage } from '@/pages/classroom/ClassesPage'
import { ClassFolderPage } from '@/pages/classroom/ClassFolderPage'
import { StudentsPage } from '@/pages/classroom/StudentsPage'
import { QuizzesPage } from '@/pages/classroom/QuizzesPage'
import { MyClassesPage } from '@/pages/classroom/MyClassesPage'
import { JobTray } from '@/components/jobs/JobTray'
import { StudentClassPage } from '@/pages/classroom/StudentClassPage'

/** The landing page pulls in GSAP and Lenis; lazy, so the app bundle never carries them. */
const WelcomePage = lazy(() => import('@/pages/WelcomePage').then((m) => ({ default: m.WelcomePage })))

/** Development only: the fixture deck in every theme, no account needed. Dropped from a production build. */
const DevSlidesPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/DevSlidesPage').then((m) => ({ default: m.DevSlidesPage })))
  : null

/** The narration page is gone; its script lives in the editor's Narration tab. Old links land on the deck. */
function NarrateRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/deck/${id}` : '/'} replace />
}

function teacherOnly(element: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="teacher">{element}</RequireRole>
    </RequireAuth>
  )
}

function studentOnly(element: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="student">{element}</RequireRole>
    </RequireAuth>
  )
}

/**
 * The join page. A General account belongs here too — entering a code is what
 * promotes it to Student — while a class's own page stays student-only, since
 * a General account has no memberships to read.
 */
function joinerOnly(element: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role={['general', 'student']}>{element}</RequireRole>
    </RequireAuth>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        {DevSlidesPage && (
          <Route
            path="/dev/slides"
            element={
              <Suspense fallback={null}>
                <DevSlidesPage />
              </Suspense>
            }
          />
        )}
        <Route
          path="/welcome"
          element={
            <Suspense fallback={null}>
              <WelcomePage />
            </Suspense>
          }
        />
        <Route
          path="/"
          element={
            <RequireAuth signedOutTo="/welcome">
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/new"
          element={
            <RequireAuth>
              <CreatePage />
            </RequireAuth>
          }
        />
        <Route
          path="/drafts"
          element={
            <RequireAuth>
              <DraftsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/videos"
          element={
            <RequireAuth>
              <VideosPage />
            </RequireAuth>
          }
        />
        <Route
          path="/deck/:id"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/deck/:id/present"
          element={
            <RequireAuth>
              <PresentPage />
            </RequireAuth>
          }
        />
        <Route
          path="/deck/:id/narrate"
          element={
            <RequireAuth>
              <NarrateRedirect />
            </RequireAuth>
          }
        />
        <Route
          path="/quiz/:code"
          element={
            <RequireAuth>
              <QuizPage />
            </RequireAuth>
          }
        />
        <Route
          path="/lesson/:code/:classId"
          element={
            <RequireAuth>
              <LessonPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth adminPage signedOutTo="/admin/login">
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route
          path="/admin/:section"
          element={
            <RequireAuth adminPage signedOutTo="/admin/login">
              <RequireAdmin>
                <AdminPage />
              </RequireAdmin>
            </RequireAuth>
          }
        />
        <Route path="/classroom" element={teacherOnly(<Navigate to="/classroom/classes" replace />)} />
        <Route path="/classroom/classes" element={teacherOnly(<ClassesPage />)} />
        <Route path="/classroom/classes/:classId" element={teacherOnly(<ClassFolderPage />)} />
        <Route path="/classroom/students" element={teacherOnly(<StudentsPage />)} />
        <Route path="/classroom/quizzes" element={teacherOnly(<QuizzesPage />)} />
        <Route path="/classes" element={joinerOnly(<MyClassesPage />)} />
        <Route path="/classes/:classId" element={studentOnly(<StudentClassPage />)} />
      </Routes>
      <JobTray />
    </BrowserRouter>
  )
}

export default App

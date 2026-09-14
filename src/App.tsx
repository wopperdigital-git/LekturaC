import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { CreatePage } from '@/pages/CreatePage'
import { DraftsPage } from '@/pages/DraftsPage'
import { EditorPage } from '@/pages/EditorPage'
import { PresentPage } from '@/pages/PresentPage'
import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RequireAuth } from '@/components/auth/RequireAuth'
import { RequireRole } from '@/components/auth/RequireRole'
import { ClassesPage } from '@/pages/classroom/ClassesPage'
import { StudentsPage } from '@/pages/classroom/StudentsPage'
import { QuizzesPage } from '@/pages/classroom/QuizzesPage'

function teacherOnly(element: ReactNode) {
  return (
    <RequireAuth>
      <RequireRole role="teacher">{element}</RequireRole>
    </RequireAuth>
  )
}

// `studentOnly` is added in Task 11, when it has a caller — `tsconfig.app.json`'s
// unused-locals check would fail the build on an unused helper.

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
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
        <Route path="/classroom" element={teacherOnly(<Navigate to="/classroom/classes" replace />)} />
        <Route path="/classroom/classes" element={teacherOnly(<ClassesPage />)} />
        <Route path="/classroom/students" element={teacherOnly(<StudentsPage />)} />
        <Route path="/classroom/quizzes" element={teacherOnly(<QuizzesPage />)} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

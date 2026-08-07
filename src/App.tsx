import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { CreatePage } from '@/pages/CreatePage'
import { EditorPage } from '@/pages/EditorPage'
import { PresentPage } from '@/pages/PresentPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/new" element={<CreatePage />} />
        <Route path="/deck/:id" element={<EditorPage />} />
        <Route path="/deck/:id/present" element={<PresentPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

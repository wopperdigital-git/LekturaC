import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The chrome's one face, with its width axis: expanded for the wordmark and
// titles, normal for everything else. Slides never read it: they set
// --slide-font-* on their own roots.
import '@fontsource-variable/archivo/wdth.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

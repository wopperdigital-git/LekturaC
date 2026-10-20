import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The chrome's one face, with its optical-size axis so 11px panel captions and
// 30px page titles each get the cut drawn for them. Slides never read it: they
// set --slide-font-* on their own roots.
import '@fontsource-variable/source-serif-4/opsz.css'
import '@fontsource-variable/source-serif-4/opsz-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

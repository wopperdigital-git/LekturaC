import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The chrome's one face, with its width axis: expanded for the wordmark and
// titles, normal for everything else. Slides never read it: they set
// --slide-font-* on their own roots.
import '@fontsource-variable/archivo/wdth.css'
// The web fonts the slide themes name (Paper, Chalkboard, Blueprint, Pop,
// Boardroom). Variable packages register "<Family> Variable", which a theme's
// stack names second. Files are separate assets fetched when a slide uses one,
// so the entry carries only the @font-face rules.
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/700.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/hanken-grotesk'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

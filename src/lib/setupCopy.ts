/*
  What a teacher or student sees when a service this site needs has no key.

  The variable names (`VITE_GROQ_API_KEY`, …) mean nothing to them and nothing they can
  do: they are for whoever runs the site, who finds them in `.env.example`, on `/new`'s
  setup message and in the console (`warnMissingKey`). The screen says what is missing
  and who can fix it.
*/

export const QUIZ_NOT_SET_UP = "Quizzes aren't set up on this site yet. Whoever runs it needs to add a Groq key."

export const VOICE_NOT_SET_UP = "Voices aren't set up on this site yet. Whoever runs it needs to add a Cartesia key."

export const AI_NOT_SET_UP = 'No AI service is set up on this site yet. Whoever runs it needs to add an AI key.'

/** The variable names, for whoever runs the site. */
export function warnMissingKey(what: string, variables: string): void {
  console.warn(`[setup] ${what} is off: add ${variables} to .env.`)
}

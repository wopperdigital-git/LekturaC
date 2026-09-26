/*
  The languages the voice tools support, and the words spoken in them.

  Cartesia speaks many more, but two texts here have to be in the language the voice
  will use: the passage a person reads aloud to be cloned, and the sentences the
  preview speaks. Reading English into a French clone, or previewing French with
  English words, gives the wrong result, so a language is only offered once it has
  both. Adding one is one row in each table and one entry in VOICE_LANGUAGES.
*/

export const VOICE_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
] as const

export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: VoiceLanguage = 'en'

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return VOICE_LANGUAGES.some((l) => l.code === value)
}

/** About 25 words: roughly ten seconds read aloud, which is what an instant clone wants. */
export const READING_SCRIPTS: Record<VoiceLanguage, string> = {
  en: 'The quick brown fox jumps over the lazy dog. Today I am reading at a steady, natural pace, so my voice sounds clear and calm.',
  es: 'El veloz zorro marrón salta sobre el perro perezoso. Hoy leo a un ritmo tranquilo y natural, para que mi voz suene clara y serena.',
  fr: "Le renard brun rapide saute par-dessus le chien paresseux. Aujourd'hui, je lis à un rythme régulier et naturel, pour que ma voix soit claire et calme.",
  de: 'Der schnelle braune Fuchs springt über den faulen Hund. Heute lese ich in einem ruhigen, natürlichen Tempo, damit meine Stimme klar und gelassen klingt.',
  pt: 'A rápida raposa marrom pula sobre o cão preguiçoso. Hoje leio num ritmo calmo e natural, para que a minha voz soe clara e serena.',
  it: 'La rapida volpe marrone salta sopra il cane pigro. Oggi leggo con un ritmo calmo e naturale, così la mia voce suona chiara e serena.',
}

/** The two fixed sentences the Preview button speaks. Exactly two, one terminator each. */
export const PREVIEW_SENTENCES: Record<VoiceLanguage, readonly [string, string]> = {
  en: ['Hello, this is how your narration will sound.', 'Every slide in your deck can be read aloud in this voice.'],
  es: ['Hola, así sonará tu narración.', 'Cada diapositiva de tu presentación puede leerse en voz alta con esta voz.'],
  fr: ['Bonjour, voici à quoi ressemblera votre narration.', 'Chaque diapositive de votre présentation peut être lue à voix haute avec cette voix.'],
  de: ['Hallo, so wird Ihre Erzählung klingen.', 'Jede Folie Ihrer Präsentation kann mit dieser Stimme vorgelesen werden.'],
  pt: ['Olá, é assim que a sua narração vai soar.', 'Cada slide da sua apresentação pode ser lido em voz alta com esta voz.'],
  it: ['Ciao, ecco come suonerà la tua narrazione.', 'Ogni diapositiva della tua presentazione può essere letta ad alta voce con questa voce.'],
}

export function previewTranscript(language: VoiceLanguage): string {
  return PREVIEW_SENTENCES[language].join(' ')
}

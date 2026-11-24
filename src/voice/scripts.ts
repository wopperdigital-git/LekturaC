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

/*
  About 50 words: roughly twenty seconds read aloud. Written to give the clone more of the voice than a
  pangram does: a teacher's opening, as the voice will be used, with a greeting, a statement, a real
  question, a list, a short pause line and an exclamation, so it hears the reader's rising and falling
  pitch, their pace across commas and full stops, and a wide spread of sounds. Each language is its
  own text with the same shape, not a word-for-word translation.
*/
export const READING_SCRIPTS: Record<VoiceLanguage, string> = {
  en: "Welcome back, everyone. Today we're exploring how rivers shape the land around us. Have you ever wondered why some valleys are wide, while others are deep and narrow? It comes down to three things: speed, rock, and time. Let's take a closer look, one step at a time. Ready? Here we go!",
  es: 'Bienvenidos de nuevo a todos. Hoy vamos a descubrir cómo los ríos dan forma a la tierra que nos rodea. ¿Alguna vez se han preguntado por qué algunos valles son anchos y otros, profundos y estrechos? Todo depende de tres cosas: la velocidad, la roca y el tiempo. Veámoslo paso a paso. ¿Listos? ¡Vamos allá!',
  fr: "Bonjour à tous, et bienvenue. Aujourd'hui, nous allons découvrir comment les rivières façonnent les paysages qui nous entourent. Vous êtes-vous déjà demandé pourquoi certaines vallées sont larges, et d'autres étroites et profondes ? Tout dépend de trois choses : la vitesse, la roche et le temps. Voyons cela étape par étape. Prêts ? C'est parti !",
  de: "Willkommen zurück, alle zusammen. Heute entdecken wir, wie Flüsse die Landschaft um uns herum formen. Haben Sie sich jemals gefragt, warum manche Täler breit sind und andere tief und schmal? Es hängt von drei Dingen ab: Geschwindigkeit, Gestein und Zeit. Schauen wir uns das Schritt für Schritt an. Bereit? Los geht's!",
  pt: 'Bem-vindos de volta, pessoal. Hoje vamos descobrir como os rios dão forma à terra à nossa volta. Já se perguntaram por que alguns vales são largos e outros, fundos e estreitos? Tudo depende de três coisas: a velocidade, a rocha e o tempo. Vamos ver isso com calma, passo a passo. Prontos? Vamos lá!',
  it: 'Bentornati a tutti. Oggi scopriremo insieme come i fiumi danno forma alla terra che ci circonda. Vi siete mai chiesti perché alcune valli sono larghe e altre profonde e strette? Tutto dipende da tre cose: la velocità, la roccia e il tempo. Vediamolo con calma, passo dopo passo. Pronti? Si parte!',
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

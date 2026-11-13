// Throwaway spike: runs Kokoro off the main thread so the page stays responsive.
// Not part of the app. Loads kokoro-js's self-contained browser bundle from jsDelivr.
import { KokoroTTS, TextSplitterStream } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js'

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
let tts = null
let cancelled = false

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') await load(data)
    else if (data.type === 'speak') await speak(data)
    else if (data.type === 'stop') cancelled = true
    else if (data.type === 'addVoice') await addVoice(data)
  } catch (error) {
    self.postMessage({ type: 'error', id: data.id, message: String(error?.message ?? error) })
  }
}

async function load({ dtype, device }) {
  const started = performance.now()
  tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype,
    device,
    progress_callback: (p) => self.postMessage({ type: 'progress', progress: p }),
  })
  acceptCustomVoices()
  self.postMessage({ type: 'loaded', voices: tts.voices, ms: performance.now() - started })
}

// Custom voicepacks. kokoro-js checks a voice id with `_validate_voice` (against a frozen
// table, so we can't add to it) and, before fetching a voice from Hugging Face, looks in
// the Cache API cache "kokoro-voices" under that URL. So: put our .bin in the cache under a
// made-up id, and wrap `_validate_voice` on this instance to accept our ids. The first
// letter of the id is the accent (a = American, b = British). No fork of the library.
const voiceUrl = (id) => `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${id}.bin`
const custom = {}

function acceptCustomVoices() {
  const original = tts._validate_voice.bind(tts)
  tts._validate_voice = (id) => (Object.hasOwn(custom, id) ? id.at(0) : original(id))
}

async function addVoice({ id, name, accent, buffer }) {
  try {
    const cache = await caches.open('kokoro-voices')
    if (buffer) await cache.put(voiceUrl(id), new Response(buffer))
    else if (!(await cache.match(voiceUrl(id)))) {
      self.postMessage({ type: 'voiceMissing', id, name })
      return
    }
    custom[id] = {
      name,
      language: accent === 'b' ? 'en-gb' : 'en-us',
      gender: 'Custom',
      traits: '',
      targetQuality: '-',
      overallGrade: 'custom',
    }
    self.postMessage({ type: 'voiceAdded', id, name, voices: { ...custom, ...tts.voices } })
  } catch (error) {
    self.postMessage({ type: 'voiceError', id, name, message: String(error?.message ?? error) })
  }
}

// One slide = one script. generate() truncates past ~510 tokens, so a long script is
// split into sentences with TextSplitterStream and the pieces are joined, which is what
// the app would have to do too.
async function speak({ id, text, voice, speed }) {
  cancelled = false
  const started = performance.now()
  const splitter = new TextSplitterStream()
  const stream = tts.stream(splitter, { voice, speed })
  splitter.push(text)
  splitter.close()
  const pieces = []
  let sampleRate = 24000
  let chunks = 0
  self.postMessage({ type: 'log', message: 'stream start ' + Math.round(performance.now() - started) })
  for await (const { text: piece, audio } of stream) {
    self.postMessage({ type: 'log', message: 'chunk ' + Math.round(performance.now() - started) + 'ms: ' + piece.slice(0, 40) })
    if (cancelled) {
      self.postMessage({ type: 'cancelled', id })
      return
    }
    pieces.push(audio.audio)
    sampleRate = audio.sampling_rate
    chunks++
  }
  const total = pieces.reduce((n, p) => n + p.length, 0)
  const joined = new Float32Array(total)
  let offset = 0
  for (const p of pieces) {
    joined.set(p, offset)
    offset += p.length
  }
  self.postMessage(
    { type: 'done', id, audio: joined, sampleRate, chunks, ms: performance.now() - started },
    [joined.buffer],
  )
}

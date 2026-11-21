import { downloadClip, submitTalk, uploadMedia, waitForTalk } from './wavespeed'
import { openClip, type DecodedClip } from './drawClip'

/*
  Browser glue between the saved face photo, WaveSpeed and the decoder: turns one narration file into
  a decoded talking clip. Reached only through `import('@/video/generate')`. The photo is fetched and
  uploaded once for the whole run (the intro and outro share it); each clip uploads its own audio.
  A failure that is not a cancel is `null`, which the pipeline answers with a title card; a cancel is
  rethrown so it is never mistaken for one. Nothing here retries a submit (each is a billed job).
*/

const EXT_BY_TYPE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

function isAbort(err: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (err instanceof DOMException && err.name === 'AbortError')
}

export function createTalker(o: { photoUrl: string }): {
  talk(file: Blob, signal: AbortSignal): Promise<DecodedClip | null>
} {
  // One upload shared by every clip. A pending one is shared so the intro and outro do not upload
  // twice; a failed one is forgotten so a later clip may try again (uploads are free).
  let photo: Promise<string> | null = null
  const photoOnWavespeed = (signal: AbortSignal): Promise<string> => {
    if (!photo) {
      const started = (async () => {
        const res = await fetch(o.photoUrl, { signal })
        if (!res.ok) throw new Error(`the face photo could not be read (${res.status})`)
        const blob = await res.blob()
        return uploadMedia(blob, `face.${EXT_BY_TYPE[blob.type] ?? 'jpg'}`, signal)
      })()
      photo = started
      started.catch(() => {
        if (photo === started) photo = null
      })
    }
    return photo
  }

  return {
    async talk(file, signal) {
      try {
        const imageUrl = await photoOnWavespeed(signal)
        const audioUrl = await uploadMedia(file, 'clip.wav', signal)
        const id = await submitTalk({ imageUrl, audioUrl, signal })
        const clipUrl = await waitForTalk(id, signal)
        // A clip nobody can decode comes back `null`, and a title card takes its place.
        const clip = await openClip(await downloadClip(clipUrl, signal))
        // A cancel during the decode check: nobody will take this clip, so free it.
        if (signal.aborted) {
          clip?.dispose()
          throw new DOMException('Aborted', 'AbortError')
        }
        return clip
      } catch (err) {
        if (isAbort(err, signal)) throw err
        console.warn('[avatar]', err)
        return null
      }
    },
  }
}

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { supabase } from '@/lib/supabaseClient'
import {
  FACE_TYPES,
  deleteFacePhoto,
  faceUploadProblem,
  saveFacePhoto,
  supabaseFacePorts,
  type FacePhoto,
} from '@/avatar/facePhoto'

/*
  The body of the dialog's "Talking intro & outro" step: the switch, the face photo (with the
  consent it needs before an upload) and what the clips will cost. The dialog owns the switch and
  the photo and works out the blocker and the cost line; this only draws them and does the photo's
  upload and removal, showing a failure of either inline.

  Remove needs a second press. It lives in this component's state, so closing the dialog resets it.
*/

const CONSENT = 'This is my face, or I have permission to use it.'
const REMOVE_FAILED = 'Your face photo could not be removed. Try again.'

export function FaceStep({
  uid,
  photo,
  onPhoto,
  checked,
  onToggle,
  blocker,
  costLine,
  checking = false,
}: {
  uid: string | null
  photo: FacePhoto | null
  onPhoto: (photo: FacePhoto | null) => void
  /** The effective state: switched on and nothing stops it. */
  checked: boolean
  onToggle: (on: boolean) => void
  blocker: string | null
  costLine: string | null
  /** The saved photo is still being looked up: nothing to pick or replace yet, and no blocker to read. */
  checking?: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [consented, setConsented] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = uploading || removing
  const showForm = !checking && (photo === null || replacing)
  const problem = file ? faceUploadProblem(file, consented) : null
  const canUpload = file !== null && problem === null && uid !== null && supabase !== null && !busy

  function closeForm() {
    setReplacing(false)
    setFile(null)
    setConsented(false)
  }

  async function upload() {
    const client = supabase
    if (!file || !client || !uid || !canUpload) return
    setUploading(true)
    setError(null)
    try {
      onPhoto(await saveFacePhoto(supabaseFacePorts(client), uid, file, consented))
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The photo could not be saved. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function remove() {
    const client = supabase
    if (!client || !uid || busy) return
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    setRemoving(true)
    setError(null)
    try {
      const result = await deleteFacePhoto(supabaseFacePorts(client), uid)
      if (result.error) {
        // `deleteFacePhoto`'s message is written for deleting an account; this is only the photo.
        setError(REMOVE_FAILED)
        return
      }
      onPhoto(null)
      setConfirmRemove(false)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer items-start gap-2 text-sm font-medium text-app-foreground has-[:disabled]:cursor-not-allowed">
          <input
            id="voice-face-switch"
            type="checkbox"
            checked={checked}
            disabled={blocker !== null || checking}
            onChange={(e) => onToggle(e.target.checked)}
            className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-app-accent disabled:cursor-not-allowed"
          />
          Add a talking intro &amp; outro
        </label>
        {checking && <p className="pl-5 text-xs text-app-muted">Checking for your photo…</p>}
        {!checking && blocker && <p className="pl-5 text-xs text-app-muted">{blocker}</p>}
        {checked && costLine && <p className="pl-5 text-xs text-app-muted">{costLine}</p>}
      </div>

      {!checking && photo && !replacing && (
        <div className="flex items-center gap-3">
          <img src={photo.url} alt="Your face photo" className="size-16 shrink-0 rounded-full border border-app-border object-cover" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmRemove(false)
                setError(null)
                setReplacing(true)
              }}
              disabled={busy}
            >
              Replace
            </Button>
            <Button variant="ghost" onClick={() => void remove()} disabled={busy} loading={removing}>
              {confirmRemove ? 'Press again to remove' : 'Remove'}
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="flex flex-col gap-2 rounded-app-sm border border-app-border bg-app-surface p-3">
          <input
            type="file"
            aria-label="Face photo"
            accept={FACE_TYPES.join(',')}
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs text-app-foreground file:mr-3 file:cursor-pointer file:rounded-app-sm file:border file:border-app-border file:bg-app-background file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-app-foreground"
          />
          <label className="flex cursor-pointer items-start gap-2 text-xs text-app-foreground">
            <input
              type="checkbox"
              checked={consented}
              disabled={busy}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-app-accent"
            />
            {CONSENT}
          </label>
          {problem && <p className="text-xs text-app-danger-text">{problem}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void upload()} disabled={!canUpload}>
              {uploading ? <Spinner /> : null}
              Upload photo
            </Button>
            {replacing && (
              <Button variant="ghost" onClick={closeForm} disabled={busy}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-app-danger-text">
          {error}
        </p>
      )}
    </div>
  )
}

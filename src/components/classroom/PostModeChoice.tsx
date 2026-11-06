import { Radios } from '@/components/quiz/Radios'
import { READINESS_REASON, type LessonReadiness } from '@/lesson/readiness'
import type { PostingMode } from '@/lesson/rows'

/**
 * "Post as quiz / Post as lesson". A lesson needs the deck's narrated video with its slide
 * timings, so the option stays off, saying why, until `readiness` says it is ready (and with no
 * reason while that is still being looked up).
 */
export function PostModeChoice({
  mode,
  onChange,
  readiness,
  disabled = false,
}: {
  mode: PostingMode
  onChange: (mode: PostingMode) => void
  readiness: LessonReadiness | 'loading'
  disabled?: boolean
}) {
  const lessonReady = readiness === 'ready'
  return (
    <Radios<PostingMode>
      label="How to post"
      value={mode}
      onChange={onChange}
      disabled={disabled}
      options={[
        { value: 'quiz', label: 'Post as quiz' },
        {
          value: 'lesson',
          label: 'Post as lesson',
          disabled: !lessonReady,
          title: readiness === 'loading' || lessonReady ? undefined : READINESS_REASON[readiness],
        },
      ]}
    />
  )
}

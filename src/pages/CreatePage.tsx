import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePresentationStore } from '@/store/presentationStore'
import { GeminiProvider } from '@/ai/geminiProvider'
import { AIProviderError, type GenerationBrief } from '@/ai/provider'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'

const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? '').trim()

type DetailLevel = GenerationBrief['detailLevel']
type Tone = GenerationBrief['tone']

const DETAIL_OPTIONS: { value: DetailLevel; label: string; description: string }[] = [
  { value: 'simplified', label: 'Simplified', description: 'Quick & easy to skim' },
  { value: 'balanced', label: 'Balanced', description: 'Clear with real substance' },
  { value: 'detailed', label: 'Detailed', description: 'Deep and thorough' },
]

const TONE_OPTIONS: { value: Tone; label: string; description: string }[] = [
  { value: 'professional', label: 'Professional', description: 'Polished & business-appropriate' },
  { value: 'casual', label: 'Casual', description: 'Warm & conversational' },
  { value: 'bold', label: 'Bold', description: 'Punchy & high-energy' },
]

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-start rounded-app-sm bg-app-surface px-4 py-3 text-sm text-app-foreground">
      {children}
    </div>
  )
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[85%] self-end rounded-app-sm bg-app-accent px-4 py-3 text-sm text-app-accent-foreground">
      {children}
    </div>
  )
}

function ChipGroup<T extends string>({
  options,
  onSelect,
}: {
  options: { value: T; label: string; description: string }[]
  onSelect: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 self-start">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelect(opt.value)}
          className="cursor-pointer rounded-app-sm border border-app-border bg-app-background px-4 py-2 text-left hover:border-app-accent"
        >
          <div className="text-sm font-medium text-app-foreground">{opt.label}</div>
          <div className="text-xs text-app-muted">{opt.description}</div>
        </button>
      ))}
    </div>
  )
}

export function CreatePage() {
  const navigate = useNavigate()
  const { createDeckFromGeneration, createDeck } = usePresentationStore()

  const [topic, setTopic] = useState<string | null>(null)
  const [topicDraft, setTopicDraft] = useState('')
  const [slideCount, setSlideCount] = useState<number | 'auto' | null>(null)
  const [slideCountDraft, setSlideCountDraft] = useState('8')
  const [audience, setAudience] = useState<string | null>(null)
  const [audienceDraft, setAudienceDraft] = useState('')
  const [detailLevel, setDetailLevel] = useState<DetailLevel | null>(null)
  const [tone, setTone] = useState<Tone | null>(null)
  const [guidance, setGuidance] = useState<string | null>(null)
  const [guidanceDraft, setGuidanceDraft] = useState('')

  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [topic, slideCount, audience, detailLevel, tone, guidance, isGenerating, error])

  async function startGeneration(
    finalTopic: string,
    count: number | 'auto',
    finalAudience: string,
    level: DetailLevel,
    finalTone: Tone,
    finalGuidance: string,
  ) {
    if (!GEMINI_API_KEY) {
      setError('Add VITE_GEMINI_API_KEY to your .env file and restart the dev server.')
      return
    }
    setIsGenerating(true)
    setError(null)
    try {
      const provider = new GeminiProvider(GEMINI_API_KEY)
      const deck = await provider.generateDeck(finalTopic, {
        slideCount: count,
        audience: finalAudience,
        detailLevel: level,
        tone: finalTone,
        guidance: finalGuidance,
      })
      const id = await createDeckFromGeneration(deck)
      void navigate(`/deck/${id}`)
    } catch (err) {
      setError(err instanceof AIProviderError ? err.message : 'Generation failed. Try again.')
      setIsGenerating(false)
    }
  }

  function handleTopicSubmit(e: FormEvent) {
    e.preventDefault()
    if (topicDraft.trim()) setTopic(topicDraft.trim())
  }

  function handleTopicKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (topicDraft.trim()) setTopic(topicDraft.trim())
    }
  }

  const parsedSlideCount = parseInt(slideCountDraft, 10)
  const isSlideCountValid = Number.isInteger(parsedSlideCount) && parsedSlideCount >= 1

  function handleSlideCountSubmit(e: FormEvent) {
    e.preventDefault()
    if (isSlideCountValid) setSlideCount(parsedSlideCount)
  }

  function handleAutoSlideCount() {
    setSlideCount('auto')
  }

  function handleAudienceSubmit(e: FormEvent) {
    e.preventDefault()
    if (audienceDraft.trim()) setAudience(audienceDraft.trim())
  }

  function selectTone(t: Tone) {
    setTone(t)
  }

  function handleGuidanceSubmit(e: FormEvent) {
    e.preventDefault()
    submitGuidance(guidanceDraft.trim())
  }

  function submitGuidance(finalGuidance: string) {
    setGuidance(finalGuidance)
    if (topic && slideCount && audience && detailLevel && tone) {
      void startGeneration(topic, slideCount, audience, detailLevel, tone, finalGuidance)
    }
  }

  async function handleSkip() {
    const id = await createDeck()
    void navigate(`/deck/${id}`)
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-canvas">
      <div className="flex items-center px-6 py-4">
        <Link to="/" className="text-sm text-app-muted hover:text-app-foreground">
          ← Home
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 pb-16">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-app bg-app-background p-8 shadow-app">
          <AssistantBubble>What's this presentation about?</AssistantBubble>
          {topic === null ? (
            <form onSubmit={handleTopicSubmit} className="flex w-full flex-col gap-2 self-start">
              <Textarea
                rows={3}
                autoFocus
                placeholder="e.g. a pitch for a solar panel startup called Helios"
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={handleTopicKeyDown}
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="cursor-pointer text-xs text-app-muted hover:text-app-foreground hover:underline"
                >
                  Skip and start with a blank canvas instead
                </button>
                <Button type="submit" variant="primary" disabled={!topicDraft.trim()}>
                  Next
                </Button>
              </div>
            </form>
          ) : (
            <UserBubble>{topic}</UserBubble>
          )}

          {topic !== null && (
            <>
              <AssistantBubble>How many slides?</AssistantBubble>
              {slideCount === null ? (
                <form onSubmit={handleSlideCountSubmit} className="flex w-full max-w-[220px] flex-col gap-2 self-start">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      autoFocus
                      value={slideCountDraft}
                      onChange={(e) => setSlideCountDraft(e.target.value)}
                    />
                    <Button type="submit" variant="primary" disabled={!isSlideCountValid}>
                      Next
                    </Button>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoSlideCount}
                    className="cursor-pointer self-start text-xs text-app-muted hover:text-app-foreground hover:underline"
                  >
                    Not sure — let AI decide
                  </button>
                </form>
              ) : (
                <UserBubble>{slideCount === 'auto' ? "Let AI decide" : slideCount}</UserBubble>
              )}
            </>
          )}

          {slideCount !== null && (
            <>
              <AssistantBubble>Who's this presentation for?</AssistantBubble>
              {audience === null ? (
                <form onSubmit={handleAudienceSubmit} className="flex w-full gap-2 self-start">
                  <Input
                    autoFocus
                    placeholder="e.g. investors, customers, my team, students..."
                    value={audienceDraft}
                    onChange={(e) => setAudienceDraft(e.target.value)}
                  />
                  <Button type="submit" variant="primary" disabled={!audienceDraft.trim()}>
                    Next
                  </Button>
                </form>
              ) : (
                <UserBubble>{audience}</UserBubble>
              )}
            </>
          )}

          {audience !== null && (
            <>
              <AssistantBubble>How much detail should it go into?</AssistantBubble>
              {detailLevel === null ? (
                <ChipGroup options={DETAIL_OPTIONS} onSelect={setDetailLevel} />
              ) : (
                <UserBubble>{DETAIL_OPTIONS.find((o) => o.value === detailLevel)?.label}</UserBubble>
              )}
            </>
          )}

          {detailLevel !== null && (
            <>
              <AssistantBubble>What tone fits best?</AssistantBubble>
              {tone === null ? (
                <ChipGroup options={TONE_OPTIONS} onSelect={selectTone} />
              ) : (
                <UserBubble>{TONE_OPTIONS.find((o) => o.value === tone)?.label}</UserBubble>
              )}
            </>
          )}

          {tone !== null && (
            <>
              <AssistantBubble>Anything specific it should focus on—or steer clear of? (optional)</AssistantBubble>
              {guidance === null ? (
                <form onSubmit={handleGuidanceSubmit} className="flex w-full flex-col gap-2 self-start">
                  <Textarea
                    rows={2}
                    autoFocus
                    placeholder="e.g. don't make up statistics, stick to the facts I gave you; or emphasize the pricing story"
                    value={guidanceDraft}
                    onChange={(e) => setGuidanceDraft(e.target.value)}
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => submitGuidance('')}
                      className="cursor-pointer text-xs text-app-muted hover:text-app-foreground hover:underline"
                    >
                      Skip
                    </button>
                    <Button type="submit" variant="primary">
                      Generate
                    </Button>
                  </div>
                </form>
              ) : (
                <UserBubble>{guidance || '(none)'}</UserBubble>
              )}
            </>
          )}

          {guidance !== null && (
            <AssistantBubble>
              {isGenerating && 'Generating your presentation…'}
              {!isGenerating && error && (
                <div className="flex flex-col gap-2">
                  <span className="text-red-600">{error}</span>
                  <Button
                    variant="secondary"
                    className="self-start"
                    onClick={() => startGeneration(topic!, slideCount!, audience!, detailLevel!, tone!, guidance)}
                  >
                    Try again
                  </Button>
                </div>
              )}
              {!isGenerating && !error && 'All set — taking you to your presentation…'}
            </AssistantBubble>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}

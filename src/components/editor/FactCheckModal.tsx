import type { ReactNode } from 'react'
import type { ClaimType } from '@/generation/schemas'
import type { FactCheck, FactCheckItem } from '@/generation/factCheck'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/*
  The editor's fact check: the claims the AI wrote, by slide, unsourced first.

  It offers no AI action on purpose ("generate once"): a teacher fixes a claim by going to
  the slide and editing it, or marks it checked once they have. Which claims land in which
  group is decided by `readFactCheck`; this only draws them.
*/

const TYPE_LABEL: Record<ClaimType, string> = {
  statistic: 'Statistic',
  historical: 'Historical',
  scientific: 'Scientific',
  comparison: 'Comparison',
  definition: 'Definition',
  general_fact: 'Fact',
  opinion: 'Opinion',
}

const INTRO: Record<FactCheck['research'], string> = {
  ok: 'Claims the AI wrote, checked against the sources its web research found. Check anything without a source before you present.',
  failed:
    "Web research didn't work for this deck, so none of these claims were checked against sources. Check them before you present.",
  skipped: 'You asked for your own material only, so nothing was checked against the web.',
}

export function FactCheckModal({
  fc,
  saveFailed,
  onClose,
  onGoToSlide,
  onMarkChecked,
}: {
  fc: FactCheck
  /** The last "I've checked this" could not be saved. */
  saveFailed: boolean
  onClose: () => void
  onGoToSlide: (cardId: string) => void
  onMarkChecked: (claimId: string) => void
}) {
  const sourced = fc.items.filter((i) => i.verified)
  const checked = fc.items.filter((i) => !i.verified && i.reviewed)

  return (
    <Modal title="Fact check" onClose={onClose} maxWidth="max-w-xl">
      <div className="flex flex-col gap-5">
        <p className="text-sm text-app-muted">{INTRO[fc.research]}</p>
        {saveFailed && (
          <p role="alert" className="text-xs text-app-highlight-text">
            Couldn&apos;t save that check. It will show again next time you open this deck.
          </p>
        )}

        {fc.research !== 'skipped' && (
          <Group title={`No source found (${fc.needsCheck.length})`}>
            {fc.needsCheck.length === 0 ? (
              <p className="text-sm text-app-muted">All claims checked.</p>
            ) : (
              fc.needsCheck.map((i) => (
                <Claim key={i.claimId} item={i} onGoToSlide={onGoToSlide}>
                  <Button variant="secondary" className="self-start px-2.5 py-1 text-xs" onClick={() => onMarkChecked(i.claimId)}>
                    I&apos;ve checked this
                  </Button>
                </Claim>
              ))
            )}
          </Group>
        )}

        {sourced.length > 0 && (
          <Group title={`Sourced (${sourced.length})`}>
            {sourced.map((i) => (
              <Claim key={i.claimId} item={i} onGoToSlide={onGoToSlide}>
                <ul className="flex flex-col gap-0.5 text-xs text-app-muted">
                  {i.sources.map((s, n) => (
                    <li key={n}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-app-accent-text underline">
                          {s.publisher || s.title}
                        </a>
                      ) : (
                        <span>{s.publisher || s.title}</span>
                      )}
                      {s.publisher && ` · ${s.title}`}
                    </li>
                  ))}
                </ul>
              </Claim>
            ))}
          </Group>
        )}

        {checked.length > 0 && (
          <Group title={`Checked by you (${checked.length})`}>
            {checked.map((i) => (
              <Claim key={i.claimId} item={i} onGoToSlide={onGoToSlide} />
            ))}
          </Group>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-app-foreground">{title}</h3>
      <ul className="flex flex-col divide-y divide-app-border rounded-app-sm border border-app-border">{children}</ul>
    </section>
  )
}

function Claim({
  item,
  onGoToSlide,
  children,
}: {
  item: FactCheckItem
  onGoToSlide: (cardId: string) => void
  children?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center gap-2 text-xs text-app-muted">
        <button
          type="button"
          onClick={() => onGoToSlide(item.cardId)}
          className="cursor-pointer rounded-sm font-medium text-app-accent-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          Slide {item.slideNumber}
        </button>
        <span aria-hidden="true">·</span>
        <span>{TYPE_LABEL[item.type]}</span>
      </div>
      <p className="text-sm leading-snug text-app-foreground">{item.statement}</p>
      {children}
    </li>
  )
}

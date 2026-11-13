import { useState, type ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { loadAdminOverview } from '@/admin/api'
import {
  DEFAULT_RANGE,
  RANGE_KEYS,
  RANGE_LABEL,
  entriesOf,
  funnelSteps,
  percentOf,
  type AdminOverview,
  type Bucket,
  type CountPair,
  type RangeKey,
} from '@/admin/overview'
import { ADMIN_SECTIONS, DEFAULT_ADMIN_SECTION, adminPath, parseAdminSection, type AdminSectionId } from '@/admin/sections'
import { useAsync } from '@/classroom/useAsync'
import { ROLE_LABEL, ROLES } from '@/classroom/roles'
import { useAuthStore } from '@/store/authStore'
import { DashboardShell } from '@/components/home/DashboardShell'
import { LoadError, Panel, RowsSkeleton } from '@/components/classroom/Panel'
import { BarList, Card, RangePicker, StatTile, TimeChart, type ChartSeries } from '@/components/admin/AdminCharts'
import { Button } from '@/components/ui/Button'

/*
  Site-wide counts for developers (migrations 0019/0020), one section per rail
  link (`/admin/<section>`) so no view is a long scroll. One time range for
  every section (state here: the page stays mounted while switching sections);
  tiles compare against the same length of time just before it. Counts and
  categories only: `admin_overview()` returns no names, emails, titles or
  typed text.
*/

const QUIZ_TYPE_LABEL: Record<string, string> = {
  multiple_choice: 'Multiple choice',
  fill_blank: 'Fill in the blank',
  true_false: 'True / false',
  mixed: 'Mixed',
}

const RESEARCH_LABEL: Record<string, string> = {
  ok: 'Found sources',
  failed: 'Failed',
  skipped: 'Skipped (own material)',
}

const SLIDE_BUCKETS = ['0', '1', '2', '3', '4', '5', '6', '7', '8+']

const RANGE_OPTIONS = RANGE_KEYS.map((key) => ({ key, label: RANGE_LABEL[key] }))

export function AdminPage() {
  const { section: param } = useParams<{ section: string }>()
  const section = parseAdminSection(param)
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE)
  const { state, reload } = useAsync(() => loadAdminOverview(range), `${userId}:${range}`)

  if (!section) return <Navigate to={adminPath(DEFAULT_ADMIN_SECTION)} replace />
  const meta = ADMIN_SECTIONS.find((s) => s.id === section)!
  // the previous range's numbers stay up while the new ones load
  const updating = state.status === 'ready' && state.data.range.key !== range

  return (
    <DashboardShell title={meta.label} subtitle={meta.blurb}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RangePicker value={range} options={RANGE_OPTIONS} onChange={setRange} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-app-muted" aria-live="polite">
              {updating ? 'Updating…' : state.status === 'ready' ? asOf(state.data.generatedAt) : ''}
            </span>
            <Button variant="secondary" onClick={reload}>
              Refresh
            </Button>
          </div>
        </div>

        {state.status === 'loading' ? (
          <Panel>
            <RowsSkeleton />
          </Panel>
        ) : state.status === 'error' ? (
          <Panel>
            <LoadError message={state.error} onRetry={reload} />
          </Panel>
        ) : (
          <div className={`flex flex-col gap-4 transition-opacity ${updating ? 'opacity-60' : ''}`}>
            <SectionView section={section} data={state.data} range={range} />
            <p className="text-xs text-app-muted">
              Counts only: no names, emails or anything people typed. Days are in UTC; the newest{' '}
              {state.data.range.unit} is still running.
            </p>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}

function asOf(generatedAt: string): string {
  const at = generatedAt ? new Date(generatedAt) : null
  return at && !Number.isNaN(at.getTime()) ? `As of ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''
}

interface SectionProps {
  data: AdminOverview
  /** "previous 30 days" */
  vs: string
  inRange: string
}

function SectionView({ section, data, range }: { section: AdminSectionId; data: AdminOverview; range: RangeKey }) {
  const props: SectionProps = { data, vs: `previous ${RANGE_LABEL[range]}`, inRange: `in ${RANGE_LABEL[range]}` }
  switch (section) {
    case 'people':
      return <PeopleSection {...props} />
    case 'decks':
      return <DecksSection {...props} />
    case 'quality':
      return <QualitySection {...props} />
    case 'classroom':
      return <ClassroomSection {...props} />
    case 'voice':
      return <VoiceSection {...props} />
  }
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
}

function Pair({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 lg:grid-cols-2">{children}</div>
}

/** One chart's buckets from the shared series. */
function pick(series: Bucket[], keys: (keyof Bucket)[]) {
  return series.map((b) => ({ start: b.start, values: keys.map((k) => Number(b[k]) || 0) }))
}

function total(series: Bucket[], keys: (keyof Bucket)[]): number {
  return series.reduce((sum, b) => sum + keys.reduce((s, k) => s + (Number(b[k]) || 0), 0), 0)
}

/** A share in each window, for comparing rates in points; null where the base is empty. */
function rate(part: CountPair, whole: CountPair) {
  return {
    current: whole.current > 0 ? part.current / whole.current : null,
    previous: whole.previous > 0 ? part.previous / whole.previous : null,
    asPoints: true,
  }
}

const SIGNUP_SERIES: ChartSeries[] = [
  { key: 'general', label: 'General' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'student', label: 'Student' },
]

function PeopleSection({ data, vs, inRange }: SectionProps) {
  const { compare, totals, funnel, series, range } = data
  return (
    <>
      <Tiles>
        <StatTile label={`Sign-ups ${inRange}`} value={compare.signups.current} compare={compare.signups} previousLabel={vs} />
        <StatTile label={`Active accounts ${inRange}`} value={compare.active.current} compare={compare.active} previousLabel={vs} />
        <StatTile label="Accounts, all time" value={totals.accounts} />
        <StatTile
          label="Made a deck, all time"
          value={`${percentOf(funnel.madeDeck, funnel.signedUp)}%`}
          hint={`${funnel.madeDeck} of ${funnel.signedUp} accounts`}
        />
      </Tiles>
      <Pair>
        <Card title="Sign-ups by account type" aside={`${total(series, ['signupsGeneral', 'signupsTeacher', 'signupsStudent'])} ${inRange}`}>
          <TimeChart
            buckets={pick(series, ['signupsGeneral', 'signupsTeacher', 'signupsStudent'])}
            series={SIGNUP_SERIES}
            unit={range.unit}
            noun="sign-ups"
          />
        </Card>
        <Card title="Active accounts" aside={`Per ${range.unit}`}>
          <TimeChart buckets={pick(series, ['active'])} series={[{ key: 'active', label: 'Active' }]} unit={range.unit} noun="active accounts" />
        </Card>
      </Pair>
      <Pair>
        <Card title="Account types" aside="All time">
          <BarList entries={entriesOf(totals.byRole, ROLE_LABEL, ROLES)} />
        </Card>
        <Card title="How far people get" aside="All time, share of all accounts">
          <ol className="grid grid-cols-2 gap-3">
            {funnelSteps(funnel).map((step, i) => (
              <li key={step.label} className="rounded-app-sm bg-app-surface/50 p-3">
                <div className="text-xs text-app-muted">
                  {i + 1}. {step.label}
                </div>
                <div className="mt-1 text-xl font-bold text-app-foreground tabular-nums">{step.value}</div>
                <div className="text-xs text-app-muted tabular-nums">{step.ofTotal}%</div>
              </li>
            ))}
          </ol>
        </Card>
      </Pair>
      <p className="text-xs text-app-muted">
        Active = made or edited a deck, made a quiz, submitted a quiz or answered a lesson question. A deck counts at its
        creation and its latest edit only, so activity is a floor, not an exact count.
      </p>
    </>
  )
}

function DecksSection({ data, vs, inRange }: SectionProps) {
  const { compare, totals, series, range, breakdowns } = data
  return (
    <>
      <Tiles>
        <StatTile label={`Decks made ${inRange}`} value={compare.decks.current} compare={compare.decks} previousLabel={vs} />
        <StatTile label={`Narrated videos ${inRange}`} value={compare.videos.current} compare={compare.videos} previousLabel={vs} />
        <StatTile label="Decks, all time" value={totals.decks} />
        <StatTile label="Average slides, all time" value={totals.averageSlides} />
      </Tiles>
      <Pair>
        <Card title="Decks made" aside={`${compare.decks.current} ${inRange}`}>
          <TimeChart
            buckets={series.map((b) => ({
              start: b.start,
              values: [b.decksManual + b.decksResearchOk + b.decksResearchFailed + b.decksResearchSkipped],
            }))}
            series={[{ key: 'decks', label: 'Decks' }]}
            unit={range.unit}
            noun="decks"
          />
        </Card>
        <Card title="Narrated videos made" aside={`${compare.videos.current} ${inRange}`}>
          <TimeChart buckets={pick(series, ['videos'])} series={[{ key: 'videos', label: 'Videos' }]} unit={range.unit} noun="videos" />
        </Card>
      </Pair>
      <Card title="Slides per deck" aside={`Decks made ${inRange}`}>
        <BarList entries={entriesOf(breakdowns.slideCounts, {}, SLIDE_BUCKETS).filter((e) => e.value > 0)} empty="No decks made in this range" />
      </Card>
    </>
  )
}

const RESEARCH_SERIES: ChartSeries[] = [
  { key: 'ok', label: 'Found sources' },
  { key: 'failed', label: 'Research failed' },
  { key: 'skipped', label: 'Own material' },
]

function QualitySection({ data, vs, inRange }: SectionProps) {
  const { compare, series, range, breakdowns } = data
  const flagTotal = Object.values(breakdowns.flags).reduce((a, b) => a + b, 0)
  const failedRate = rate(compare.researchFailed, compare.aiDecks)
  const unsourcedRate = rate(compare.unsourcedClaims, compare.claims)
  return (
    <>
      <Tiles>
        <StatTile label={`AI decks ${inRange}`} value={compare.aiDecks.current} compare={compare.aiDecks} previousLabel={vs} />
        <StatTile
          label="Research failed"
          value={`${percentOf(compare.researchFailed.current, compare.aiDecks.current)}%`}
          compare={failedRate}
          previousLabel={vs}
          hint={`${compare.researchFailed.current} of ${compare.aiDecks.current} AI decks`}
        />
        <StatTile
          label="Claims without a source"
          value={`${percentOf(compare.unsourcedClaims.current, compare.claims.current)}%`}
          compare={unsourcedRate}
          previousLabel={vs}
          hint={`${compare.unsourcedClaims.current} of ${compare.claims.current} claims`}
        />
        <StatTile
          label="Checked by hand"
          value={breakdowns.reviewedClaims}
          hint={`${percentOf(breakdowns.reviewedClaims, compare.unsourcedClaims.current)}% of unsourced, ${inRange}`}
        />
      </Tiles>
      <Card title="AI decks by research result" aside={`${compare.aiDecks.current} ${inRange}`}>
        <TimeChart
          buckets={pick(series, ['decksResearchOk', 'decksResearchFailed', 'decksResearchSkipped'])}
          series={RESEARCH_SERIES}
          unit={range.unit}
          noun="AI decks"
        />
      </Card>
      <Pair>
        <Card title="Quality flags left after repair" aside={`${flagTotal} ${inRange}`}>
          <BarList entries={entriesOf(breakdowns.flags)} empty="No flags" />
        </Card>
        <div className="flex flex-col gap-3">
          <Card title="Flag severity">
            <BarList entries={entriesOf(breakdowns.flagSeverity, {}, ['high', 'medium', 'low'])} empty="No flags" />
          </Card>
          <Card title="Research">
            <BarList entries={entriesOf(breakdowns.research, RESEARCH_LABEL)} empty="No AI decks in this range" />
          </Card>
        </div>
      </Pair>
      <Pair>
        <Card title="Kind of presentation" aside="As the AI read the brief">
          <BarList entries={entriesOf(breakdowns.presentationType)} empty="No AI decks in this range" />
        </Card>
        <Card title="Audience level" aside="As the AI read the brief">
          <BarList entries={entriesOf(breakdowns.audienceLevel, {}, ['beginner', 'intermediate', 'advanced'])} empty="No AI decks in this range" />
        </Card>
      </Pair>
    </>
  )
}

function ClassroomSection({ data, vs, inRange }: SectionProps) {
  const { compare, totals, series, range, breakdowns } = data
  const score = compare.averageScore
  return (
    <>
      <Tiles>
        <StatTile label={`Quizzes made ${inRange}`} value={compare.quizzes.current} compare={compare.quizzes} previousLabel={vs} />
        <StatTile label={`Submissions ${inRange}`} value={compare.attempts.current} compare={compare.attempts} previousLabel={vs} />
        <StatTile
          label={`Average score ${inRange}`}
          value={score.current === null ? '—' : `${Math.round(score.current * 100)}%`}
          compare={{ ...score, asPoints: true }}
          previousLabel={vs}
        />
        <StatTile label={`Classes made ${inRange}`} value={compare.classes.current} compare={compare.classes} previousLabel={vs} />
      </Tiles>
      <Pair>
        <Card title="Quizzes made" aside={`${compare.quizzes.current} ${inRange}`}>
          <TimeChart buckets={pick(series, ['quizzes'])} series={[{ key: 'quizzes', label: 'Quizzes' }]} unit={range.unit} noun="quizzes" />
        </Card>
        <Card title="Quiz submissions" aside={`${compare.attempts.current} ${inRange}`}>
          <TimeChart buckets={pick(series, ['attempts'])} series={[{ key: 'attempts', label: 'Submissions' }]} unit={range.unit} noun="submissions" />
        </Card>
      </Pair>
      <Pair>
        <Card title="Quiz types" aside={`Made ${inRange}`}>
          <BarList entries={entriesOf(breakdowns.quizTypes, QUIZ_TYPE_LABEL)} empty="No quizzes made in this range" />
        </Card>
        <Card title="Posted to classes" aside={inRange}>
          <BarList
            entries={[
              { key: 'quiz', label: 'As a quiz', value: breakdowns.postings.quiz },
              { key: 'lesson', label: 'As a lesson', value: breakdowns.postings.lesson },
            ]}
            empty="Nothing posted in this range"
          />
        </Card>
      </Pair>
      <Tiles>
        <StatTile label="Classes, all time" value={totals.classes} />
        <StatTile label="Students enrolled, all time" value={totals.studentsEnrolled} />
        <StatTile label="Quizzes, all time" value={totals.quizzes} />
        <StatTile label="Submissions, all time" value={totals.attempts} />
      </Tiles>
    </>
  )
}

function VoiceSection({ data, vs, inRange }: SectionProps) {
  const { compare, totals } = data
  return (
    <Tiles>
      <StatTile label={`Own voices recorded ${inRange}`} value={compare.clonedVoices.current} compare={compare.clonedVoices} previousLabel={vs} />
      <StatTile label="Own voices, all time" value={totals.clonedVoices} />
      <StatTile
        label="Voice set up, all time"
        value={totals.savedVoiceSettings}
        hint={`${percentOf(totals.savedVoiceSettings, totals.accounts)}% of accounts`}
      />
      <StatTile label="Narrated videos, all time" value={totals.videos} />
    </Tiles>
  )
}

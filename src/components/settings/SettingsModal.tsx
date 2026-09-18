import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AppearanceSection } from './AppearanceSection'
import { ProfileSection } from './ProfileSection'
import { PasswordSection } from './PasswordSection'
import { DangerSection } from './DangerSection'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-app-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-app-foreground">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Everything about the signed-in account and how the app looks, in one place.
 *
 * Replaces the rail footer's three separate controls (Account type, Log out and
 * a bare light/dark button). Each section owns its own state and submits
 * independently — there is no modal-wide Save, because these are unrelated
 * settings and one shared button would imply that leaving without pressing it
 * discards a theme change that was applied the moment it was clicked.
 */
export function SettingsModal({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Section title="Appearance">
          <AppearanceSection />
        </Section>

        <Section title="Profile">
          <ProfileSection />
        </Section>

        <Section title="Password">
          <PasswordSection />
        </Section>

        <Section title="Account">
          <div className="flex flex-col gap-5">
            <div className="flex justify-start">
              <Button variant="secondary" onClick={onSignOut}>
                Log out
              </Button>
            </div>
            <DangerSection />
          </div>
        </Section>
      </div>
    </Modal>
  )
}

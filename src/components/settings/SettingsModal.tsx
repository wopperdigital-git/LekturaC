import { useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SettingsIcon } from '@/components/home/AppSidebar'
import { AppearanceSection } from './AppearanceSection'
import { ProfileSection } from './ProfileSection'
import { PasswordSection } from './PasswordSection'
import { DangerSection } from './DangerSection'

export type SettingsTab = 'appearance' | 'profile' | 'security' | 'account'

interface TabConfig {
  key: SettingsTab
  label: string
  icon: (active: boolean) => ReactNode
}

const TABS: TabConfig[] = [
  {
    key: 'appearance',
    label: 'Appearance',
    icon: (active) => (
      <svg
        className={`size-4 transition-colors ${active ? 'text-app-accent-foreground' : 'text-app-muted group-hover:text-app-foreground'}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 2a8 8 0 100 16c1.1 0 2-.9 2-2a2 2 0 00-.6-1.4c-.4-.4-.6-.9-.6-1.4 0-1.1.9-2 2-2h1.6c2.4 0 3.6-1.5 3.6-3.6 0-3.1-3.6-5.6-8-5.6z" />
        <circle cx="6" cy="9" r="1" fill="currentColor" />
        <circle cx="8.5" cy="6.5" r="1" fill="currentColor" />
        <circle cx="12" cy="7.5" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: 'Profile',
    icon: (active) => (
      <svg
        className={`size-4 transition-colors ${active ? 'text-app-accent-foreground' : 'text-app-muted group-hover:text-app-foreground'}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="7" r="3.5" />
        <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      </svg>
    ),
  },
  {
    key: 'security',
    label: 'Security',
    icon: (active) => (
      <svg
        className={`size-4 transition-colors ${active ? 'text-app-accent-foreground' : 'text-app-muted group-hover:text-app-foreground'}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 2.5l6 2.5v5c0 4.5-3.5 7.5-6 8.5-2.5-1-6-4-6-8.5v-5l6-2.5z" />
        <circle cx="10" cy="9.5" r="1.5" />
        <path d="M10 11v2.5" />
      </svg>
    ),
  },
  {
    key: 'account',
    label: 'Account',
    icon: (active) => (
      <svg
        className={`size-4 transition-colors ${active ? 'text-app-accent-foreground' : 'text-app-muted group-hover:text-app-foreground'}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M7 8h6M7 12h4" />
      </svg>
    ),
  },
]

/**
 * Executive Settings Hub.
 * Features categorized tab navigation, rich theme preview thumbnails,
 * authenticated profile identity, credential security, and safe account deletion.
 */
export function SettingsModal({
  onClose,
  onSignOut,
  initialTab = 'appearance',
}: {
  onClose: () => void
  onSignOut: () => void
  /** Which tab it opens on; the editor's account menu opens it on Profile. */
  initialTab?: SettingsTab
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  return (
    <Modal
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-app-sm border border-app-accent/25 bg-app-accent/10 text-app-accent shadow-2xs">
            <SettingsIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-app-foreground sm:text-lg">
              Settings
            </h2>
            <p className="text-xs text-app-muted">
              Configure system appearance, profile details, and account security
            </p>
          </div>
        </div>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-6">
        {/* Segmented Tab Navigation */}
        <div
          role="tablist"
          aria-label="Settings categories"
          className="grid grid-cols-2 gap-1.5 rounded-app-sm border border-app-border bg-app-surface/60 p-1 sm:grid-cols-4"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                id={`tab-${tab.key}`}
                aria-selected={active}
                aria-controls={`panel-${tab.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                className={`group flex cursor-pointer items-center justify-center gap-2 rounded-app-sm px-3 py-2 text-xs font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                  active
                    ? 'bg-app-accent text-app-accent-foreground shadow-2xs font-semibold'
                    : 'text-app-muted hover:bg-app-surface hover:text-app-foreground'
                }`}
              >
                {tab.icon(active)}
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Tab Panels */}
        <div className="min-h-[280px]">
          {activeTab === 'appearance' && (
            <div
              role="tabpanel"
              id="panel-appearance"
              aria-labelledby="tab-appearance"
              className="flex flex-col gap-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-app-foreground">Theme & Interface</h3>
                <p className="mt-0.5 text-xs text-app-muted">
                  Select your interface theme preference for the dashboard, classroom, and editor chrome.
                </p>
              </div>
              <AppearanceSection />
            </div>
          )}

          {activeTab === 'profile' && (
            <div
              role="tabpanel"
              id="panel-profile"
              aria-labelledby="tab-profile"
              className="flex flex-col gap-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-app-foreground">Profile & Identity</h3>
                <p className="mt-0.5 text-xs text-app-muted">
                  Manage your public display name and view institutional role permissions.
                </p>
              </div>
              <ProfileSection />
            </div>
          )}

          {activeTab === 'security' && (
            <div
              role="tabpanel"
              id="panel-security"
              aria-labelledby="tab-security"
              className="flex flex-col gap-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-app-foreground">Password & Credentials</h3>
                <p className="mt-0.5 text-xs text-app-muted">
                  Update your authentication credentials to protect your presentations and classes.
                </p>
              </div>
              <PasswordSection />
            </div>
          )}

          {activeTab === 'account' && (
            <div
              role="tabpanel"
              id="panel-account"
              aria-labelledby="tab-account"
              className="flex flex-col gap-5"
            >
              {/* Session Management */}
              <div className="rounded-app-sm border border-app-border bg-app-surface/30 p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-app-surface text-app-foreground border border-app-border">
                    <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                      <path d="M6 2.5H3.5A1.5 1.5 0 002 4v8a1.5 1.5 0 001.5 1.5H6" />
                      <path d="M10.5 11.5L14 8l-3.5-3.5" />
                      <path d="M6 8h8" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-app-foreground">Session Management</h4>
                    <p className="mt-0.5 text-xs text-app-muted">
                      Sign out of your active session on this device. You can sign back in anytime with your credentials.
                    </p>
                  </div>
                </div>

                <div className="flex justify-start pt-1">
                  <Button variant="secondary" onClick={onSignOut} className="gap-2 text-xs">
                    <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M6 2.5H3.5A1.5 1.5 0 002 4v8a1.5 1.5 0 001.5 1.5H6M10.5 11.5L14 8l-3.5-3.5M6 8h8" />
                    </svg>
                    Log out of this device
                  </Button>
                </div>
              </div>

              {/* Danger Zone */}
              <DangerSection />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

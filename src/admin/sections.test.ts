import { describe, expect, it } from 'vitest'
import { ADMIN_SECTIONS, DEFAULT_ADMIN_SECTION, adminPath, parseAdminSection } from './sections'

describe('admin sections', () => {
  it('parses every known section and nothing else', () => {
    for (const s of ADMIN_SECTIONS) expect(parseAdminSection(s.id)).toBe(s.id)
    expect(parseAdminSection(undefined)).toBeNull()
    expect(parseAdminSection('login')).toBeNull()
    expect(parseAdminSection('People')).toBeNull()
  })

  it('never names a section "login", which is the admin login route', () => {
    expect(ADMIN_SECTIONS.map((s) => s.id)).not.toContain('login')
  })

  it('builds paths, and the default is a real section', () => {
    expect(adminPath('quality')).toBe('/admin/quality')
    expect(parseAdminSection(DEFAULT_ADMIN_SECTION)).toBe(DEFAULT_ADMIN_SECTION)
  })
})

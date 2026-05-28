import { readFileSync } from 'node:fs'

const adminDashboard = readFileSync(new URL('./AdminDashboard.vue', import.meta.url), 'utf8')

describe('Admin Dashboard Users tab', () => {
  it('renders a read-only Users tab with search, counts, and role badges', () => {
    expect(adminDashboard).toContain("activeAdminTab === 'users'")
    expect(adminDashboard).toContain('aria-controls="user-admin-panel"')
    expect(adminDashboard).toContain('Users')
    expect(adminDashboard).toContain('User role management')
    expect(adminDashboard).toContain('id="user-record-search"')
    expect(adminDashboard).toContain('placeholder="Search by username or email"')
    expect(adminDashboard).toContain('{{ userRecordSummary }}')
    expect(adminDashboard).toContain('aria-label="User records"')
    expect(adminDashboard).toContain('Primary Admin')
    expect(adminDashboard).toContain('You')
    expect(adminDashboard).toContain('{{ user.username }}')
    expect(adminDashboard).toContain('{{ user.email }}')
    expect(adminDashboard).toContain('{{ user.role }}')
  })

  it('covers loading, empty, error, and no-match states', () => {
    expect(adminDashboard).toContain('Loading users')
    expect(adminDashboard).toContain('{{ userLoadError }}')
    expect(adminDashboard).toContain('No users are available yet.')
    expect(adminDashboard).toContain('No User records match "{{ userRecordSearchTerm }}".')
  })

  it('renders guarded role actions and protected demotion messaging', () => {
    expect(adminDashboard).toContain('{{ userRoleError }}')
    expect(adminDashboard).toContain("changeUserRole({ userId: user.id, role: 'admin' })")
    expect(adminDashboard).toContain("changeUserRole({ userId: user.id, role: 'student' })")
    expect(adminDashboard).toContain('Promote')
    expect(adminDashboard).toContain('Demote')
    expect(adminDashboard).toContain('Primary Admin cannot be demoted')
    expect(adminDashboard).toContain('You cannot demote your own account')
    expect(adminDashboard).toContain("roleChangingUserId === user.id")
    expect(adminDashboard).toContain("roleChangingUserId === user.id ? 'Updating' : 'Promote'")
    expect(adminDashboard).toContain("roleChangingUserId === user.id ? 'Updating' : 'Demote'")
    expect(adminDashboard).toContain('may need to sign in again or refresh their session')
  })
})

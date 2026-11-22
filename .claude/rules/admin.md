---
paths:
  - "src/admin/**"
  - "src/components/admin/**"
  - "src/pages/AdminPage.tsx"
  - "src/pages/AdminLoginPage.tsx"
---

# Admin (`src/admin/`, `pages/AdminPage.tsx`)

Developer-only site-wide counts at `/admin/<section>` with a time range. **Admin is a row in `admins`**, granted only in the SQL editor. An admin account is for admin work only (`RequireAuth` redirects to `/admin`); admins log in at `/admin/login` and the wrong login kind is signed out before any page sees the session. `admin_overview()` (security definer) refuses non-admins. **Counts and categories only: never return a row, name, email, title or anything typed.**

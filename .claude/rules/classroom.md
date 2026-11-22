---
paths:
  - "src/classroom/**"
  - "src/components/classroom/**"
  - "src/pages/classroom/**"
  - "src/store/profile.ts"
---

# Classroom (`src/classroom/`)

Account type (General / Teacher / Student) is chosen at sign-up and pinned in the DB; General → Student only inside `join_class`. **Read "Implementation invariants" in `docs/superpowers/specs/2026-09-14-teacher-classroom-design.md` before touching classroom code, RLS or the profile/role flow.**

# CLAUDE.md — UstaadSearch Monorepo

## Project Overview

UstaadSearch is an EdTech recruitment marketplace connecting teachers with educational institutions and freelance tutor opportunities in Pakistan. The platform is free, non-commercial, and targets educational institutions.

## Repository Structure

```
US-Front-to-Back/
├── ustaadsearch/            # Backend — Laravel 12 + Filament 5
├── ustaadsearch-frontend/   # Frontend — Next.js 16 + React 19
├── CLAUDE.md                # This file (monorepo-level guidance)
└── CHANGELOG.md             # All feature changes tracked here
```

## Architecture

- **Backend:** Laravel 12, PHP 8.2, Sanctum auth, Filament 5 admin panel
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Database:** SQLite (dev), designed for MySQL/PostgreSQL in production
- **Storage:** AWS S3 for files (CVs, profile pictures)
- **Email:** Resend
- **AI:** Gemini + Groq for search, extraction, and recommendations

## Core Domain

```
User (role: teacher | institution | admin | student)
  ├── Teacher → JobApplication, Education, Experience, Reviews
  └── Institution → JobPost → JobApplication
TutorJob (freelance, user-posted)
Review (polymorphic: Teacher | Institution)
Interaction (polymorphic view tracking)
```

## Development Commands

```bash
# Backend
cd ustaadsearch
composer dev              # Laravel server + queue + Vite
composer test             # PHPUnit (in-memory SQLite)
php artisan migrate       # Run migrations
./vendor/bin/pint         # Code style (Laravel Pint)

# Frontend
cd ustaadsearch-frontend
npm run dev               # Next.js dev server
npm run build             # Production build
npm run lint              # ESLint
```

## Conventions

- **Request lifecycle:** Route → Controller → Service → Model → API Resource
- **Controllers are thin** — domain logic lives in `app/Services/`
- **Slug-based routing** for JobPost and TutorJob (not IDs)
- **Soft deletes** on User, Teacher, Institution
- **JSON columns** for arrays: subjects, grades, requirements, answers
- **Server Actions** in Next.js for data fetching (in `src/actions/`)
- **No class components** — functional React only
- **No over-engineering** — keep solutions simple and extendable

## Engineering Principles

1. Don't over-engineer. Simple and working beats clever and complex.
2. Keep solutions extendable — design for the next feature, not the next ten.
3. Follow existing patterns in the codebase (services, resources, form requests).
4. No premature abstractions. Three similar lines > a premature helper.
5. Test at system boundaries. Trust framework internals.
6. Track all feature changes in `/CHANGELOG.md`.

## Repo Layout

Three separate git repos: `ustaadsearch/` (backend), `ustaadsearch-frontend/` (frontend), and the root
(tracks only top-level `*.md`). Commit inside the repo the change belongs to.

## CHANGELOG.md

It is very large. Never read it in full — read only the first ~60 lines to match the format, then insert
the new entry at the top.

## Hard Rules

- Never modify production data or run anything against the production server without explicit approval.
- Never edit an existing migration — add a new one.
- Scheduled commands and queued jobs must be safe to re-run.
- AI API calls (Gemini/Groq) must handle failures, timeouts and rate limits.
- Authorization changes need a test.

## Verification Before Done

- Backend: `composer test` and `./vendor/bin/pint --dirty`
- Frontend: `npm run lint` and `npx tsc --noEmit`

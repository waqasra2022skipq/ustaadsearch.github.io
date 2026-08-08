# CHANGELOG

All notable feature additions and changes to UstaadSearch are documented here.
Format: newest entries at the top.

---

## [Unreleased]

### Added
- **"Add to Home Screen" (PWA) + browser push notifications** — teachers previously only saw a notification if they happened to open the site in a browser (the bell polls `/notifications/unread-count` every 30s), and the only proactive channel was the daily email digest, hard-capped at 70 emails/day by the mail provider and rotated across teachers over several days. The site is now installable and delivers real OS-level notifications with the browser closed. Three parts: (1) *installability* — `src/app/site.webmanifest` was dead code (not a Next.js metadata-file convention name and never referenced by any `<link rel="manifest">`, so it was never served, and `apple-touch-icon.png` was likewise unserved because the convention name is `apple-icon.png`); replaced by a real `src/app/manifest.ts` with `id`/`start_url`/`scope`/maskable icon, plus `themeColor` and `appleWebApp` metadata, a generated maskable icon and notification badge, and an `InstallPrompt` banner that uses `beforeinstallprompt` on Android/Chrome and falls back to Share → Add to Home Screen instructions on iOS. (2) *push delivery* — `laravel-notification-channels/webpush` with VAPID keys, a `push_subscriptions` table, and `POST`/`DELETE /push-subscriptions`; a shared `SendsWebPush` trait derives the push payload from the `{title, body, action_url}` array every notification already returns, so all six existing notification types (new application, status change, withdrawal, job expiry, new review, teacher invite) now push as well as landing in the bell, and the channel is only attached for users who actually subscribed. (3) *job matches* — new `MatchingJobsNotification` + `notifications:send-job-matches` scheduled at 09:00 and 18:00, reusing the existing `JobPostDigestService`/`TutorJobDigestService` matchers verbatim and grouping a window's matches into one notification ("5 new jobs match your profile") rather than one per job. A new `teachers.last_job_match_notified_at` watermark is written synchronously when the notification is dispatched, so a re-run before the queue drains can't duplicate it. The service worker deliberately caches nothing — it only handles `push`/`notificationclick` — because caching Next.js build chunks would serve stale JS/CSS after every deploy; a documented unregister kill-switch is in the file header. The daily email digest is unchanged. Note that on iOS, web push only works from an installed PWA (16.4+), which is why the toggle shows install instructions instead of a button in mobile Safari (backend + frontend)
- Cover letter is now optional when applying to a job — previously the `cover_letter` field was required end-to-end (NOT NULL column, `required` validation rule, HTML `required` textarea with a "100 characters minimum" hint that was never actually enforced). Column is now nullable, `ApplyToJobRequest` validates it as `nullable`, and the apply form drops the asterisk/required attribute in favor of an "(Optional)" label; institution-facing application views that previously assumed a non-null string (`ApplicationsList`) now show "No cover letter provided." instead of an empty paragraph (backend + frontend)
- Notifications screen now has an All/Unread/Read filter (pill buttons above the list) instead of only ever showing everything — `GET /notifications` accepts a `status` query param (`all|unread|read`, default `all`) filtering on `read_at`, and marking a notification read while viewing "Unread" now removes it from the list immediately instead of leaving it visible until refresh (backend + frontend)
- Institution "Recommended teachers" invites (Email/WhatsApp/Copy on a job's recommended-teachers panel) are now tracked server-side instead of being a one-way, untracked link — new `invitations` table records channel + invited/viewed/applied timestamps per teacher per job, one row per pair (re-invites refresh it rather than duplicating). The invited teacher gets a real notification (`TeacherInvitedNotification`, reusing the existing notification bell — no new UI needed there); following the invite's job link (embedded `?invite=` id) marks it viewed, and applying to the job marks it applied via a one-line hook in the existing apply flow. New `InvitationService`/`InvitationController`, `POST /me/institution/my-jobs/{job}/invitations/{teacher}` and public `POST /invitations/{invitation}/view` routes; recommended-teacher payloads now include an `invitation` object so the panel can show "Invited / Viewed / Applied" state (backend + frontend)
- Institutions can now fully manage Tutor Jobs from their dashboard — new "Tutor Jobs" sidebar tab alongside "My Jobs" with create, edit, clone, delete, and status/renew workflow, matching the existing Jobs management surface. `tutor_jobs` gained a real `status` enum (`draft/open/closed/expired`, replacing the previous expires_at-derived status) and a nullable `institution_id` for institution-owned listings; guest/parent postings remain unowned and unaffected. New `TutorJobPolicy`, institution-scoped routes under `/me/institution/my-tutor-jobs`, and an hourly `tutor-jobs:expire-posts` scheduled command mirroring the existing job-post expiry job. No applications/proposals system was added — tutor jobs stay contact-based (masked email/phone/WhatsApp), consistent with how the public marketplace already works (backend + frontend)
- "Extract with AI" for tutor jobs: institutions can paste a tutoring hiring post (potentially listing several openings) into a new draft-import panel and get one draft listing per opening, mirroring the Jobs "AI Draft Import" panel. New `TutorJobBulkExtractionAIService`/`TutorJobBulkDetailsExtractorAgent` handle the multi-listing extraction; the original single-listing extraction used by the public "Post a Tutor Job" modal is untouched (backend + frontend)
- Settings: teachers and institutions can now change their password (current-password check, ends every other active session) and email (current-password check, immediately updates and resets `email_verified_at` to `null` so the existing "Action Required: verify your email" banner and resend flow — already present on both dashboards — automatically kicks in for the new address). New shared `AccountSettingsPanel` replaces the duplicated "Account Settings" card that previously contained only the delete-account danger zone (backend + frontend)
- Institution dashboard now shows a profile-completion ring (mirrors the existing teacher one), scored from profile picture, description, website, phone, curriculum/board, working days, benefits, hiring process, and gallery images — new `institutions.profile_score` column, computed in `InstitutionProfileService` on every profile save (backend + frontend)
- One-click "Renew Job" action for expired job posts (institution "My Jobs" kebab menu) — reopens the job and resets `expires_at`/`published_at` so it's immediately visible in search again, instead of requiring a manual status-dropdown edit plus separately fixing the now-stale expiry date (backend + frontend)
- Teachers must have at least one subject and grade level on their profile before submitting a job application — institutions were receiving applications with detailed cover letters but 0% profile completion and no subjects/grades to filter or compare candidates against (backend)
- Job post and tutor job slugs now include readable context instead of a bare numeric counter — e.g. `computer-teacher-4` becomes `computer-teacher-allied-school` (institution name for managed job posts, external contact/org name for externally-managed ones, city for tutor jobs, with all three falling back to city then a numeric suffix only on a genuine duplicate). New shared `App\Support\SlugGenerator` replaces the duplicated per-service slug logic in `JobPostService`/`TutorJobService`; the `title` field itself is left untouched since the frontend already renders "{title} at {institution}" for page metadata (backend)
- Real UstaadSearch logo mark wired into the site header and footer (replacing the placeholder "US" badge), plus regenerated favicon/apple-touch-icon/android-chrome icons from the same source artwork (frontend)
- Offsite copy step for nightly DB backups (`BackupDatabaseNightly`) — uploads the same dump to a separate S3-compatible `backup-offsite` disk (server-side encrypted) when `BACKUP_OFFSITE_*` env vars are configured; no-ops with a log line until they are. Added `docs/backup-restore-runbook.md` covering locating/verifying/restoring backups, credential rotation, and post-restore validation (backend)
- `system:health-check` scheduled command (hourly) — checks root disk free %, MySQL DB/binlog size, `failed_jobs` count, and recent ERROR/CRITICAL log volume; emails/webhooks an alert (`HEALTH_ALERT_EMAIL`/`HEALTH_ALERT_WEBHOOK_URL`) when a threshold is crossed (backend)
- True per-status application counts: `GET /me/institution/my-jobs/{slug}/applications` now returns a `status_counts` field (real DB aggregate, independent of pagination/filters) alongside the paginated list; institution dashboard pipeline/kanban counts now read from it instead of counting only the currently-loaded page (backend + frontend)

### Fixed
- Production deploys never restarted queue workers — `deploy-to-production.yml` pulls, migrates and reloads nginx/php-fpm, but long-running `queue:work` processes hold the previous release in memory and keep running it until they happen to restart on their own. Any change to a queued class (all notifications, all digest/welcome mail) silently kept using stale code after deploy. Added `php artisan queue:restart` before maintenance mode is lifted (backend)
- Institution guide's "Manage Applications & Interviews" step described tracking status from "Applied" to "Hired" — the real `JobApplication` status enum is `pending/reviewing/shortlisted/accepted/rejected`, no literal "Applied"/"Hired" state exists. Reworded to describe the actual stages (frontend)
- `TutorJob.preferred_start_date` and `is_remote_ok` had been declared on the model's fillable/casts and serialized by `TutorJobResource` since the model was created, but no migration ever added either column — any write ever attempting to populate them (only reachable via the new institution create/update paths above) would have failed with a SQL error. Added both columns (backend)
- Teachers weren't notified when an institution moved their application between statuses (e.g. Pending → Reviewing) via drag-and-drop in the kanban pipeline — the notification pipeline already existed end-to-end but `ApplicationsTable`'s `handleStatusUpdate` silently defaulted `notifyApplicant` to `false` on that code path (the modal-based status-change path already defaulted it to `true`). Now defaults to `true` everywhere (frontend)
- "Both"/"any" gender-preference tags on job and tutor-job cards used the same generic single-person icon as "male"/"female", making them easy to misread at a glance. Now uses a distinct two-person icon (frontend)
- Tutor job titles had no practical length limit, letting posters cram entire job descriptions into the title field and break card layouts. Capped at 80 characters (was 255) with a live counter and a nudge toward the description field (backend + frontend)
- Job posting form's "Gender Preference" defaulted to "Male", nudging institutions toward excluding candidates by default. Now defaults to "Any" (`both`) (frontend)
- Institution top nav dropped the "Jobs" link (shown for guests and teachers, but not institutions) with no clear reason — institutions may still want to browse the general jobs board for market awareness. Now shown for everyone (frontend)
- Homepage AI search prompt chips sent guests straight into an authenticated-only search, producing "Please log in to use AI search. Please try refreshing the page." — misleading, since refreshing never helps. `/teachers` (the "Hire a Teacher/Tutor" tab's destination) now falls back to a normal keyword search for guests instead of erroring, with an inline banner explaining they're seeing regular results and a real login link for AI search; `/tutor-jobs` already handled this correctly and was left as-is (frontend)
- Homepage hero search always defaulted to the "Hire a Teacher/Tutor" tab regardless of who's logged in. Now defaults to "Find Jobs / Gigs" for logged-in teachers (frontend)
- Clicking "View" on a past application whose job had since expired/closed gave a plain 404 instead of the job details. `JobPostController::show` now resolves whether the requester already applied *before* enforcing the "open jobs only" visibility check, so an applicant (or the owning institution) can still view a closed/expired job; other visitors still get 404 for non-open jobs as before. The job detail page also shows an inline "no longer accepting applications" banner when status isn't open, and a site-wide styled `not-found.tsx` now replaces Next.js's raw default 404 for any other dead link (backend + frontend)
- Teacher dashboard sidebar's "Browse Jobs" link led to an unfinished "Job Board Integration" placeholder tab ("Go to Tutor Jobs" was also mislabeled — tutor jobs isn't the same board). Removed the placeholder tab and pointed the link straight at the real, working `/jobs` board, matching how "Browse Jobs" already behaves everywhere else in the app (frontend)
- Login/register/forgot-password/reset-password inputs had no `name` or `autoComplete` attributes, leaving the browser to guess field mapping by heuristics alone — the likely cause of stale password autofill after switching accounts. Added `autoComplete="username"`/`"current-password"`/`"new-password"` (and matching `name`s) across all four auth forms (frontend)
- Institution analytics "Conversion rate" and "Best performing jobs" could exceed 100% (seen as 400–500%). Root cause: `/api/interactions/view` deduped views by IP hash for 24h regardless of login state, so multiple distinct authenticated teachers viewing from the same network/IP collapsed into a single counted view while each still produced a separate application. Views are now deduped by `user_id` when the requester is authenticated, falling back to IP hash only for anonymous visitors; `conversionRate()` also now clamps at 100% as a defensive floor against any stale pre-fix data (backend)
- Navigating directly to `/login`, `/register`, or `/forgot-password` hit a raw 404 instead of the real `/auth/*` pages; added redirects in `next.config.ts` (frontend)
- Teacher "My Profile" CV section displayed the literal AWS S3 presigned-URL query string (`Date=...&X-Amz-SignedHeaders=...&X-Amz-Signature=...`) instead of a filename. `CVUpload`'s filename parser split on `-` without first stripping the query string, and the `X-Amz-*` query keys themselves contain hyphens, so the split shredded into the signature params (frontend)
- Institution notification panel could show duplicate "Job Post Expired" alerts for the same job. `SendJobPostExpiredNotification` now checks for an existing notification (by job id) before creating a new one, guarding against a retried queued dispatch (backend)
- "Withdraw Application" button on an applied job's detail page clipped to "Withdraw App…" — it sits in a half-width `grid-cols-2` button pair (with WhatsApp) with `truncate` applied. Relabeled to "Withdraw", matching the label already used for the same action in the teacher's applications list (frontend)
- Institution sidebar "My Jobs" badge flickered between the real count and 0 depending on the active page — `JobCreateLayout` (used by the Create Job and Edit Job pages) hardcoded `totalJobs={0}` instead of fetching it like the main dashboard does. Both pages now fetch the real count via `getInstitutionJobs(1, 1)` (frontend)
- GA4/GTM analytics misconfiguration — a GA4 measurement ID (`G-7Y0HZZVDCL`) was being passed into `@next/third-parties/google`'s `GoogleTagManager` component, which expects a `GTM-XXXXXXX` container ID; swapped to the matching `GoogleAnalytics` component and moved the ID to `NEXT_PUBLIC_GA_MEASUREMENT_ID` (frontend)
- Guide pages (`/guides/teachers`, `/guides/institutions`) and the homepage claimed features that don't exist — built-in messaging, in-app interview scheduling, saved-search job alerts, a "5x more inquiries when verified" stat with no supporting data, and a hardcoded "15,000+ educators" figure inconsistent with the real dynamic stats shown higher on the same page. Copy rewritten to describe actual capability (WhatsApp-based contact, AI-powered search/filters) rather than building the missing features; the traction claim now uses the same live counts already fetched for the hero section (frontend)
- "Login to Chat" / "Quick Chat" copy across teacher cards and profiles implied in-app messaging; the actual feature is a login-gated WhatsApp deep link with no chat backend at all. Relabeled to "Login to Contact" / "Contact via WhatsApp" (frontend)
- Institution application pipeline "Accepted" tile and pipeline/kanban column counts (`ApplicationsTable`) were computed by filtering only the currently-loaded/paginated page of applications — wrong for any job with more applications than fit on one page. Now use the new `status_counts` aggregate (see Added) with the old page-filtered count kept only as a fallback (frontend)
- `ApplyToJobRequest` accepted an application with required screening questions left unanswered — the check only existed in the frontend form. Added server-side enforcement (`withValidator`) that rejects submissions missing a required answer (backend)
- Institution dashboard sidebar labeled the account "Verified" based on `institution.user.verified` (email confirmation) and showed a fabricated "Free Plan" label with no backing field (this product has no plan/subscription concept) when unverified. Now shows real admin-reviewed verification status (`institution.verified`) with accurate labels ("Verified institution" / "Not yet verified"); also relabeled the ambiguous "Verified:" row in the institution profile form to "Email Verified:" (frontend)
- Vercel build failing with `Error: Region is missing` in `/api/upload` — the AWS `S3Client` was constructed at module scope, which Next.js evaluates during "Collecting page data" at build time. The client is now constructed lazily on first request instead, so a missing/misconfigured env var fails that one request at runtime (500) instead of the build (frontend)
- Uploads still 500'd after the above: Vercel Functions run on AWS Lambda, which reserves `AWS_REGION`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` for its own runtime credentials — values set under those exact names in the Vercel dashboard are shadowed at request time. Switched `/api/upload` to dedicated `S3_UPLOAD_*` env var names (bare `AWS_*` kept only as a local-dev fallback) (frontend)
- Backend re-validation of uploaded CV/profile-picture URLs (`ProfileController::isValidUploadUrl`) gave no signal about *why* it rejected a URL; now logs the specific check that failed (missing bucket config, host/bucket mismatch, wrong folder, disallowed extension) to `storage/logs/laravel.log` (backend)
- Profile picture uploads were succeeding but failing to render (`/_next/image` 500, `TimeoutError`) — phone-camera originals up to 5MB were stored as-is and took too long to fetch back through Next's image optimizer on a slow connection. Profile pictures are now downscaled to 512px max + re-encoded as JPEG client-side before upload (frontend)
- `/_next/image` returning `402 Payment Required` for `ui-avatars.com` fallback avatars — each is generated per-name, so every teacher/institution without a real photo consumed a unique slot against Vercel's Image Optimization quota. These generated placeholders are now marked `unoptimized` (skip the `/_next/image` proxy) everywhere they're used; only real uploaded photos still get optimized (frontend)

### Security
- Fixed `NEXT_PUBLIC_AWS_*` env vars leaking AWS credentials into the client JS bundle; renamed to server-only vars used exclusively by `/api/upload` (frontend)
- Auth-gated `/api/upload` (S3 presigned URL endpoint) — now requires a valid session via `getCurrentUser()`/Sanctum, plus a per-user hourly rate limit (frontend)
- Guest reviews (teacher and institution) no longer attach a review to an existing account just by supplying its email — rejected with 409 instead. New guest accounts are created unverified and their review is held as `is_approved = false` until the guest confirms the verification email (`ApprovePendingGuestReviews` listener publishes it on `Verified`) (backend)
- Added `throttle:review` rate limiting to `POST /api/institutions/{username}/reviews`, which previously had none; fixed the shared `review` rate limiter to key by the actual route `username` param (was silently keying everything as `unknown_teacher`) and to fall back to the submitted email for guests, not just IP (backend)
- Fixed the `add_student_role_to_users_table` migration silently no-op'ing on SQLite, which made every guest-review account creation (default role `student`) fail against the old CHECK constraint in dev/test (backend)
- Split the "Verified" badge into two distinct signals everywhere it's shown (teacher/institution profiles and cards, job listings): `verified`/`verified_at` now means reviewed and approved by an UstaadSearch admin; `is_email_verified` means only that the account confirmed its email. `JobPostController` previously computed institution `verified` purely from email confirmation and mislabeled it, discarding the real admin `verified_at` signal entirely; `Institution::getVerifiedAttribute()` previously blended both into one ambiguous flag (backend + frontend)
- Review deletion (`ReviewController::destroy`) now busts the `teacher.review_summary.{id}` / `institution.review_summary.{id}` cache immediately instead of leaving stale ratings visible for up to 10 minutes; added `Review::summaryCacheKey()` shared by the delete path and the guest-review approval listener (backend)
- CV and profile picture uploads are now re-validated server-side when the S3 URL is persisted (`ProfileController::updateCv`/`updateProfilePicture`) — confirms the URL actually points at our S3 bucket, under the expected folder (`cvs/` or `profile-photos/`), with an allowed extension, rather than trusting whatever URL the client submits (backend)
- Added rate limiting to two previously-unprotected public/guest endpoints: `POST /api/tutor-jobs/extract-ai` (AI extraction, 10/hr/IP, logs rejected requests) and `POST /api/tutor-jobs` (guest job posting, 3/day/IP or 10/day/user). Guest tutor-job posts are now also flagged for admin review (`is_flagged`/`flagged_reason` — visible in Filament) on duplicate contact info or a link in the text (backend)
- **Public teacher directory (`/api/teachers*`) and tutor-job listings (`/api/tutor-jobs*`) were returning exact address, email, phone, and a permanently-public CV download URL to unauthenticated requests** — the frontend already visually gated these behind login, but the raw values were sitting in the API response regardless, retrievable by inspecting network traffic. Both are now masked server-side for guests (`contact_masked` flag added so the frontend can still show its existing "Login to view" hints) (backend + frontend)
- CVs are now uploaded to S3 with a private ACL instead of `public-read` (profile pictures remain public by design) and served exclusively via short-lived signed URLs (`App\Support\SignedFileUrl`, 15 min) — applied everywhere `cv_path` is read: teacher's own profile, institution application views/CSV export, recommended-teachers, and the AI CV-hydration job (which downloads the file server-side and would otherwise have started failing once the object went private) (backend)
- `GET /api/taxonomy/stats` had a docblock claiming "Admin only" but no auth middleware was ever applied — decided and documented (aggregate counts only, no PII) that it's intentionally public rather than adding auth, since real analysis showed nothing sensitive is exposed (backend)
- Consolidated hand-rolled ownership checks into Laravel Policies: added `JobApplicationPolicy` (withdraw), `TeacherEducationPolicy`, `ReviewPolicy` (delete), and a `manageApplications` method on the existing `JobPostPolicy`; removed the duplicated `ownedJobForUser`/`belongsToTeacher` helpers they replaced in `JobApplicationController` and `TeacherEducationController` (backend)

### Planned
- Notifications Center (in-app notifications for application events)
- Messaging System (institution ↔ teacher communication)
- Teacher Shortlist / Talent Pool (save teachers for later)
- Job Templates (save and reuse job post templates)

---

## 2026-07-18

### Added
- CLAUDE.md files for monorepo, backend, and frontend guidance
- This CHANGELOG file to track all feature changes

---

## 2026-07-07

### Added
- Public profile fields for institutions (banner, gallery, benefits, hiring_process, curriculum_board, working_days)

## 2026-07-04

### Added
- Internal notes and tags on job applications (institution-side)
- Application withdrawn_at timestamp

## 2026-06-24

### Changed
- Made phone nullable on tutor_jobs table

## 2026-06-18

### Added
- Agent conversations system (Laravel AI integration)

## 2026-06-15

### Added
- External apply fields on job posts (external_contact_name, external_email, external_phone, external_is_whatsapp, application_mode)

## 2026-06-08

### Added
- Interactions system (polymorphic view tracking for teachers, jobs, tutor jobs)
- Views count on Teacher, JobPost, TutorJob models

## 2026-06-04

### Added
- Country field on job posts

## 2026-05-28

### Added
- CV path on job applications (upload CV per application)
- AI summary field on teachers

## 2026-05-21

### Changed
- Updated tutor jobs email and requirements fields

## 2026-05-14

### Added
- Canonical subjects and grades taxonomy tables

## 2026-05-08

### Added
- Rate fields on teachers (rate_amount, rate_currency, rate_period)

## 2026-05-04

### Added
- Verification reminder sent flag on users

## 2026-04-10

### Added
- Phone field on institutions

## 2026-03-09

### Added
- Country field on teachers

## 2026-02-23

### Added
- CV path on teachers

## 2026-02-17

### Added
- Student role to users enum

## 2026-02-12

### Added
- Polymorphic reviews system (for teachers and institutions)

## 2026-01-21

### Changed
- Updated gender column type on tutor_jobs

## 2026-01-19

### Added
- Contact messages system

## 2026-01-15

### Added
- Tutor jobs marketplace

## 2026-01-09

### Added
- Gender field on teachers

## 2026-01-03

### Added
- Address fields on teachers and institutions
- Username field on institutions

## 2025-12-28

### Added
- Gender preference on job posts

## 2025-12-23

### Added
- Profile picture on users

## 2025-12-11

### Added
- Teacher experiences system

## 2025-12-09

### Added
- Teacher educations system

## 2025-12-02

### Added
- Job applications system

## 2025-11-29

### Added
- Username field on teachers

## 2025-11-14

### Added
- Job posts system (with subjects, grades, screening questions)

## 2025-11-10

### Added
- Initial platform: Users, Teachers, Institutions, authentication, role-based profiles

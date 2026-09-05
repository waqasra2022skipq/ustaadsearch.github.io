# CHANGELOG

All notable feature additions and changes to UstaadSearch are documented here.
Format: newest entries at the top.

---

### Added
- **An unstated teacher area no longer ranks below a known-but-distant one, and the admin
  shortlist now says how far it had to widen.** Two corrections to the area-proximity work,
  both still behind `RECOMMENDATION_LOCATION_ENABLED`. The classifier scored a teacher with no
  stated area at 0.20 — *below* `same_city` (0.35) — so saying nothing about an area read as
  worse than being known to be far away. Almost the whole existing corpus sits in exactly that
  position until the capture UI has been in front of them and the backfill has run, so throwing
  the switch would have demoted the roster on a field nobody had been asked to fill. It is now
  0.50: silence is not distance. The mild incentive that creates to leave the field blank is
  answered by profile-completeness scoring rather than by the ranker, and the value is worth
  revisiting once area coverage is high enough to read blank as a real signal. Because proximity
  tier still sorts ahead of the blended score, this governs the confidence band, the
  `min_combined_score` floor and the recommendation-email quality gate rather than the visible
  order — an unstated-area teacher still follows a known-but-far one within the list itself.
  Separately, `RecommendedTeachersWidget` was the one surface the rollout missed: the API reports
  scope and thin-supply metadata and the teacher dashboard renders it, but the Filament shortlist
  an admin actually reviews presented a thin local pool and a strong one identically. It now
  carries a "Same area only" toggle beside "Same city only" — reusing the existing
  `FILTERED_POOL` deeper slice, because filtering happens after the ranking is truncated, and
  comparing stored `area_id`s rather than the ranking tier so the toggle still works with
  proximity ranking switched off — and a heading that names the widest rung reached,
  *"widened to Karachi (only 2 within catchment)"*, in the same register as the existing
  semantic/structural note. The scope comes from `AreaProximityClassifier::metadata()` rather
  than restating the ladder inside the widget.
- **Area-proximity matching is complete across school jobs, tutor jobs, teacher discovery,
  reverse recommendations, notifications, digests, PDFs, emails, and dashboard cards.** The
  corrective foundation preserves unresolved school-job locality, makes aliases city-scoped,
  records centroid provenance, validates every selected area against the submitted city, clears
  stale inferred areas after a move, exposes a safe public area lookup, and round-trips
  `area_id`/`max_travel` through every relevant API and form. Physical recommendations now reject
  unknown or different cities, classify the full eligible pool before truncation, widen
  cumulatively from same-area through same-city supply, and sort by proximity tier before the
  existing 65/35 semantic/structural score. Online work remains location-neutral. Result rows
  carry a human-readable `location_match`, and shortlist endpoints report scope and thin-supply
  metadata. Embedding recipes are unchanged. The production switch defaults off pending the
  mandatory read-only audit, explicit `AreaSeeder` run, alias refinement, verified centroid
  loading, and per-model backfill documented in
  `ustaadsearch/docs/area-proximity-rollout.md`.
- **Area-proximity rollout follow-up hardened locality capture and backfill.** Unresolved audit
  and dry-run output is now grouped by `city_key`, so identical locality text in different cities
  can no longer be mistaken for one alias candidate. City normalization gained audited Pakistani
  misspellings (`faislabad`, `islambad`, `krachi`, `peshwar`, `dikhan`, `okarah`, and `sarghoda`),
  while the area seed gained only unambiguous city-scoped spellings for Johar Town,
  Gulistan-e-Johar, and Rawalpindi's Bahria Town phases 1, 6, and 8. The school-job AI extractor
  now requests a locality for every individual job instead of relying only on the institution's
  shared address; both Filament and API draft imports preserve that value in
  `job_posts.location_text`, prefer it over the institution address, and resolve `area_id` when
  the taxonomy recognises it. Unresolved text remains stored for later taxonomy improvements and
  area-only changes still do not trigger re-embedding.
- **Area-level location, Phase 2: `area_id` attached to the four tables that carry a location,
  plus teacher travel willingness.** Phase 1 gave us a resolver with nothing to resolve into a
  column; this wires it in. `job_posts`, `teachers`, `tutor_jobs` and `institutions` each gained
  a nullable `area_id` (FK, `nullOnDelete`), a `job_post_catchment_areas` pivot lets an
  institution name the neighbouring areas it will also hire from, and `teachers.max_travel`
  (`own_area | nearby | city`, nullable during rollout with legacy null treated as `city`) records how far a teacher will travel. It is
  a **plain varchar, not an ENUM, deliberately** — the last enum-modify migration broke the whole
  suite on SQLite, which rebuilds a table for an `ALTER`; the allowed set is pinned in a
  `Teacher::MAX_TRAVEL_OPTIONS` constant and the Form Request instead. Everything here is
  **additive and independently gated**: the existing free-text `city`/`address` columns stay and
  keep being written, and a row with a null `area_id` falls back honestly to city matching.
  `area_id` is kept in step with the free text three ways: a `saving` observer on
  Teacher re-resolves it from address/city (clearing a stale inferred area when a move no longer
  resolves, while deferring to an explicitly selected valid `area_id`), a new
  `TeacherProfileService::areaFromCv()` fills it passively from parsed CV rows, and the admin AI
  job importer preserves the locality it used to discard off school posters and resolves it into
  an `area_id` where possible. `area_id` is **not** added to any embedding document or to
  `TeacherProfileObserver::EMBEDDING_ONLY_FIELDS` — it is an exact orderable constraint like
  salary and gender, not embedding input, so it must never trigger a re-embed. A
  `php artisan areas:backfill {--dry-run} {--model=}` command resolves existing rows from their
  own text (never overwriting a set `area_id`) and, on a dry run, prints the most common
  *unresolved* strings — the input to the next alias-seeding pass. Both recommendation
  fingerprints now include `area_id` and the sorted catchment list, so the 30-minute ranking
  cache rotates on a location edit rather than serving a stale shortlist.
- **Area-level location, Phase 1: a normalised area taxonomy and a resolver for it.** An
  institution hiring in North Nazimabad, Karachi was shown a candidate from DHA ranked
  identically to an equally-qualified one 2 km away, because location was a city-level boolean —
  both scored the same. The fix begins with vocabulary the rest of the feature can build on: an
  `areas` table (city-scoped, so "Model Town" can exist in both Lahore and Rawalpindi without
  colliding, with an optional coarse `zone` and a nullable centroid) and an `area_aliases` table
  of area-scoped, pre-normalised spellings. `App\Support\AreaName` mirrors the existing
  `App\Support\CityName` on purpose — same normaliser (lowercasing, punctuation to spaces,
  non-Latin preserved so Urdu aliases resolve), no new pattern to learn — and resolves free text
  by exact match, then the longest whole-word alias/name buried in the string (so "nazimabad"
  never wins inside "north nazimabad"), then null. A city hint narrows an otherwise-ambiguous
  name to one city; without it, an ambiguous name resolves to null rather than guessing. Centroids
  are left NULL wherever a coordinate is not certain — a NULL centroid degrades to zone matching,
  a fabricated one produces confidently wrong distances. `AreaSeeder` is idempotent and covers
  the seven cities where hiring happens; because live `teachers.address` frequency data was not
  available, this first pass is seeded from known geography, and the Phase 2 backfill's `--dry-run`
  surfaces the real unresolved strings to refine it. Inert on its own — nothing resolves against
  the taxonomy until Phase 2 attaches `area_id`.


### Changed
- **The homepage hero now speaks to whichever side of the marketplace the visitor is on,
  instead of assuming everyone signed-out is a teacher.** The hero has always had two
  messages — "Teaching jobs in Pakistan, all in one place." and "Post a vacancy. Get a
  shortlist." — but picked between them purely from `currentUser?.role === "institution"`.
  Signed-out visitors are the majority of homepage traffic and include *both* sides, so a
  school or a parent landing on the site got a page that read as if it wasn't for them.
  The considered-and-rejected option was auto-rotating the two on a timer. That fails on four
  counts: it trips WCAG 2.2.2 (Pause, Stop, Hide) once it runs past five seconds; it rotates
  the site's primary keyword phrase out of the `<h1>`; it destabilises the LCP element; and —
  the decisive one — it would put "Post a vacancy" above a search widget still set to the
  "School & College Jobs" tab, so the headline and the tool underneath would contradict each
  other, with copy changing under someone mid-read or mid-type in the search input.
  Instead the copy follows the search tab the visitor picks, reusing the audience selector the
  hero already had. `school-jobs` and `gigs` keep the existing work-seeker copy; `hire` gets a
  new hiring variant. Three tabs map to two messages deliberately, so switching between the two
  work boards doesn't churn the headline. The hiring copy is neutral between schools and
  parents ("Find the right teacher. Get a shortlist.") because the `hire` tab lands on
  `/teachers`, which serves both — institution-specific copy there would be wrong for a parent
  looking for a home tutor. Signed-in institutions still get their exact role copy regardless of
  tab; that's known truth rather than an inference from a click.
  The choice is remembered in a `us_hero_tab` cookie read server-side in `page.tsx`, so a
  returning school gets the right headline in the *first paint* — a `localStorage`-on-mount
  approach would have flashed the teacher copy first. The value is validated against the tab id
  union before use. Because the tab is only a search-scope hint, a static "Hiring for your
  school? Post a vacancy free →" link now sits under the widget for signed-out visitors, so the
  second audience is served above the fold without depending on them discovering the third tab.
  Swaps use a 200ms fade behind a new `animate-hero-fade` utility — the first `@keyframes`,
  first `@theme` block, and first `prefers-reduced-motion` handling in the codebase, all added
  to `globals.css` (Tailwind v4 has no config file here).
  No fixed height is reserved for the copy block: with the real webfont both variants are two
  lines on desktop, so the swap is height-neutral where most traffic sees it, and the residual
  ~18px settle on mobile is user-initiated (excluded from CLS) and covered by the fade.
  Reserving a guessed height would have traded that for permanent dead space on every load.
  `TabId`/`isTabId`/`HERO_TAB_COOKIE` moved to `src/lib/heroTabs.ts`: `HeroSection` is a
  `"use client"` module, and a server component can only render or pass props to a client
  module's exports, never *call* one — `page.tsx` calling `isTabId()` built and typechecked
  fine but 500'd at request time. `TABS` now carries a `satisfies` clause tying its ids to that
  list so adding a tab without making it persistable fails the build.

### Fixed
- **Admins can now manage the matching area taxonomy from Filament instead of editing and
  rerunning seed data for routine changes.** A new Matching & Location → Area Taxonomy
  resource supports city-scoped areas, zones, aliases, and optional verified area-centre
  coordinates; it normalises city keys, slugs, and alternate spellings before saving, and stops
  one spelling from ambiguously pointing to two areas in the same city. The list is searchable
  by canonical names and aliases, filterable by city, zone, and usage, and reports linked
  teachers, institutions, school jobs, tutor jobs, and catchments. Areas in use cannot be deleted or moved to another
  city, including through non-Filament model operations, while unused areas remain removable.
  `AreaSeeder` is now initial bootstrap data and no-ops once any taxonomy exists, so later
  deployment seeds cannot overwrite, duplicate, or resurrect administrator-managed records;
  a tracked data migration adds this release's Askari VI entry to already-seeded installations.
- **The admin AI job-import review now exposes and saves the location data extracted from
  external hiring posts.** The extractor and creation service already preserved a per-job
  locality and could resolve it to `area_id`, but the review card rendered only City and then
  recomputed the area invisibly during creation. Each reviewed role now shows an editable
  Location / Locality field, a city-scoped Primary Area selector preselected from recognised
  text, and optional Catchment Areas. The reviewed values are authoritative when the job is
  created: `location_text` and `area_id` are stored on `job_posts`, additional catchments are
  synchronized to `job_post_catchment_areas`, changing City clears incompatible selections,
  and publishing rejects any primary or catchment area from another city. A follow-up removes
  the repetitive part of that review: when a poster advertises several roles at the same
  city/locality, one shared location block is selected automatically and its reviewed values are
  used for every created job; mixed-campus posters keep their independent controls. Catchment is
  collapsed and blank by default because it records an employer preference, while the matching
  algorithm already widens proximity automatically. Karachi's taxonomy now includes Askari VI
  (`Askari 6` and `Askari six` aliases) in the Malir zone, so the supplied "Damlotti Road, Near
  Askari VI" poster resolves without incorrectly treating every address on Damlotti Road as the
  same area. Embedding recipes remain unchanged: locality is preserved and ranked structurally.
- **The homepage hero headline lost the space between its two halves on mobile.** The heading
  splits with `<br className="hidden sm:block" />`, which is hidden below `sm` — with no
  whitespace in the markup either side of it, the two halves ran together as "Teaching jobs in
  Pakistan,all in one place." on every phone. Pre-existing, and the new hiring variant would
  have inherited it.
- **The mail budget's send ordering was the reverse of what it claimed, and a dry run could
  spend the day's allowance.** Follow-up to the shared `MailBudget` ceiling. That change moved
  `auth:send-verification-reminders` from 00:30 to 06:00 with a comment saying it was
  "deliberately first in the day … so it gets first call on the shared allowance" — but
  `jobs:send-recommendation-emails` runs at 04:00 and was left untouched, so verification
  reminders actually got served *last* of the two. Ordering is load-bearing here: the four bulk
  senders' caps sum to 100 against a 60-slot bulk pool, so whoever runs first wins on a busy
  day. Verification reminders now run at 03:45 (08:45 PKT — still a reasonable inbox hour),
  ahead of the 04:00 recommendation emails, and the comment names the real constraint.
  Separately, `SendJobRecommendationEmails` called `MailBudget::grantBulk()` *before* checking
  `--dry-run`, unlike the other two reminder commands: on an exhausted day a dry run reported
  "0 groups would be emailed" and logged a spurious "Mail budget limited a bulk send" entry,
  breaking the "a dry run shows the full candidate set regardless of budget" contract that
  `MailBudgetTest` pins elsewhere. Dry runs now use the command's own configured cap and never
  touch the budget. That command also now bails out *before* the job query when its grant is
  zero, instead of building a full teacher ranking per job only to discard it.
- **Dead null-handling left behind by the mail budget change.** `grantBulk()` returns a
  non-nullable `int`, which silently made several `=== null` branches unreachable — including
  `tutor-jobs:send-daily-digest`'s old "no `--max-emails` = uncapped run, rotation cursor
  untouched" mode. That mode is genuinely gone (every run is now capped by the day's
  allowance), so the unreachable branches in `resolveRotationCursor()`,
  `rememberRotationCursor()` and `hasReachedEmailLimit()`, plus the `?? 'unlimited'` fallback
  in the recommendation-email summary, were removed rather than left as false signal that an
  uncapped mode still exists. The digest gained the same budget-exhausted early return the
  other senders have, and a test now pins that a run without `--max-emails` does advance the
  rotation cursor — the stateful side effect the next scheduled run resumes from, previously
  untested in either direction. Also corrected a stale `config/search.php` comment still citing
  the digest at 70/day after the same change lowered it to 40.
- **Institution dashboard's applications and analytics screens had no mobile layout.** The
  per-job applications screen (`/institution/dashboard/jobs/[slug]/applications`) — the screen
  an institution admin is most likely to open from a phone — rendered only a wide `Candidate |
  Contact | Applied | Status | Actions` table with no card fallback, forcing horizontal
  scrolling on small screens. Its kanban pipeline view was worse: a `min-w-[1320px]` 5-column
  board relying on HTML5 drag-and-drop, which doesn't fire on touch devices at all, so on a
  phone it was both cramped and non-functional for its one purpose (moving a candidate between
  stages). `ApplicationsTable.tsx` now renders a `lg:hidden` card list (reusing the existing
  status-update and detail-drawer handlers) regardless of the table/pipeline toggle, and both
  the table and the pipeline grid are gated to `hidden lg:block` — so mobile always gets cards,
  and the desktop toggle is untouched. The pipeline/table toggle buttons are hidden below `lg`
  since they no longer have a visible effect on mobile. Analytics' "Job performance" table
  (`AnalyticsDashboard.tsx`) had the same gap — a `min-w-[980px]` 9-column table with no
  fallback — fixed the same way, with a compact per-job card (Views / Apps / Shortlisted)
  matching the existing `RankedJobsPanel` card pattern.

### Fixed
- **Teacher and institution registration could 500 when a new signup shared a name with an
  existing account.** `CreateRoleProfile` picked a username by running
  `Teacher::where('username', $username)->exists()` in a loop and then saving — a
  check-then-save race, not an atomic reservation. Two near-simultaneous registrations for the
  same name (e.g. two people both named "Waqas Rahman") could both pass the `exists()` check
  for `waqas-rahman` before either row committed; the second `save()` then hit
  `teachers_username_unique`, threw unhandled, and rolled back the whole registration
  transaction — the new user's account never got created, and they saw a failed signup with no
  clear reason. Same bug, same shape, in the institution branch via
  `InstitutionService::generateUniqueUsername()`. Replaced both with a single
  `assignUniqueUsername()` that treats the DB's unique constraint as the source of truth: it
  saves the candidate username directly and only falls back to `name-1`, `name-2`, ... by
  catching `UniqueConstraintViolationException` and retrying, so a genuine conflict just
  advances the suffix instead of failing the request.

### Fixed
- **The reminder commands emptied the provider's daily quota in minutes, because the throttle
  guarded the wrong axis.** The first production run queued ~178 verification reminders and 33
  profile reminders and tripped Resend's "200% of your daily quota" cutoff. The `resend-mail`
  limiter added alongside them worked exactly as designed and was still useless here: it bounds
  the provider's *per-second* request cap at 60/minute, which is 3,600/hour, so a 100/day
  allowance was gone in about three minutes. The Resend log shows the whole verification run
  landing between 00:30:07 and 00:32:20.
  - **Per-command caps do not compose.** Four bulk senders each carried an independently chosen
    ceiling -- tutor digest 70/day, job recommendations 50/run, verification reminders 200/run,
    profile reminders 100/run -- summing to 420/day against a 100/day quota. Worse, the two
    that already existed came to 120 on their own, so the account had been running at or over
    quota for at least a week before any reminder was added (Resend's own metrics: 142, 107,
    112 and 104 on separate days). The caps were the mistake, not the volume: each looked
    modest in isolation and nothing anywhere knew the total.
  - New `App\Support\MailBudget` is a single daily ceiling every bulk sender draws from, keyed
    on the UTC date the provider resets on. A `MessageSending` listener counts **every**
    outbound message, so the budget reflects real usage rather than each command's assumption
    that the quota is its own. `mail.transactional_reserve` (40 of 100) is held back and can
    only be spent by transactional mail -- without it a campaign at midnight takes the whole
    day and a teacher signing up that evening silently never receives a verification link,
    which is bulk mail starving the thing it exists to support. Per-run caps drop to
    25/15/20/40, sends are staggered across the day rather than stacked at 00:30-01:00, and a
    `--dry-run` still reports the full eligible set so it stays a planning tool.
  - Worth stating plainly: on the current plan this only rations the shortage. Existing volume
    already consumes the whole 100/day allowance, so the reminder campaigns have almost no room
    until the plan is raised -- at which point `RESEND_DAILY_QUOTA` is the one value to change.

### Fixed
- **Two thirds of teachers never completed a profile, and the machinery meant to bring them
  back had been broken for months.** Investigation started from "how do we get teachers to
  finish their profiles" and found that motivation is not the problem: a teacher who confirms
  their email completes their profile **73%** of the time, one who doesn't, **17%** — and 1,062
  of 1,642 teachers had never confirmed. Four defects, not a UX gap:
  - **The verification reminder had never sent a single email.** `SendWelcomeEmail` stamped
    `verification_reminder_sent` when it queued the *welcome* mail, and
    `SendVerificationReminders` selected `where('verification_reminder_sent', false)` — one
    column meaning two things, with the welcome listener always consuming it first. The
    command was scheduled daily at 00:30 and its candidate set was **permanently empty**;
    1,176 unverified users carried the flag with no follow-up ever sent. Split into
    `welcome_email_sent_at`, `verification_reminder_sent_at` and `verification_reminder_count`,
    one fact each, and the reminder is now a short day-1/3/7 sequence that stops. It is capped
    per run and **ignores accounts older than 30 days by default** — there are ~1,000 dormant
    unverified signups and blasting them from a transactional domain is a deliverability
    problem, so widening that window is a deliberate `--max-age-days` decision, not automatic.
  - **Verification links expired in 60 minutes.** All three builders — the welcome listener,
    the reminder, and the `VerifyEmail` override in `AppServiceProvider` — hardcoded
    `now()->addMinutes(60)`, so anyone opening the mail after lunch got a dead link, and the
    resend route sits behind `auth:sanctum`. A signed URL over an email hash is not a password
    reset. Now one `App\Support\EmailVerificationLink` builder on `auth.verification.expire`,
    defaulting to 72 hours, and the frontend's verify page offers "Send me a new link" instead
    of a dead end.
  - **~350 onboarding emails were never sent at all.** `failed_jobs` held 141 `WelcomeMail` and
    529 `VerificationReminderMail` rows, dominated by `Resend: Too many requests. You can only
    make 2 requests per second` — nothing throttled mail dispatch. **141 people never received
    a verification link in the first place.** New `resend-mail` limiter applied to all nine
    mailables via `App\Mail\Concerns\ThrottlesProviderRate`, mirroring the `groq-summary`
    limiter already on `GenerateTeacherAiSummaryJob`. The trait has to override
    `newQueuedJob()` because Laravel does not copy a Mailable's middleware onto the
    `SendQueuedMailable` wrapper it actually queues.
  - **Verification gated nothing, while the dashboard claimed otherwise.** `grep -c "'verified'"
    routes/api.php` returns 0. Rather than adding a gate — the marketplace has 145 lifetime
    applications, so suppressing supply is the more expensive mistake, and
    `Teacher::scopeRankable()` already keeps blank profiles out of shortlists — the banner now
    says the one thing that is true: unverified addresses are skipped by the job-alert digest.
- **CV extraction was failing on roughly half of uploads, and discarding most of what it did
  extract.** A CV is the highest-leverage action on the platform — verified teachers who upload
  one average a **89.1** profile score against **29.4** for those who don't — but
  `ProcessTeacherCvProfileJob` had 294 failures, led by `AI response for CV extraction was not
  valid JSON`.
  - **Structured output restored.** Commit `29f8799` had removed `HasStructuredOutput` and its
    schema in favour of prompting for JSON, which was correct at the time: the text model was
    `llama-3.3-70b-versatile`, which 400s on `response_format: json_schema` (still documented on
    `JobSearchParserAgent`, which is deliberately left alone). The model is now
    `openai/gpt-oss-120b`, which **does** support schemas — verified against the live API before
    changing anything. Two things had to be got right: Groq's strict mode requires `required` to
    list *every* property, so optional fields are `nullable()->required()` rather than omitted;
    and `->enum()` combined with `->nullable()` emits a bare `"string"` type, so the provider
    400s the moment the model correctly answers `null` for a CV that states no gender — the enum
    is dropped and the vocabulary enforced downstream where it already was. The prompt no longer
    restates the JSON shape with pseudo-types (`"is_current": "boolean"`), which is what invited
    the model to echo those literals back; it now carries only the closed vocabularies the
    schema cannot express. The prose parser is kept as a fallback for a provider that ignores
    `response_format`.
  - **Subjects, grades and city are now filled from the CV.** The extractor was already
    returning `experiences[].subjects_taught`, `.grade_levels` and `.city`, and
    `hydrateMissingFromCv()` was writing them to `teacher_experiences` and then **ignoring
    them** — a CV upload filled four scalars while leaving untouched the three fields that
    decide whether a teacher can be matched at all (subjects alone are 35% of the shortlist's
    structural score and 20% of the profile score). They are derived through `Taxonomy` and
    `CityName` so "Maths" and "Karachi." land on the slugs the scorer actually compares, still
    blank-only, and the job's skip-guard was widened to match or a teacher with a headline and
    no subjects would be treated as complete.
  - **Roles are no longer silently discarded.** Hydration required `institution_type`,
    `employment_type` *and* `start_date` to be non-blank, while `normalizeExtractedData()` nulls
    anything outside its allow-list — so "Beaconhouse, Lecturer, 2019-2022" reported as
    `private_school` vanished with no log line. Both enums carry an `other` member for exactly
    this and are now defaulted to it; `start_date` stays required because the column is NOT NULL
    and a made-up date is worse than an omitted role. Drops are logged either way.
  - Also: a `RateLimited` middleware on the job (it had none, unlike the summary job that shares
    the same Groq key), a `failed()` handler, and `cv_parsed_at`/`cv_parse_failed_at` so a
    teacher whose CV could not be read stops seeing the same "CV updated successfully!" toast as
    one whose profile was just filled in for them.
- **Registration asked for less than the backend already accepted, then made you log in again.**
  `RegisterRequest` has always validated `phone` and `AuthService` has always persisted it — no
  client ever sent one, so **every teacher started at `phone = null`**, forfeiting 10 profile
  points and leaving a dead WhatsApp button on the institution's shortlist. Adding the field was
  frontend-only. New `App\Support\PhoneNumber` canonicalises the three Pakistani spellings
  (`03xxxxxxxxx`, `+92…`, bare `92…`) to E.164 while leaving genuinely international numbers on
  their own dialling code — which also fixes the shortlist's WhatsApp link, whose old normaliser
  rewrote *any* leading `0` to `92` and so mangled the overseas numbers already in the table.
  Normalisation happens in `prepareForValidation()` rather than the service, because validating
  the raw input let `03001234567` pass `unique` against a stored `+923001234567` and then fail on
  the database constraint — a 500 where a 422 belongs. Registration also **discarded the Sanctum
  token the API already returns** and redirected to the login form, making people retype the
  password they had just chosen at the moment of highest intent; it now sets the cookie and sends
  teachers to a new single-action `/teacher/welcome` step that asks for a CV, explains why, and
  has a plain visible skip.
- **The profile-completion nudge never reached the people who needed it.** The only one that
  existed rode on the tutor-jobs digest, which `continue`s past a teacher when there are no
  matching jobs to send — and a teacher with no subjects matches nothing, so the reminder
  reached everyone *except* empty profiles. New standalone `teachers:send-profile-reminders`,
  modelled on `SendJobRecommendationEmails` (per-run cap, `email_suppressions` check, own
  send-state columns), naming the specific missing fields, gated on the two that decide
  rankability, capped at two sends 14 days apart and skipping accounts that have paused job
  matching (backend + frontend)

### Fixed
- **Recommended Teachers was ranking blank profiles above real candidates, and barely cared
  where anyone lived.** A Karachi "Montessori Directress" posting returned teachers from
  Lahore, Islamabad and Multan, with rows showing no city, no subjects and no experience
  scoring Match 69–74. Four independent causes, none of them "the teacher has no CV":
  - **A quarter of the corpus shared two embedding vectors.** `TeacherEmbeddingService::buildSearchDocument()`
    assembled its document with `array_filter`, and `gender` and `mode` are both NOT NULL with
    database defaults — so a profile where nothing had ever been filled in still produced
    `"Male teacher. Teaching mode: onsite"` and the `$document === ''` guard never fired. 954
    blank profiles were embedded on that one sentence; `teacher_embeddings.document_hash`
    showed **388 teachers sharing one vector and 35 sharing another**. Read literally that
    string *is* a description of a teacher, so it scored ~0.93 against any teaching query. The
    emptiness test now ignores the three parts that are true of everyone (gender, mode,
    country) and requires at least one thing the teacher actually told us. **Documents for
    teachers who have one are byte-identical, so stored hashes stay valid and no version bump
    or re-embedding was needed**; 899 stub rows were pruned (1,655 → 756 embeddings), and they
    regenerate on their own the moment such a teacher fills anything in.
  - **`NEUTRAL` was being applied when the *teacher* was silent, not just when the job was.**
    `JobStructuralScorer`'s 0.5 exists so a factor the job says nothing about counts neither
    way, but it fired whenever *either* side was missing — so an entirely empty profile
    collected a guaranteed 0.275 structural floor (city 0.5 + mode 1.0 + salary 0.5 + rating
    0.5) and, blended at 0.65 semantic / 0.35 structural, landed on exactly Match 70. New
    `Teacher::scopeRankable()` — `subjects` non-empty **OR** `cv_path` present — is now a hard
    elimination alongside blocked, unavailable and already-applied. **Deliberately not "has a
    CV"**: 159 teachers have their subjects filled in and no CV yet, and suppressing them would
    have cost real candidates to catch the blank rows, while still admitting 70 teachers who
    have a CV and nothing else. A CV keeps a teacher rankable because a human can read one even
    when the tags are empty. It is stated explicitly rather than left to the embedding
    requirement because the structural-only fallback drops that requirement, and that is
    precisely where blank rows do the most damage.
  - **Location was worth 7% of the score and compared with string equality.** City is 0.20 of
    the structural score which is 0.35 of the blend, so a Lahore teacher lost **3.5 Match
    points out of 100** against an identical Karachi one — and a teacher with no city at all
    lost the same, so leaving the field blank cost nothing. Worse, both sides are hand-typed
    `varchar(100)`: the top row of the reported screenshot read `Karachi.` and was scored as
    living elsewhere over a trailing full stop. New `App\Support\CityName` resolves a free-text
    value to a *set* of city keys — built like `Taxonomy`, an alias map plus a normalizer, no
    geocoding — handling punctuation, case, trailing provinces (`Lahore Punjab`), buried cities
    (`LAHORE (L033)`, `Chakri road … Rawalpindi Lane no 3`), multi-city values
    (`Islamabad/Rawalpindi` matches either), abbreviations and misspellings (`Khi`, `Fsd`,
    `Faislalabad`, `Wahcantt`) and Urdu spellings, while resolving `Pakistan`, `Punjab`,
    `online` and `1097` to nothing at all. `scoreLocation()` now separates **"wrong city"**
    from **"no city stated"** and scales both by whether attendance is actually required
    (onsite 0.05 / 0.25, hybrid 0.30 / 0.40, online stays neutral), and an onsite posting
    promotes `city` to 0.30 with every other factor scaled down proportionally so the weights
    still sum to 1.0. **The extra weight is deliberately *not* taken from `mode`**: that looks
    like dead signal because `teachers.mode` defaults to `onsite`, but among teachers who clear
    the rankability gate the largest group is `online`, and someone who only teaches online is
    genuinely unsuited to a school post. `jobs:send-recommendation-emails` now shares the same
    resolver, so its cross-city quality gate and the ranking can no longer disagree.
  - **The heaviest factor was mis-tagged on the postings themselves.** Montessori jobs were
    tagged `general-science` (handing the 0.35 subject weight to science teachers — that was
    the Lahore teacher sitting second) or `all`, which no teacher carries, so the subject
    factor divided by one and scored **every** candidate 0.0, collapsing the ranking onto the
    semantic side where the stub vectors lived. `montessori` and `early-years` are now real
    subjects in both `Taxonomy` and the frontend's `SUBJECTS` list (they were selectable in
    neither, which is why exactly one teacher carried the tag), and new
    `Taxonomy::constrainingSubjectSlugs()` drops `all`/`any`/`none` at the scoring boundary so
    such a posting reads as "states no subject preference". Kept out of `subjectSlug()` itself,
    which stays lossless — `all` is round-tripped by the write path and spelled out as "all
    subjects" by the tutor-job embedding recipe, so changing it globally would have silently
    re-hashed two embedding corpora. Five open Montessori postings were re-tagged off
    `general-science`.
  - **Recalibrated the semantic rescale against the cleaned corpus.** Measured across twelve
    postings spanning six subjects, query-to-teacher cosine sits at p50 0.67, p90 0.71, p99
    0.74 and tops out at 0.79 — so the old 0.55 floor scored the *median*, unrelated teacher at
    0.55 semantic, handing it 0.36 of the blend for free, while the top of the shortlist
    saturated at 1.00 and stopped discriminating. New `search.semantic.recommendation_floor`
    (0.62) with span 0.16. It is a **new knob rather than a change to `min_score`**, which is
    also `SemanticRanker`'s relevance cutoff for user-facing AI search — tuning a shortlist
    must not quietly tighten search recall across all three corpora. Same precedent
    `digest_min_score` set.
  - Admin widget: new "Same city only" and "Has CV" filters (reading from a deeper slice of the
    ranking, since the shortlist is truncated before the widget sees it, or a filtered view
    would show two rows), the ranker's existing strong/possible confidence band surfaced
    instead of a second hardcoded 70 that could drift from it, and Match no longer renders an
    integer as "70.0" (backend + frontend + Filament)

### Changed
- **Cut self-inflicted API request volume: slower notification polling, cached homepage
  widgets.** An nginx log review on the DigitalOcean droplet found the traffic burning through
  the (now-exhausted) Upstash command quota wasn't a scraper — it was `axios/1.13.2`, i.e. the
  Next.js server calling its own Laravel API. `NotificationBell.tsx` polled
  `/api/notifications/unread-count` every 30s via `setInterval`, and since the bell sits in
  `SiteHeader` (rendered from the root layout for every logged-in-user page view), that timer
  ran for the entire session on every route. The interval is now a named constant,
  `UNREAD_COUNT_POLL_INTERVAL_MS = 300000` (5 minutes) — job-match/invitation/status
  notifications don't need sub-minute latency, and users with web push enabled get real-time
  delivery regardless. Added a `window.addEventListener("focus", ...)` refetch alongside the
  existing `visibilitychange` listener, since visibility doesn't reliably fire in every browser
  when the OS window regains focus without a tab switch — so the badge still updates promptly
  when someone tabs back in, and the longer interval costs nothing in perceived freshness.
  Separately, the homepage's three widget calls (`getTeachersAction`, `getTutorJobsAction`,
  `getTutorJobStatsAction`) were re-fetching Laravel on every single render: they go through the
  shared axios client, which Next's `fetch()`-based cache/ISR doesn't cover, so there was no
  caching at any layer despite `TutorJobService::getHomepageStats()` already caching 12h
  server-side. Added `getFeaturedTeachersAction` and `getLatestTutorJobsAction` (fixed-params
  variants used only by the homepage) and wrapped `getTutorJobStatsAction` in place, all three
  via `unstable_cache` with a 5-minute revalidate — the general filtered/paginated
  `getTeachersAction`/`getTutorJobsAction` used by the directory and listing pages are
  untouched, so search results stay live. `ViewTracker.tsx`'s once-per-mount `useRef` guard was
  checked and left alone — that traffic is real user activity, not waste. Bell polling drops
  from 120 requests/hr/session (30s) to 12 (5min), a deterministic 90% cut; the three homepage
  endpoints are now capped at one live Laravel fetch per 5-minute window regardless of view
  volume, down from one fetch per homepage render. Rollback: `git revert` the
  `ustaadsearch-frontend` commit for this change.

### Fixed
- **Cache store reverted from Redis to `database`.** The Upstash Redis free tier hit its
  500K/month command cap (513K commands used against 193KB of the 256MB storage quota — a
  command-count problem, not a storage one), and cache operations were being rate-limited in
  production. `CACHE_STORE` reverts to `database`, which was already the framework default in
  `config/cache.php` (`env('CACHE_STORE', 'database')`) and the documented safe baseline in
  `.env.example`; the Upstash Redis env vars and the `redis` store config block are left in
  place, dormant, so re-enabling Upstash later is a one-line env change. Smoke-tested after the
  flip against the `database` driver: the `contact` rate limiter still returns 429 for a guest
  on the 6th request within the hour, and `InteractionService::recordView()`'s 24-hour dedup
  (itself cache-backed) still increments `views_count` exactly once per identity on a repeat
  view. This cutover is lossless — cache is ephemeral — and reversible by setting
  `CACHE_STORE=redis` + `php artisan config:clear` on the app server.

### Changed
- **Teacher profile pictures removed platform-wide; upload disabled; profile score
  reweighted.** Vercel's image-optimization quota was getting exhausted by phone-camera profile
  photos, and teacher photos were never load-bearing (the CV and text profile carry the actual
  signal). Teachers can no longer upload or update a profile picture — `PATCH
  /api/me/profile-picture` now 403s for the teacher role (institutions are unaffected and keep
  the feature in full). Every read path that could expose a teacher's photo now hides it
  unconditionally, including rows that still hold a URL from before upload was disabled: the
  public teacher directory and profile pages, job application/shortlist/recommended-teacher
  payloads, the teacher's own `/api/me` and `/api/me/teacher` responses, and reviews written by a
  teacher (an institution's review still shows theirs, gated through the new
  `User::publicAvatarUrl()` helper). The frontend replaces every teacher-facing avatar — search
  cards, the public profile page, the dashboard sidebar/header, the talent-pool panel, the
  applicant drawer, and reviews — with a plain colored-initials avatar
  (`components/ui/InitialsAvatar.tsx`) instead of fetching an image, so there's no network request
  to optimize in the first place; the `ProfilePictureUpload` dashboard control was removed from
  the teacher profile form (institutions keep it). `TeacherProfileService::calculateProfileScore`'s
  10% Profile Picture criterion is gone; a new Mobile Number criterion (10%) was added, CV Upload
  went from 15% to 20%, and Experience was trimmed from 10% to 5% to keep the total at 100 —
  `ProfileScoreCard.tsx`'s breakdown was updated to match (it previously nagged every teacher to
  add a photo they were no longer able to add). Fixed in the same pass: `updateForUser()` recomputed
  the score from a stale eager-loaded `user` relation, so a phone-number update in the same request
  wasn't reflected in the new Mobile Number score until the next save.

### Fixed
- **Follow-up sweep after the copy/trust pass below: two more `0.0`-style rating bugs, one more
  doubled title, one more false "verified" claim, and an off-by-one.** A second-pass review of the
  same audit against the resynced repo caught what the first pass missed. `PublicInstitutionClient.tsx`
  (an institution's own public profile — not just its directory card) rendered
  `{reviewSummary.average_rating || "0.0"}` unguarded in two places: the profile header badge and
  the sidebar "Rating Breakdown" widget. Both now use the same `formatPublicRating()` /
  `PUBLIC_RATING_THRESHOLD` helper already applied to `InstitutionCard` — the header badge (star +
  score + review count + separator) is omitted entirely below 5 reviews rather than showing a fake
  "0.0 (0 Reviews)", and the sidebar's "Avg. Rating" tile shows "—" instead of "0.0" (the "Total
  Reviews" tile and the per-star percentage bars stay as-is since 0 is an honest value there).
  `institution/dashboard/layout.tsx` had `title: "Institution Dashboard - UstaadSearch"` under the
  root layout's `"%s | UstaadSearch"` template — the earlier title-doubling sweep only covered
  public-facing routes and missed this dashboard layout; fixed to a bare title. `tutor-jobs/page.tsx`
  was only half-fixed the first time: the "Ustaad Search" → "UstaadSearch" spacing typo was
  corrected, but the underlying doubling (the branded string was still assigned to the top-level
  `title` field, not just to `openGraph`/`twitter`) was missed — now split into a bare title plus an
  explicit `socialTitle` for social cards, matching every other route. `/teachers` and `/jobs` still
  called teacher profiles and job listings "verified" in their metadata description and page copy —
  same false-verification pattern already fixed on `/institutions` and the homepage, now applied
  here too (title, both metadata descriptions, OG image alt text, and the page H1's subheading).
  Also fixed, in the same file already being edited for the rating gate: `InstitutionCard`'s
  `isHiring` flag required `active_jobs_count > 1`, so an institution with exactly one open role
  never got the "Hiring" badge — changed to `> 0`.
- **Privacy Policy, Terms of Service, and About pages; a "For Parents" nav entry.** The site had
  no `/privacy`, `/terms`, or `/about` route and no footer link to any of them — a copy audit
  flagged this as a real gap. `/privacy` and `/terms` are drafted from what the product actually
  does (S3-hosted CVs/photos, Resend email notifications and digests, WhatsApp used as an
  off-platform contact channel, Google Analytics, AI-assisted search) rather than boilerplate, and
  are explicitly marked in-page and in a file header comment as **draft, pending founder/legal
  review** — they carry bracketed placeholders (retention period, governing jurisdiction) instead
  of invented specifics. `/about` describes only features already shipped. Footer gets an "About"
  link and a "Legal" pair (Privacy/Terms) folded into the existing Support column rather than a new
  grid column, so the 4-column footer layout doesn't break. `SiteHeader`'s Guides dropdown (desktop
  + mobile) gets a third entry, "For Parents," pointing at the existing `/tutor-jobs` free-posting
  flow — parents were one of three audiences named on the homepage but had no nav entry naming
  them.

### Fixed
- **Guide pages (`/guides/teachers`, `/guides/institutions`) described features that don't exist.**
  An external copy audit of the live site was verified claim-by-claim against the actual code
  before anything changed. Confirmed false: a teacher "verification process" with document upload
  and identity checks (the only verification in the codebase is email verification —
  `verified_at` on `Teacher`/`Institution` is set exclusively by an admin Filament action, never by
  the account holder); a "Verified Ustaad" badge (appeared nowhere in `TeacherCard.tsx`, only in
  the guide copy itself — real badges are "Email Confirmed"/"Email Unconfirmed" plus a dot titled
  "Identity Verified"); a "proposals" system (the real mechanism is `JobApplication`; `proposals_count`
  on `job_posts` is a denormalized counter incremented by application create/delete, not a
  feature); freelance-marketplace vocabulary ("project-based rates" — the `rate_period` enum is
  `hour/session/week/month`, no "project" option exists; "remote projects," "request reviews after
  completion"); "thousands of verified teachers" (actual: 1,662 teachers, 8 admin-verified); and
  "Empowering Educators Globally" / "global network of vetted teachers" on a Pakistan-only product.
  Both pages are rewritten to describe only shipped behavior, and the institution guide gains a new
  step for the live "recommended teachers + invite to apply" flow
  (`RecommendedTeachersPanel`, `recordInvitationAction`), which previously appeared on neither
  guide despite being the real activation path for institutions. Both pages are also converted from
  client components to server components with real `generateMetadata` (unique title/description,
  correct `og:url`, canonical) — as client components they could export no metadata of their own
  and silently inherited the root layout's. The institution guide's full teal theme is dropped in
  favor of the site's indigo palette with teal kept as a single accent, so the two guides read as
  one product instead of two.
- **Doubled "| UstaadSearch" in page titles, on `/institutions` and 8 other routes.** The root
  layout's `title.template` is `"%s | UstaadSearch"`; several pages also hardcoded the brand into
  their own title string, rendering as `"X | UstaadSearch | UstaadSearch"`. Fixed by giving each
  page a bare `title` (so the template supplies the brand once) and an explicit `${title} |
  UstaadSearch` string only for `openGraph`/`twitter`, matching the pattern `/jobs/[slug]` already
  used correctly. Applied to `/institutions`, `/institutions/[username]`,
  `/institutions/[username]/reviews`, `/teachers`, `/teachers/[username]`, `/jobs`,
  `/tutor-jobs`, `/tutor-jobs/[slug]`, and `/contact` (the last two also had a stray "Ustaad
  Search" — missing the brand's internal spacing — normalized to "UstaadSearch"). `jobs/page.tsx`
  and `teachers/page.tsx` also carried an unrelated "round the world" / "across the world" claim in
  the same title strings being touched; dropped for the same Pakistan-only reason as the guide
  pages, since fixing the title required rewriting that exact line anyway.
- **`/institutions` overstated verification and hid data quality problems.** Page copy and metadata
  called the directory "verified schools" — only 10 of 68 seeded institutions have `verified_at`
  set — so "verified" is now dropped from copy/title/description; the per-card emerald dot still
  correctly gates on the real `verified` flag. Every institution card also unconditionally rendered
  a `0.0 | 0 Reviews` badge regardless of review count. Added `formatPublicRating()` /
  `PUBLIC_RATING_THRESHOLD` to `lib/utils.ts`, mirroring the existing `formatPublicProposals()` /
  `PUBLIC_PROPOSALS_THRESHOLD` pattern used on `/jobs/[slug]`, and gated `InstitutionCard`'s rating
  block behind it — below 5 reviews it now renders nothing rather than a misleadingly low score.
  Separately, the "Dedicated to providing quality education." filler shown on ~31 of 68 institutions
  turned out to be a frontend fallback (`description || "..."`in `InstitutionCard.tsx`), not stored
  data — confirmed by querying the institutions table directly (zero rows contain that string; 31
  have a null/empty `description`). Removed the fallback; cards with no real description now omit
  the About section instead of showing invented copy. Two records have genuine data-quality
  problems in stored data (not fixed here, per explicit instruction not to bulk-edit records
  without sign-off): institution id 41 ("The Educators")'s description is Beaconhouse School
  System's own boilerplate, and id 31 ("Roots IVY International School & College, Faisalabad")'s
  description is about an unrelated law school's LLB/LLM programs.
- **Homepage: mislabeled/inconsistently formatted stat, duplicate value-prop section, unverifiable
  claims, emoji headings, and inconsistent brand spacing.** The hero labeled the tutor-job count
  "jobs posted" (unformatted, e.g. `1998+`) while the CTA section labeled the identical number
  "tutor jobs" (comma-formatted, `1,998+`); both now read "tutor jobs posted" and use
  `toLocaleString("en-PK")`. Two sections said essentially the same thing ("Built for Teachers and
  Institutions," 2 cards, vs. "Dedicated Solutions for Every User," 3 cards); removed the 2-card
  version (which also carried the "Hire Verified Teachers" heading) and moved the 3-card version
  below Featured Opportunities per the requested ordering. Removed "verified teaching jobs
  worldwide," "pre-screened," and "verified credentials" from the remaining cards (replaced with
  claims the product can back: Pakistan-scoped jobs, AI-ranked recommendations, real reviews); the
  H1 and hero badge no longer make an unverifiable "best job-matching site" / "professional network"
  claim — the hero now branches its headline on the same `currentUser?.role === "institution"`
  signal `page.tsx` already used for the default search tab, rather than adding new state.
  "Pakistan's leading education marketplace" / "the leading job board and marketplace" dropped from
  homepage and root-layout metadata (both now say "free... in Pakistan," which is verifiably true);
  "The premium marketplace... connecting excellence with opportunity" dropped from the footer.
  Section-heading emoji (👩‍🏫👨‍🏫 / 👨‍👩‍👧‍👦 / 🏫) removed for consistency with the lucide icons used
  everywhere else on the page. "Ustaad Search" (missing the brand's internal spacing) in the "How
  ___ Works" heading and the "Dedicated Solutions" subhead normalized to "UstaadSearch." Featured
  teacher cards were checked for the reported untruncated-`about`-text bug and found already
  clamped (`line-clamp-2`) in both `FeaturedOpportunitiesSection` and `TeacherCard` — no change
  needed there.

### Added
- **"Claim this listing" for external job posts.** Roughly 88% of open jobs are operator-seeded
  external mode with no owning account (`application_mode='external'`, `institution_id` null,
  poster identity held only in `external_contact_name/email/phone`), and until now that was a
  dead end — CHANGELOG history for the recommendation-email send explicitly noted "no claim flow
  exists in the app." Proof of ownership is deliberately narrow: a **verified** `users.email`
  matching a job's `external_email`, normalized on both sides (`LOWER(TRIM(...))` in SQL rather
  than PHP, since MySQL's `utf8mb4_unicode_ci` collation is case-insensitive but SQLite — dev and
  tests — is not, and the two would otherwise silently disagree). Knowledge of the address is
  never accepted as proof, because `external_email` is already public and unauthenticated on
  `/api/jobs` and the job detail endpoint — only `email_verified_at` proves control of the inbox.
  Claiming is all-or-nothing per address: every external job sharing the normalized email
  transfers together, the same grouping `SendJobRecommendationEmails` already uses and for the
  same reason (`institution_id` is null on every external job, so email is the only identity that
  ties them together). New `App\Services\Job\JobClaimService` is the one place the transfer
  happens — `institution_id` set, `application_mode` flipped to `managed`, and the four
  `external_*` columns nulled (not cosmetic: `JobPostController::show()` serializes
  `external_contact` unconditionally, so a claimed job would otherwise keep leaking the school's
  old contact details) — behind a `DB::transaction` with `lockForUpdate()` and a
  `whereNull('institution_id')` re-check, so two triggers racing the same job can't double-claim
  it. A new `job_claims` table (one row per job, `job_post_id` unique) is both the idempotency
  guard and a reversal snapshot (`previous_contact`) an admin can restore from. Three callers
  share the service: a new `ClaimExternalJobsOnVerification` listener on Laravel's `Verified`
  event — the same shape as the existing `ApprovePendingGuestReviews`, which already retroactively
  binds previously-unowned records to a newly-verified user — auto-claims silently the moment an
  institution verifies an email that matches; `POST /me/institution/claims`
  (`App\Http\Controllers\JobClaimController`, its own `job-claim` rate limiter) backs a "Claim
  this listing" button on `/jobs/[slug]` for institutions that verified before this shipped; and a
  new `jobs:claim-external` command (`--dry-run`) reconciles the rest, scheduled `dailyAt('03:30')`
  — deliberately ahead of `jobs:send-recommendation-emails` at 04:00, so a job claimed overnight
  emails its shortlist to the new owner's dashboard rather than the now-stale external address.
  The listener wraps the service in try/catch: a claim failure must never turn a successful email
  verification into a 500. A phone-only external job (`AiJobImport` accepts email *or* phone) is
  never claimable — `JobPost::isClaimable()` requires an email specifically, and the frontend
  button only renders when it's set. Claiming does not touch `institutions.verified_at` (admin
  review) or set it from `is_email_verified` (an email click) — the two are deliberately different
  signals, per the existing docblock on `Institution`. A queued `ExternalJobsClaimedMail` confirms
  the transfer once per claiming user, not once per job, and carries a reply-to-dispute line for
  the residual risk this flow accepts: an operator typo pointing the wrong contact email at an
  import. Filament's Job Posts table gets a `Claimed By` column, a `Claimed` filter, and an
  `Unclaim` action that restores the pre-claim state from the snapshot (backend + frontend +
  Filament)

### Fixed
- **Teacher AI summary jobs no longer storm the Groq rate limit** — production logs showed
  `GenerateTeacherAiSummaryJob` failing daily with 429s after Groq retired
  `llama-3.3-70b-versatile` and the app moved to `openai/gpt-oss-120b`, which has a tighter
  budget. The job had no backoff, so a failed attempt was re-released with zero delay and one
  429 became a retry storm. Four layers now handle it: the job retries on a spaced backoff
  (60/180/300/600s) within a 6-hour `retryUntil` window; a proactive `RateLimited('groq-summary')`
  queue middleware caps dispatch throughput (`GROQ_SUMMARY_RATE_LIMIT_PER_MINUTE`, default 15 —
  tune to the model's actual budget in the Groq console); `TeacherSummaryAgent` now declares
  Gemini as a failover provider, so a Groq 429 generates the summary immediately on
  `gemini-flash-lite-latest` instead of waiting out backoff (a new `LogAiProviderFailover`
  listener makes each failover visible in the logs); and the job is
  `ShouldBeUniqueUntilProcessing` keyed by teacher ID, because `TeacherProfileObserver` fires
  once per saved model — one profile edit saving the Teacher plus several educations and
  experiences used to queue that many identical summary jobs, each burning a Groq call for
  the same output.
- **Retired Gemini text model default replaced** — the Gemini text default was the withdrawn
  `gemini-2.0-flash` (the API now returns 404 for it); it is now the `gemini-flash-lite-latest`
  alias, which Google keeps pointed at the current flash-lite release so it cannot rot the
  same way. Check that production's `GEMINI_MODEL` env var (if set) isn't still pinning a
  retired model.
- **Test suite no longer burns production AI quota** — the base `TestCase` now fakes
  `TeacherSummaryAgent` globally (mirroring the existing `Embeddings::fake()`), because any
  test creating a Teacher triggered a real Groq call via the observer with the production key
  from `.env` — flaking the suite whenever quota was spent, and every `composer test` run
  consumed the same rate budget the production queue needs. The suite is also ~6x faster
  without the network calls.

### Changed
- **Public job cards show view count instead of proposal count** — the listing card
  (`JobCard.tsx`) previously always displayed "Proposals: ..."; it now shows "Views: N" once a
  job passes 5 views, and nothing in that spot otherwise. `views_count` already existed on
  `JobPost` and was already returned on the job detail endpoint, but the shared listing
  transform (`JobPostController::transformListing()`, used by `/api/jobs`, AI search, and
  related-jobs) never included it — added it there so all three listing consumers get real
  view counts. Institution-facing views (dashboard job table, analytics) are unaffected; they
  never went through this card.

### Added
- **Nightly "recommended teachers" email for newly posted jobs** — almost every job on the
  platform right now is operator-seeded external mode, meaning the poster has no account and
  no dashboard, so the recommended-teachers panel (a pull surface) never reaches them. New
  `jobs:send-recommendation-emails` (backend) finds job posts published in the last 24 hours,
  computes each one's existing `JobPostService::recommendedTeachersForJob()` shortlist
  unchanged, and emails it to whoever posted the job — one email per **normalized recipient
  address** (`Str::lower(trim($email))`) per run, not per job or per institution, because
  `institution_id` is `null` on every external job and the same school can post one managed
  job and one external job, or the same `external_email` twice with different casing, and all
  of those must collapse to one send. Runs `dailyAt('04:00')` (09:00 PKT — after the
  02:00/02:30/03:00 embed-all commands, at the start of a Pakistani school/office day),
  scheduled in `routes/console.php`.
  - **Contact-detail leak was the primary risk.** `recommendedTeacherPayload()` includes
    teacher `email`, `phone` and `cv_path` — never safe to hand a template. Extracted the
    masking whitelist `ShortlistPdfService` already had (`teacherViewData()`) into a shared
    `App\Services\Recommendation\RecommendedTeacherPresenter`, now consumed by both the PDF
    and the new mail, so there is exactly one place that decides what a teacher record is
    allowed to leave the platform through — a second copy is how it drifts. The presenter
    takes a `source` param for the `?src=` profile-link marker (`sl` for the PDF, `rec-email`
    here) and now also carries `match_score`/`match_reasons` (already non-PII in the payload),
    which the PDF didn't need but the email does.
  - **Duplicate protection: new `job_posts.recommendations_emailed_at`**, stamped
    synchronously at queue time (mirroring `teachers.last_digest_sent_at` in
    `SendTutorJobsDailyDigest`) and read as `whereNull(...)`. The founder's stated call is that
    losing a night of coverage is fine — no retry/backfill machinery, a strict 24h window on
    `published_at`, full stop — but that is a decision about *coverage*, not about *resending*.
    A re-run to check the template, a re-run after a mid-batch Resend 5xx, or `renewJob()`
    resetting `published_at` on a renewal, all had to be unable to double-email a recipient.
    Only jobs actually included in a queued email get stamped; a job skipped for a thin
    shortlist or an unresolvable address is left unstamped and simply ages out of the 24h
    window on its own rather than being retried.
  - **Opt-out: new general-purpose `email_suppressions` table** (keyed on normalized email,
    with `source`/`reason`) plus a no-login signed `/unsubscribe` route
    (`UnsubscribeController`) — neither existed anywhere in the app (the n8n outreach
    workflows suppress against a Google Sheet, not this app). Built general rather than scoped
    to this one command, since consolidating with the n8n suppression list is an obvious
    future move and the cost of doing so now is one nullable `source` column; only this
    command reads it today, so nothing else changes behavior.
  - **Quality gate over coverage**: a job is skipped (logged, not failed) when its shortlist
    is empty or when fewer than `search.recommendation_email.min_qualifying_teachers` (default
    3) teachers clear `min_combined_score` (default 0.55) — and a teacher whose city doesn't
    match the job's must clear it by a further `cross_city_score_bonus` (default 0.15) to
    count, which directly targets the thin-pool risk named for the send (a Lahore job
    returning location-mismatched candidates that would otherwise clear a flat floor). None of
    this touches `recommendedTeachersForJob()`, the ranking, or `RECOMMENDATION_ALGORITHM_VERSION`
    — it only decides, after the fact, whether the existing output is good enough to be
    someone's first impression of the platform. Also logs (does not skip) when a shortlist was
    built on the structural-only fallback (`EmbeddingProfile`-driven, all `semantic_score`
    null), so a quality complaint traces back to a missing embedding rather than staying a
    mystery.
  - **Recipient framing is honest, not just compliant**: the email states plainly near the top
    that the job is listed on UstaadSearch and explains it may have been imported from a
    public posting when any job in the group is external-mode, with the unsubscribe link
    always in the footer regardless of mode. Per-job CTA differs by mode — managed jobs deep
    link to `.../applications#recommended-teachers` (the real conversion path, tracked via
    `invitations.viewed_at`/`applied_at`); external jobs get no invented "claim your listing"
    link (no claim flow exists in the app) and instead point to a reply-to-this-email
    (`support@ustaadsearch.com` already runs the manual concierge loop) plus the public
    teacher profile and job page. No invite buttons for external recipients and no attached
    PDF — both explicitly out of scope; invitations are institution-initiated from an
    authenticated panel, and the PDF carries an operator-supplied note this automated send has
    no equivalent for.
  - Ships with a plain-text mail part (`emails.job-recommendations-text.blade.php`) — a first
    for this codebase (all 7 existing mailables are HTML-only) — since these recipients are
    non-technical school admin addresses on basic hosting, where an HTML-only send is a
    deliverability risk the existing sends haven't had to worry about.
  - `--max-emails` (default `search.recommendation_email.max_emails`, 50 — shares the Resend
    allowance with the 70/day tutor-jobs digest) and `--dry-run` (reports groups, recipients
    and per-job shortlist sizes without sending or stamping anything).
- **Similar tutor jobs on the tutor job detail page** — `GET /api/tutor-jobs/{slug}/related`
  and `TutorJobService::getRelatedTutorJobs()` (via `SimilarityService::similarTutorJobs()`)
  shipped with semantic tutor job search, but nothing on the frontend called it, so tutor
  job listings had no "you might also like" surface even though job posts already did.
  New `getRelatedTutorJobsAction()` fetches related listings in parallel with the job
  itself (`Promise.all`), rendered through a new `SimilarTutorJobs` component — mirrors
  `SimilarJobs` but built on the existing `TutorJobCard` grid layout already used by
  `/tutor-jobs` — inside the tutor job detail page's main content column, rendering
  nothing when the list is empty (frontend)
- **Teachers can say what they're available for, and two switches control it rather than one.** A teacher had no way to tell the platform they weren't looking, so a shortlist could spend an institution's invite on someone who had taken a job three months ago, and the 09:00/18:00 match notifications kept firing at people who had stopped reading them — the only exit was deleting the account. New `teachers.available_for_jobs` and `teachers.available_for_tutoring`, both defaulting **true** (this is an opt-out; an opt-in default would have emptied every recommended-teachers shortlist the moment the migration ran). **Two flags rather than one because the two markets are genuinely separate**: a teacher already holding a full-time school post is unavailable for another one and still available for evening tutoring, and a single switch would force them to pick between being invisible to half the marketplace and being invited to work they cannot take. `available_for_jobs` is a hard elimination in `JobRecommendationService::eligibleTeachersQuery()` alongside blocked and already-applied — it is not a scoring factor, because a teacher who has paused cannot take the job — and is **re-applied when `JobPostService::recommendedTeachersForJob()` hydrates a cached ranking**, for exactly the reason the gender elimination already is: the job's own edits rotate the cache key, but a teacher flipping a switch inside the 30-minute window does not. `available_for_tutoring` short-circuits `TeacherProfileService::getRecommendedTutorJobs()`. Both flags also gate the teacher's *own* inbound alerts, per stream: `SendJobMatchNotifications` and `SendTutorJobsDailyDigest` now skip the school-jobs matcher or the tutor-jobs matcher independently, and eliminate teachers who are off on both from the chunked query entirely — which as a side effect stops them consuming a slot in the 70-email/day digest rotation, so everyone still looking cycles round slightly faster. The gating sits at the two callers rather than inside `JobPostDigestService`/`TutorJobDigestService`, because both services are shared by both commands and neither should have to know about a flag that isn't its own. **Deliberately *not* a hide switch**: the public directory, AI search, the profile page, similar-teachers and the talent pool are untouched, so a paused teacher stays browsable and contactable and simply stops being pushed at people — `TeacherResource` and `TeacherCardResource` are unchanged, which is also why the endpoint skips `forgetProfileCache()` (nothing public moved). New `PATCH /me/teacher/availability` with its own `UpdateTeacherAvailabilityRequest` rather than two more fields on `PUT /me/teacher`: that request validates `gender` as `required`, so a toggle would have to resend the whole profile to flip one boolean, and `updateForUser()` recomputes `profile_score` from nine fields — pausing job matches should not move a teacher's score. Frontend: a new `AvailabilitySettingsPanel` on the teacher dashboard's Settings tab (not inside `AccountSettingsPanel`, which the institution dashboard shares), with optimistic toggles that roll back and toast on failure, `role="switch"` semantics, and a padded tap target because a 44×24 track is too short to hit reliably on a phone. Admin gets read-only availability columns and form toggles on the Filament teacher resource, so "why am I not getting matches?" is a one-second look rather than a support conversation (backend + frontend + Filament)
- **"Recommended Teachers" for institution-managed tutor jobs, bringing tutor jobs up to parity with regular job posts on both the institution dashboard and the admin Filament panel.** Tutor jobs previously had no matching mechanism at all — an institution posting a tutoring opening got a public listing and nothing else, unlike job posts which get a ranked shortlist the moment they're published. New `TutorJobStructuralScorer` (subject/grade overlap, city, mode, fee fit, experience, rating — same weighting as `JobStructuralScorer`, adapted to tutor_jobs' fields: no country column since the marketplace is domestic-only, `preferred_mode`/`fee`/`fee_type` instead of `mode`/`salary_max`, and a hard `preferred_gender` elimination instead of job_posts' softer field) and `TutorJobRecommendationService` (same semantic 0.65 / structural 0.35 blend as job posts) back a new `recommendedTeachersForTutorJob()` on `TutorJobService`, cached 30 minutes per listing the same way job recommendations are. The semantic side deliberately reuses `TutorJobEmbeddingService::buildSearchDocument()` as the query text rather than duplicating it the way `JobRecommendationService` does for job postings — that document was already written to exclude fee/gender (structured, scored separately) and already phrased to line up with `TeacherEmbeddingService`'s documents, so nothing tutor-job-specific was needed. New `GET /me/institution/my-tutor-jobs/{tutorJob}/recommended-teachers` (gated by the existing `update` policy, which already only allows the owning institution — guest-posted listings have no dashboard to act from and are structurally excluded). On the frontend, `RecommendedTeachersPanel` gained `publicBasePath`/`trackInvitations`/`subtitle` props instead of being duplicated: tutor jobs have no formal application flow and no invitation table, so invite emails/WhatsApp messages/copy go straight to the teacher without the record-invitation round trip job posts do. New dashboard route `tutor-jobs/[slug]/recommended-teachers`, linked from the Tutor Jobs table's row menu and a new "Recommended Teachers" column (open listings only, mirroring the My Jobs table). On the admin side, a new `RecommendedTeachersForTutorJobWidget` mirrors the job post widget field-for-field (email/WhatsApp/CV/profile row actions, "Download Shortlist PDF" bulk action reusing `ShortlistPdfService` via new `generateForTutorJob()`/`filenameForTutorJob()` methods) and is attached to `ViewTutorJob`'s footer only when the record has an owning institution (backend + frontend + Filament)
- **"Download Shortlist PDF" bulk action on the admin Recommended Teachers widget** — the widget could only be read on screen or acted on one row at a time (email, WhatsApp, CV, profile), so getting a candidate list in front of a hiring panel meant screenshots or retyping. Ticking up to five rows and submitting the action now streams a one-or-two-page PDF: job title, institution, an optional free-text "Position focus" note captured in the action's modal, then a numbered card per teacher with name, verified badge, subjects, city, experience, salary expectation, a two-line summary and a `ustaadsearch.com/teachers/{username}?src=sl` profile link (the `src=sl` marker is what separates shortlist-driven profile visits from ordinary search traffic). New `barryvdh/laravel-dompdf` dependency, `ShortlistPdfService::generate(JobPost, array $teacherIds, ?string $positionFocus)` and a table-based `resources/views/pdf/teacher-shortlist.blade.php` — dompdf has no flexbox or grid, so every column in it is a real `<td>` and the label columns are pinned with a `<colgroup>` so they align across cards. Two constraints shaped the service rather than the view: it re-reads `recommendedTeachersForJob()` and copies across only the presentable fields, so teacher **phone, email and CV files are structurally unable to reach the template** (the shortlist is a document that leaves the platform, and the CV is the teacher's to hand over, not the admin's to forward); and it hard-caps at five teachers in the service as well as in the action, because past five it stops being a shortlist and the reviewer is better served by the table itself. Ranking order is the recommendation order, not the order rows were ticked. The recommendation service and its payload shape are untouched — this reads the existing `recommendedTeacherPayload()` output as-is (Filament)
- **"Recommended Teachers" column on the institution dashboard's My Jobs table**, linking straight to the shortlist panel (`.../applications#recommended-teachers`, with a matching anchor on the panel) instead of leaving it buried at the bottom of a job's applications page where institutions had no reason to scroll. The column shows a "View matches" link for open jobs only and an em dash otherwise, mirroring the page itself, which now builds the shortlist only for open jobs. It deliberately shows a link rather than a match count: the count would mean ranking every job in the table on every dashboard load, and `recommendedTeachersForJob()` is the expensive call on that page — cached per job for 30 minutes, but a cold list of 25 jobs would pay it 25 times. The mobile card view gets the same link as a pill under the status/proposals row (frontend)
- **Semantic search and "similar listings" for tutor jobs, bringing the third corpus up to parity with teachers and job posts.** Tutor job AI search was never semantic — Groq extracted structured filters and SQL did the rest, so "evening tuition for a weak matric student who needs confidence before board maths exams" could reach `evening`/`matric`/`maths` and nothing else; "weak student", "confidence building" and "board exam preparation" had no way to match a description that says exactly that in other words. New `tutor_job_embeddings` table (same shape as `job_post_embeddings`), `TutorJobEmbeddingService`, `EmbedTutorJobJob`, `TutorJobObserver` and a `tutor-jobs:embed-all` backfill, plus `SemanticTutorJobSearchService` wired into `POST /api/tutor-jobs/ai-search` alongside the existing parser — filters build the eligible set, embeddings order it. The observer is simpler than `JobPostObserver` because subjects and grades are JSON columns on `tutor_jobs` rather than child tables, so `wasChanged()` covers them and there is no bulk-sync path bypassing model events. Contact details are deliberately excluded from the embedded document: `TutorJobResource` masks `email`/`phone`/`address` for guests, and a masked field that can still be retrieved by searching for it is not masked — the street address is coarsened to a neighbourhood (`House 12, Street 4, F-8/3` becomes `F-8/3`, keeping the digits that carry Pakistani sector and phase names while dropping the street-level segments), and fee and preferred gender stay structured-only for the same reason salary is excluded from job documents. Also new: `GET /api/tutor-jobs/{slug}/related` via `SimilarityService::similarTutorJobs()`, reusing the stored document vectors with no extra API call and the same `null` (no usable embedding, fall back structurally) versus `[]` (compared, nothing close enough) contract as the other two corpora (backend)
- **Sidebar filters now apply to AI searches on all three boards.** The filter sidebar stayed visible during AI search, kept rewriting the URL, and was dropped entirely before the request — the AI request classes validated only `ai_query`/`page`/`per_page`/`sort`, and the pages sent nothing else. So a user could search with AI, tick "Lahore", watch the URL change, and get results untouched by it. The three `AiSearch*Request` classes now accept the same filter fields as their `Index*Request` counterparts, and the controllers merge them over the extracted ones with **manual selections winning** — typing "patient maths teacher for a weak student" and ticking City=Lahore, Mode=Online now gives semantic intent *plus* hard constraints, which is stronger than either alone. A new `applied_filters` key reports what actually constrained the search, alongside the existing `extracted_filters` that drives the AI chips. Load More on both lists sends the same filters, or page 2 would arrive unnarrowed and append onto a filtered page 1 (backend + frontend)
- **`embeddings:status`, plus `--limit` and rate-limit fail-fast on the three `embed-all` backfills.** A corpus larger than one day of provider allowance could not be backfilled: once the daily quota was spent, every remaining batch burned the full retry ladder (30+60+120s) before failing and the run continued anyway, so ~14 batches cost about an hour of waiting and left the corpus pocked with **scattered** stale rows rather than stopping cleanly at a known point — which reads as "it's stuck" rather than "it ran out of quota". Back-to-back rate limits that survive the per-batch backoff now stop the run (`--give-up-after`, default 2), because a daily quota cannot be waited out from inside a single run, and `--limit=N` sizes a run to the daily allowance so a large corpus converges over consecutive days. Neither loses work: an up-to-date record is skipped locally by the document-hash and profile check without an API call, so re-running resumes for free. `embeddings:status` reports, per corpus, how many records are **searchable** rather than merely embedded — "has an embedding row" and "is scannable" diverge whenever a recipe bump or an unfinished backfill leaves rows on an old profile, and nothing surfaced that gap short of hand-written SQL across three tables (backend)
- Teacher registration now asks for gender (defaulting to Female) instead of leaving it unset until the profile edit screen. The select only renders for the teacher role, and `POST /api/auth/register` accepts an optional `gender` (`male|female`) that rides along on the `UserRegistered` event so `CreateRoleProfile` can stamp it on the Teacher row it already creates — no extra query or migration. Gender was previously an `enum` column defaulting to `male`, so every teacher who hadn't yet edited their profile was silently male to the gender-filtered surfaces (job-post gender requirements, recommendations, digests); new signups now carry the value they picked, and a re-registration onto a restored soft-deleted account overwrites the old row's gender rather than keeping the stale one. Left the request rule `nullable` rather than `required_if:role,teacher` so existing API clients that don't send the field keep working — they get the female default (backend + frontend)
- **Similar jobs on the job detail page** — job postings had no "you might also like" surface, so a teacher who opened one listing had no path to related ones short of going back to search. New `GET /api/jobs/{slug}/related` (public, cached 2 minutes) reuses the same embedding-first pattern as recommended teachers: `JobPostService::getRelatedJobs()` asks the new `SimilarityService` for the job's nearest neighbours by cosine similarity over the existing `job_post_embeddings` table (no extra API call — it reads the stored `RETRIEVAL_DOCUMENT` vector written by semantic job search), gated at a 0.65 minimum score and cached 10 minutes per job/profile/limit key, falling back to `getRelatedJobsStructural()` (subject/grade/city/mode `orWhereHas` matching, same shape as the old recommended-teachers fallback) when the job has no usable embedding — so this works before or independent of any embedding backfill. `SimilarityService::findSimilar()` is written generically over a table/owner-key/vector so `similarTeachers()` and `similarJobs()` are both thin wrappers, leaving room for a third entity type later without duplicating the ranking logic. The job detail page fetches related jobs in parallel with the job itself (`Promise.all`) via a new `getRelatedJobsAction()` and renders them through the existing `JobCard` inside a new `SimilarJobs` component, rendering nothing when the list is empty (backend + frontend)
- "Recommended teachers" now has a "Download CV" option alongside Email invite/WhatsApp/Copy/Profile on the institution dashboard's job detail panel; the matching Filament admin widget gained both a "CV" and a "Profile" row action (previously email/WhatsApp only) — `cv_path` and `username` were already present in the shared `recommendedTeacherPayload()` response consumed by both surfaces, so this was UI-only: no backend or type changes needed (frontend + Filament)
- **Semantic AI job search** — `/jobs` had no AI search at all (it silently ignored an `ai_query` param) and relied on MySQL full-text over title/description, so a teacher searching "school physics teacher role involving lab experiments and O Level students" could not find a posting titled "Science Teacher — Secondary Section". Job posts are now embedded as 768-dim Gemini vectors in a new `job_post_embeddings` table and ranked by cosine similarity behind `POST /api/jobs/ai-search`, with the same architecture as teacher search: Groq extracts the hard structured filters (city, mode, type, shift, salary, subjects, grades) and similarity ranks what's left, so structured intent stays a hard constraint and recall can never regress against the conventional search. The design point that matters most: **this is not the vector `JobRecommendationService` already built.** That one embeds a job as a `RETRIEVAL_QUERY` to search *against teacher documents*; user-facing job search is the opposite direction, so job posts need their own `RETRIEVAL_DOCUMENT` embeddings. Gemini places queries and documents asymmetrically in the same space, so reusing one vector for both would put one side on the wrong task type — the two builders are deliberately separate, and only one is persisted. Salary and gender are kept out of the embedded document (both are exact structured constraints, and embeddings cannot reason about numeric ranges) while `requirements`, `shift` and the hiring institution's name are included. New `JobPostEmbeddingService`, `SemanticJobSearchService`, `EmbedJobPostJob`, and a `jobs:embed-all` backfill scheduled nightly at 02:30; `JobPostObserver` now dispatches embedding refreshes alongside the recommendation recompute, watching `requirements`/`shift` in addition to the existing match fields. `JobPostService::search()` gained `relevance_order`/`relevance_strict` support — implemented as a bound `CASE id WHEN ... END` expression rather than restructuring its query-builder pagination into TeacherService's load-then-slice approach (MySQL's `FIELD()` is unavailable on SQLite, and the ranked list is capped at 200 by `semantic.max_results`). The existing full-text path is untouched: semantic ranking layers on top of structured + lexical filters rather than replacing them. `JobSearchParserAgent` is the first agent in the codebase to use Laravel AI's `HasStructuredOutput` schema instead of prompting for JSON and recovering it from prose. Degrades gracefully to `best_match` ordering with `meta.semantic: false` when Gemini is down or nothing is embedded, so it is safe to deploy before the backfill runs (backend + frontend)
- **Semantic recommended teachers** — the "Recommended Teachers" panel (institution job detail + Filament job page) previously ranked candidates with a live keyword query: an `orWhereJsonContains` net over `teachers.subjects`/`grades` capped at 80 rows, scored by an additive 0–100 heuristic. That capped recall on broad postings, recomputed on every page load, and — crucially — could only find teachers whose taxonomy tags literally matched the posting's, even though the platform already had 768-dim Gemini embeddings for ~90% of teachers powering AI teacher search. Recommendations are now **precomputed** into a new `job_recommended_teachers` table (top 50 per open job) blending semantic similarity with a structural score. The candidate set is now *every* eligible teacher, not 80. The important calibration detail: raw Gemini cosine is range-compressed (unrelated pairs sit at 0.50–0.65), so feeding it straight into a weighted sum would hand every teacher the same large constant and leave nothing to rank on — similarity is therefore rescaled against a fixed anchor (`min_score` → 0.0, `min_score + recommendation_span` → 1.0) *before* blending at 65/35 with the structural score. The anchor is fixed rather than per-job so stored scores stay comparable across jobs, which the `(teacher_id, combined_score)` index exists to exploit later. New `JobRecommendationService`, `JobStructuralScorer` (subject/grade overlap, city, mode, salary fit, experience, rating), `MatchReasonPresenter`, `ComputeJobRecommendationsJob`, `JobPostObserver`, and a `jobs:compute-recommendations` command (`--dry-run` reports the similarity distribution so the span can be set from real data rather than guessed; `--sync --sleep` paces the backfill against Gemini's rate limit). Scheduled nightly at 03:00, after `teachers:embed-all` at 02:00, so it ranks against fresh embeddings. Three design points worth recording: teachers with no embedding are ranked *after* every embedded teacher rather than dropped, so recall never regresses against the old recommender; a job naming a gender now hard-excludes mismatched teachers instead of applying a soft +5 bonus, matching how the teacher-side digest has always filtered; and the observer also watches `job_post_subjects`/`job_post_grades`, because tags are synced separately from the parent save so `JobPost::updated` never fires for the edit most likely to change who should be recommended — `ShouldBeUnique` (a first for this codebase) collapses the resulting burst of tag writes into one compute. Fully backward compatible: `recommendedTeachersForJob()` returns the identical payload shape and falls back to the live structural path whenever a job has no stored rows (fresh posting, draft, queue outage), and `match_reasons` stays a list of sentences with the structured breakdown exposed alongside it as `match_breakdown`, so neither the dashboard nor the widget needed a change. The compute also skips its one paid API call entirely when no teacher embeddings exist at all (backend)
- Monthly `listings:cleanup-stale` command closes a gap the existing hourly expiry commands (`jobs:expire-posts`, `tutor-jobs:expire-posts`) never covered: both only match rows with a *past* `expires_at`, so a job post or tutor job created with no expiry date at all stayed `open` and listed forever. The new sweep (scheduled 1st of each month at 03:30) only touches open, undated listings that are at least 30 days old (`--days` to override), so a freshly posted undated listing isn't caught on day one — it marks matching job posts and institution-managed tutor jobs as `expired` (via the existing `JobPostService`/`TutorJobService` status-transition methods, so the job-expired notification still fires for institutions), and deletes matching tutor jobs that have no owning institution outright — those are guest/user-posted leads with no account behind them to notify or renew, so expiring-in-place would just leave permanent clutter. Supports `--dry-run` to preview counts before a real run (backend)
- **Semantic AI teacher search** — the AI search previously ran Groq over the query to extract structured filters (gender/subjects/grades/mode/city/area/experience) and then matched those against MySQL, so it only worked when the searcher's words happened to line up with taxonomy values; a query like "patient tutor for slow learners near F-8" extracted almost nothing and returned effectively arbitrary results, even though plenty of teachers describe exactly that in their `about` text. Teacher profiles are now also embedded as 768-dim Gemini vectors (`gemini-embedding-001`) and results are ranked by cosine similarity, so profiles match on *meaning* rather than keyword overlap. The key design point: similarity is a **ranking signal layered over the structured-filtered set, never a pre-filter** — Groq's extracted filters stay the hard constraint, so a "female physics teacher in Lahore" search returns exactly the same set it did before, just better ordered, and recall can never regress. For a query with no structured filters the candidate set is every teacher and similarity is the entire ranking, which is where the win shows up. New `teacher_embeddings` table storing vectors as packed little-endian float32 BLOBs (3,072 bytes each, ~3.3MB for the whole corpus) with a `document_hash` so re-runs skip unchanged profiles; new `EmbeddingService` (batched — the whole corpus costs ~11 API calls, not 1,100), `TeacherEmbeddingService`, `SemanticTeacherSearchService` (streams and scores all vectors in ~25ms), `EmbedTeacherProfileJob`, and a synchronous `teachers:embed-all` backfill command. `sort=relevance` is the new default for AI search and is added to the sort whitelist. Vectors are L2-normalized on write because `gemini-embedding-001` only returns normalized output at its native 3,072 dimensions, not at the truncated 768. Fully graceful: if Gemini is down or nothing is embedded yet, the endpoint degrades to the previous structured-filter behaviour with `meta.semantic: false` and never errors, so it is safe to deploy before the backfill runs. Profile edits re-embed via the existing observer, chained after the AI-summary job (which feeds the embedded document) with a `catch()` so a summary failure can't leave a teacher unsearchable (backend + frontend)
- Jobs search now also matches the posting institution's name (e.g. searching "Allied School" or "Punjab College" surfaces their job posts), not just the job title/description — `JobPostService::search()`'s keyword clause gained an `orWhereHas('institution', ...)` name match alongside the existing title/fulltext match. No route or frontend changes needed since the `q` param already flowed through end-to-end (backend)
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
- **CV links embedded in a WhatsApp message, an email, or a CSV export died within 15 minutes of being sent — invisibly, since a broken S3 link just reads as the school never replying.** `SignedFileUrl::forCv()` signs a private S3 object for 15 minutes, correct for a link clicked immediately but wrong for one written into something read later. Three sinks did exactly that: the external-mode apply flow's WhatsApp/`mailto` text on `/jobs/[slug]` (`My CV: ...`, external-mode only — 88% of currently-open jobs, all operator-seeded with no institution account, per a live-DB check run before this fix), the equivalent apply text on `/tutor-jobs/[slug]` (unconditional — tutor jobs have no managed/external distinction, so every single application hit this), and the "CV URL" column of an institution's applications CSV export. Extending the TTL was considered and rejected: a signed URL sitting in a WhatsApp thread is a bearer token anyone in that chat can forward, and 15 minutes is what keeps that contained — the same reasoning `ShortlistPdfService`'s contact-masking already relies on. Instead, three new signed routes on the backend's own domain (`/cv/jobs/{job}/{teacher}`, `/cv/tutor-jobs/{tutorJob}/{teacher}`, `/cv/applications/{application}`, all `signed` middleware, 30-day expiry, mirroring the existing `/unsubscribe` pattern for a recipient with no account) resolve to a **freshly-generated** S3 signature on every click via new `App\Services\Teacher\CvAccessService`, so the durable artifact carries a stable link instead of the raw bearer token. The application-export route reads the application's own `cv_path` snapshot rather than the teacher's current one — an applicant who didn't attach a CV to a given application shouldn't have a later, unrelated upload show up in that row. Revocation is a byproduct of existing scoping rather than new machinery: a soft-deleted teacher 404s (implicit route-model binding respects the global scope), and a closed/expired job still resolves — an already-sent message shouldn't break just because the listing did. Every redirect logs a new `cv_open` `Interaction` row (existing polymorphic table, no new one) against the job/tutor-job/application with the teacher id in `metadata`, closing a real gap: zero visibility previously existed into whether an external, no-account recipient ever opened a shared CV. The public teacher-profile "Download CV" link was investigated and left untouched — `TeacherResource` signs fresh per request even though `findByUsername()` caches the underlying model, and the page's 120s revalidate is well inside the 15-minute TTL, so it was never actually broken. While touching the export: it now writes a UTF-8 BOM, so Excel on Windows stops mangling non-ASCII applicant names (backend + frontend)

### Changed
- **Cache store moves to Upstash Redis in production; dev and test are untouched.** Every cache read/write — the 60s teacher-listing cache, 5m profile cache, 10m review-summary and similarity caches, 12h homepage stats, and the 24h AI-search-parse and view-dedup keys — ran through the `database` cache driver, i.e. queries against the same MySQL instance that serves every other table, with no TTL eviction of its own beyond what each call site sets. Moving cache traffic onto a dedicated, TTL-evicting store takes that read/write volume off the primary database entirely. `CACHE_STORE` still defaults to `database` (config/cache.php, unchanged) — the switch is opt-in via a production-only `CACHE_STORE=redis` + `REDIS_URL=rediss://...` env pair, so dev, CI and the test suite (`phpunit.xml` already pinned `CACHE_STORE=array`) never need a live Redis. **Queue and session are deliberately untouched** — `QUEUE_CONNECTION=database` and `SESSION_DRIVER=database` stay exactly as they are; moving either is a separate decision. No cache key, TTL, or call-site logic changed: `config/database.php`'s existing `redis.default`/`redis.cache` connection blocks already resolve a `rediss://` URL's scheme into TLS automatically via Laravel's `ConfigurationUrlParser` (the `rediss` → `tls` alias, applied identically whether the app talks to Redis via phpredis or Predis), so no code change was needed there. Client is **Predis, not phpredis**: nothing in this repo (composer.json, Dockerfile, deploy config — none of the latter exist here) asserts the production PHP runtime has `ext-redis` compiled in, so `predis/predis` (a pure Composer dependency, no server extension required) is the lower-risk choice; set via `REDIS_CLIENT=predis` alongside the two vars above. **Rollback is one env change**: set `CACHE_STORE=database`, run `php artisan config:clear`, done — no data migration, because cache is ephemeral by definition (backend)
- **Home hero now leads with the two work boards.** Tab order is School & College Jobs → Tutoring Gigs → Hire a Teacher / Tutor (hiring was first), and the default tab follows: institutions land on "Hire", everyone else — teachers and signed-out visitors, who are overwhelmingly teachers today — lands on "School & College Jobs". Previously only logged-in teachers got the jobs board by default, so the largest audience (signed-out) opened on the tab least likely to match their intent (frontend)
- **Hero tab labels are no longer truncated on small screens.** The three tabs each took `flex-1` of one row and `truncate`d the overflow, so on a 360px phone the labels rendered as fragments — a visitor could not tell what the second and third tabs were. Tabs now size to their content and wrap onto a second row instead of shrinking, and the "AI Search Enabled" badge moves below the tabs until `lg`, where there is room for it beside three full-width labels; below that it would have forced a wrap of its own (frontend)
- **Recommended teachers are fetched and shown only for open jobs.** A job's applications page built the shortlist for every status, so closed, filled, expired and draft jobs each paid for the ranking call to render a panel offering to invite teachers to a job nobody can apply to. It is now skipped unless the job is open — which is also what the new My Jobs column reflects (frontend)
- **Semantic ranking now scores only the eligible candidate set, instead of ranking everything and filtering afterwards.** Both AI searches scanned the whole embedding table, took the top 200, and applied visibility in SQL after — so closed, expired and draft postings (and blocked or hidden teachers) occupied ranked slots that valid rows at positions 201+ could never reclaim, quietly shortening or emptying a page. Worse, when the parser extracted any filter at all the controllers passed `truncate: false`, which returned an **uncapped** ID list that `applyRelevanceOrder()` expanded into a `CASE ... WHEN ? THEN ?` with `2N+1` bindings; the comment claiming the list was capped at 200 was true only on the branch that never runs with filters. `SemanticRanker` already accepted a candidate-ID restriction (added for the digest and similar-listings work) — the search services simply never passed it. `TeacherService` and `JobPostService` now expose `candidateIds()`, built by extracting the filter clauses each `search()` already had into a shared `applyFilters()` helper so there is one definition of what the hard filters mean, and truncation is unconditional. `relevance_strict` stays separate and stays conditional on there being no hard filters: forcing it on would drop a posting created seconds ago, before its embed job ran, which is the recall regression candidate-first ranking exists to prevent. `rank([])` now returns `[]` — a real "nothing eligible" answer, short-circuited before the paid embedding call — rather than `null`, which would send the caller to a conventional sort over the whole board (backend)
- **Embedding recipe versions are per corpus rather than one global integer.** `EmbeddingProfile::active()` stamped `search.semantic.version` onto teacher, job and (now) tutor-job vectors alike, so changing what one document contains invalidated all three: the config comment describing v2 is itself teacher-specific ("dropped teacher name, salary_expectation and ai_summary"), yet bumping it forced a full re-embed of the job corpus whose recipe had not changed. New `EmbeddingProfile::forCorpus()` reads `search.semantic.corpora.{teachers,jobs,tutor_jobs}.version`, defaulted to the values already stored so nothing is invalidated by the split. `matches()` deliberately stays strict on all four fields: provider, model and dimensions all come from global `ai.*` config, so two corpus profiles can only ever differ in `version` and are structurally guaranteed to share a vector space — a version-less variant would have no caller. Cross-corpus comparison is handled by passing the profile of the corpus being *scanned*, which fixes a real latent bug in `JobPostDigestService`: it used one profile for both the teacher-row staleness check and the `job_post_embeddings` scan, so bumping the teacher recipe would have made the scan filter jobs on a version no job row carries — zero scores, and the digest silently falling through to structural ranking forever, with no test that would have caught it (backend)
- **Job → teacher recommendations are semantic-first: a teacher with no embedding is no longer recommended.** The previous release replaced "rank unembedded teachers below every embedded one" with a neutral `0.5` semantic prior, which overcorrected — after normalisation an embedded but semantically weak teacher scores `0.0` while a teacher with no vector scores `0.5`, so *missing data outranked a real but weak match*. `UNEMBEDDED_SEMANTIC_PRIOR` is gone and `eligibleTeachersQuery()` requires an embedding. Embeddings are queued on profile save and land within minutes, so the recall cost is a short window on a brand-new profile — an acceptable trade for not inventing a semantic opinion the system does not have. One escape hatch remains: when the semantic side is unavailable *wholesale* (provider outage, or an empty corpus) ranking falls back to structural-only over every eligible teacher, because the alternative there is a blank dashboard widget rather than a degraded one. Separately, `buildJobQueryText()` now includes `requirements` — the most matchable text on a posting ("Cambridge experience", "Montessori certified", "experience with SEN students") and exactly what a teacher's about/experience text can answer — and `shift`, while dropping salary, employment type and institution name: none has a counterpart in the teacher document, so they could not match anything and only diluted the vector, and the salary line hardcoded "PKR" regardless of `salary_currency`. A configurable `min_combined_score` floor and a `strong`/`possible` confidence band are now in place (defaulted to no behaviour change) so a weak shortlist can be labelled rather than presented under the same heading as a good one; picking a real threshold needs labelled queries and the clicks they produced (backend)
- **Teacher listings use a dedicated card resource.** `TeacherResource` reads `$this->experiences` and `$this->educations` unconditionally, but only `findByUsername()` eager-loads them — so the directory, AI search and related-teacher endpoints triggered two lazy queries per card, roughly 40 extra queries on a page of twenty. New `TeacherCardResource` drops those two relations plus the exact address, signed CV URL and intro video, all of which only the profile page renders; `TeacherResource` stays as the detail resource. The dropped fields are also the privacy-sensitive ones, so per-profile data is no longer sprayed across every listing response (backend)
- **Recommended teachers are ranked on read instead of materialized, and `job_recommended_teachers` is gone.** The table stored a top-50 shortlist per open job, kept current by an observer, a `ShouldBeUnique` queue job and a nightly `jobs:compute-recommendations` sweep. The problem was never storage — it was that a shortlist is a function of the *entire teacher corpus*, so nothing on the job row could ever mark a stored copy stale. Every teacher who signed up or edited a profile silently invalidated rows that still looked valid, and the machinery built to hide that generated a class of bugs of its own: closing a job left its rows behind (the compute job returned early on non-open status without deleting, and the nightly sweep only visited open jobs, so they were unreachable forever); zero rows was indistinguishable from "not computed yet", so a legitimately empty shortlist was recomputed nightly in perpetuity; and because stored rows could be missing or stale, a *second* live fallback ranking existed in `JobPostService` with materially different eligibility rules — it checked neither `is_blocked` nor gender as a hard filter, treating gender as one `orWhere` signal among several, so a female-only posting could fall back to recommending male teachers. Two algorithms disagreeing about what "this teacher matches this job" means is worse than one slower answer. `recommendedTeachersForJob()` now calls `JobRecommendationService::rankTeachersForJob()` directly and caches the **ranking** (teacher ids + scores) for 30 minutes, keyed on the job's `updated_at` so an edit invalidates immediately rather than waiting out the window; the profiles behind it are always loaded fresh, because signed CV URLs expire and invitation state changes on a different clock than the ranking does. Eligibility is re-checked at hydration and filtered *before* the limit, so a teacher blocked or applying inside the cache window can't silently shorten the list to 9. The response payload is byte-identical apart from `match_breakdown.computed_at` (which no longer exists), so neither the dashboard nor the Filament widget changed shape. Deleted: the table, `JobRecommendedTeacher`, `ComputeJobRecommendationsJob`, `ComputeJobRecommendationsCommand`, the nightly schedule entry, the `JobPost::recommendedTeachers()` relation, and ~120 lines of duplicate scoring heuristic. `JobRecommendationService` itself is unchanged in how it ranks — only `persist()` and `computeForJob()` are gone. Two fixes came with the move: an embedding-provider outage now degrades the widget to structural-only ranking instead of throwing (it used to be a queue job that could retry; on a read path it cannot), and teachers without an embedding now compete on a neutral 0.5 semantic prior rather than being concatenated below *every* embedded teacher — the old tail placement meant a new teacher who was a perfect structural match could not enter the list at all once 50 embedded candidates existed, which is the opposite of the recall guarantee its comment claimed (backend)
- **The daily digest ranks school jobs semantically and covers a three-day window.** `JobPostDigestService` matched on exact subject/grade slug overlap, so a teacher tagged "Mathematics" never saw a posting tagged "STEM Education" no matter how precisely its text described their profile. The eligible set is still built by hard filters first — open, unexpired, not already applied to, gender-compatible, mode-compatible, reachable city; those are eliminations, not preferences — but what survives is now ordered by cosine similarity between the teacher's stored document vector and the postings' stored vectors, which costs **zero API calls** because both sides were embedded already for search. `SemanticRanker::scoresForVector()` gained an optional candidate-ID restriction so the digest scans only the handful of recent postings rather than the whole corpus (and so eligibility can be applied *before* truncation rather than after, which is what stops ineligible rows from consuming result slots). It has its own floor, `SEMANTIC_DIGEST_MIN_SCORE`, defaulting to 0.60: doc-to-doc scores sit lower and in a narrower band than the query-to-doc scores `min_score` was tuned for, and a digest is unsolicited email, so below that the tag matcher is the more honest answer. Falling back is deliberately distinct from returning nothing — no teacher vector, no job vectors, or nothing clearing the floor all hand back to the structural matcher, rather than claiming the teacher has no matches. Separately, the lookback widened from 24 to 72 hours: the 70-email/day cap rotates through teachers over several days, so a teacher skipped by the cursor previously missed every job posted while they were skipped. To stop the wider window resending the same jobs three days running, a new `teachers.last_digest_sent_at` watermark (mirroring `last_job_match_notified_at`) takes over whenever it is more recent than the window floor, stamped synchronously at queue time so a re-run before the queue drains can't duplicate. It is read one second past the stored value, because the digest filters on `>=` and timestamps store whole seconds — reusing it verbatim resends anything posted in the same second as the previous run (backend)
- **Job post edits now save as one aggregate, and tag changes actually refresh the embedding.** `updateJob()` wrote scalar fields, then subjects, then grades, with no transaction, so a reader could observe half an edit. Worse, `JobPostObserver` was registered on `JobPostSubject`/`JobPostGrade` to catch tag-only changes — but `syncSubjectRows()`/`syncGradeRows()` write via `Model::insert()` and a mass `delete()`, both of which bypass Eloquent model events entirely, so those observers had never fired on the primary write path. Changing a posting's subject from Maths to Physics without touching a watched parent field therefore left its vector stale until the nightly backfill. The update path is now wrapped in a transaction, the sync methods report whether the stored tags actually changed, and a single `EmbedJobPostJob` is dispatched `afterCommit()` when they did. The dead child-model observer registrations are removed rather than left as decoration, and the remaining observer dispatches `afterCommit()` explicitly instead of relying on `queue.after_commit`, which is `false` on every connection (backend)
- **Embedding lifecycle is now versioned, and the nightly backfill actually is one.** Three latent correctness bugs in the embedding layer, all silent, fixed before adding a second semantic index rather than after. (1) *Profile drift*: `teacher_embeddings` stored `model`/`dimensions`/`version`, but nothing enforced them — `version` was a hardcoded literal `1`, staleness was decided by `document_hash` alone, and the similarity scan guarded only on `dimensions`. Changing `GEMINI_EMBEDDINGS_MODEL` while keeping 768 dims would therefore leave every stored vector in the old model's space, produce no re-embed (the document text is unchanged, so the hash matches), and yield confident-looking dot products between two incompatible spaces — Google states `gemini-embedding-001` and `gemini-embedding-2` are not interchangeable. A new `EmbeddingProfile` value object (provider + model + dimensions + version) is now stamped on every row, checked in the staleness test, and filtered on in SQL during the scan, so a model change degrades search to its fallback instead of ranking on noise. A new `provider` column and composite profile index back it. (2) *The backfill skipped exactly the rows it existed to catch*: `EmbedAllTeachersCommand`'s comment said teachers whose profiles had changed "still need to be visited", then applied `whereDoesntHave('embedding')`, which excluded every one of them — so a queue outage, a failed embed job, or an update path that bypassed the observer left a stale vector in place permanently. It now visits every teacher and lets the hash plus profile decide who costs an API call. (3) *Observer gaps*: `country` fed the embedded document but appeared in neither watched field list. `search.semantic.version` is bumped to 2, forcing one full re-embed on the next nightly run (backend)
- **AI search no longer invents hard filters from vague words, and no longer pads weak results.** The teacher parser's prompt turned bare adjectives into SQL: "experienced" became `exp_years >= 2` and "new"/"fresh" became `exp_years <= 1`, so "friendly experienced physics teacher" hard-excluded a strong one-year teacher on a word the user never quantified. Experience filters now require a stated number; unquantified qualities come back as `soft_preferences`, which filter nothing (the full raw query is embedded, so semantic ranking already accounts for them) and render as visually distinct "ranked, not filtered" chips. Separately, semantic truncation kept a minimum of 10 results even when nothing cleared the relevance bar — presenting ten unrelated profiles under an "AI search found these" banner for a query like "professional violin composer for film soundtracks". `min_results` now defaults to 0 and empty is an honest answer, with dedicated "No strong matches" empty states on both boards. This required `rank()` to return `?array` rather than `array`: `null` means ranking was unavailable (fall back to a conventional sort) and `[]` means it ran and nothing was relevant — previously indistinguishable, and conflating them would have silently returned the entire roster instead of nothing. `meta.semantic` (declared in the frontend types since the original semantic release but consumed by nothing) is now what drives that copy (backend + frontend)
- **Hybrid teachers and postings are no longer excluded from mode-specific searches.** Teacher, job and tutor-job search all did an exact `where('mode', ...)`, so searching for an online teacher dropped every teacher whose profile says `hybrid` — even though `JobStructuralScorer` already scored hybrid as compatible with either on the recommendation side, meaning search and recommendations disagreed about what the word meant. A new `App\Support\SearchMode` centralises both the compatibility model (`online → [online, hybrid]`, `onsite → [onsite, hybrid]`, `hybrid → [hybrid]`) and the `onsite`/`in_person` spelling split between the `job_posts`/`teachers` and `tutor_jobs` schemas. Stored values and public API params are unchanged — canonicalisation happens at the service boundary (backend)
- AI search rate limit raised from 5/hour to a configurable 30/hour (`AI_SEARCH_RATE_LIMIT`), and extracted filters are now cached for 24h keyed on the normalised query plus a parser version. The old limit predated query-embedding caching and was shared across every AI endpoint: with jobs joining teachers and tutor jobs, two searches on each locked a user out for an hour — on an interaction where reformulating the query several times is ordinary behaviour. Repeating or lightly rewording a search now costs no provider call at all. Parser versions are bumped whenever a prompt or schema changes, so cached extractions from an older parser are never reused (backend)
- Teacher name, `salary_expectation` and `ai_summary` removed from the embedded teacher document. A search for "Ahmed Khan" wants that profile — a lexical match, not a semantic one — and embedding the name only surfaced profiles whose text resembled those tokens; salary is an exact structured filter that embeddings cannot compare numerically; and `ai_summary` is a generated restatement of `about`/`headline`/`experience`, all already in the document, so including it double-weighted the generated text and let a softly-implied trait read as an established one. `ai_summary` remains a display field. Dropping it also let `TeacherProfileObserver` stop chaining the summary and embedding jobs — the summary is no longer an input to the document, so a failing Groq call can no longer delay or endanger the embedding (backend)
- Shared `AiSearchBar` and `AiUnderstoodChips` components extracted from the teachers-only versions rather than adding a third hand-maintained copy for the job board. The tutor-jobs header still has its own copy — it carries extra structure (sort, filter toggles) — and is a follow-up (frontend)
- The base `TestCase` now fakes the embeddings provider by default. Model observers dispatch embedding jobs on save and the test queue runs synchronously, so creating an ordinary Teacher or JobPost fixture reached the live Gemini API — turning unrelated tests (guest reviews, CV upload validation, review caching) red with `RateLimitedException` whenever the quota was spent, and making the suite depend on network access. This fixed 8 pre-existing intermittent failures (backend)

### Fixed
- **The job detail page printed raw slugs, a doubled brand in the title, and a zero proposal count to every visitor.** Three formatting defects on `/jobs/[slug]`, all visible on the live listing an institution is sent. (1) The Subjects & Grades pills rendered `subject_slug`/`grade_slug` verbatim — `mathematics`, `matric-9-10`, `middle-6-8` — while the similar-jobs cards on the same page rendered `Mathematics`, `Matric 9 10` through `humanizeSlugLabel()`; the detail page simply never called the helper. The same raw slugs also went into the page `keywords` and the JobPosting `skills` field, which is where they surfaced in social/LinkedIn copy. Both now humanize. (2) The document title read `Mathematics Teacher | UstaadSearch | UstaadSearch`: the root layout defines `title.template = "%s | UstaadSearch"` and the page appended the brand a second time. The page title is now bare and a separate `socialTitle` carries the brand explicitly into `openGraph`/`twitter`, which do not inherit the template. The meta description was rebuilt in the same pass — it read `Salary: Salary: not specified` (`formatSalary()` already prefixes "Salary:" for the unspecified case), appended `...` to descriptions shorter than the 155-char cut, and ran two sentences together when the description had no terminal punctuation; it now uses `formatJobMeta()` for the type/mode/shift clause. (3) `Proposals: <strong>0</strong>` was public on every listing — the worst possible signal to an institution assessing whether the supply side is real, and unlike the cards, which have banded through `formatProposals()` all along. New `formatPublicProposals()` returns `null` below `PUBLIC_PROPOSALS_THRESHOLD` (5) and reuses the existing bands above it, so a low count is hidden rather than rounded; the views figure right-aligns on its own and the whole divider block is dropped when neither value is shown. The Subjects & Grades heading is likewise no longer rendered above an empty row (frontend)
- **A log-file permission error silently killed the queue worker for two days, stranding 3,488 jobs and 70 unsent digest emails.** Under `LOG_CHANNEL=daily` the log file is created by whichever process writes first each midnight — root, via the scheduler cron — and neither the `single` nor the `daily` channel set a `permission`, so the creator's umask produced a `0644 root:root` file the `www-data` queue worker could not append to. `StreamHandler` throws on that, the throw escaped the first `Log::info()` of every queued job, and `queue:work` exited status 1 on boot until supervisor gave up and parked it in `FATAL`. Nothing alerted: `SystemHealthCheck` counted *failed* jobs, but a worker that never runs produces no failures — the queue just grew. Three changes: both file channels now set `'permission' => 0664` so the daily file stays group-writable regardless of which user creates it; the `stack` channel sets `'ignore_exceptions' => true` so a log-write failure degrades instead of taking the process down with it; and a new `checkPendingJobBacklog()` alerts on queue depth (`HEALTH_CHECK_PENDING_JOBS_THRESHOLD`, default 500), which is the signal that actually catches a dead worker. While there: `checkRecentErrorLogVolume()` only ever looked at `logs/laravel.log`, which does not exist under daily rotation, so it had been a no-op on production since the channel was switched — it now falls back to the current day's rotated file (backend)
- **`SendJobMatchNotifications` logged "Sent job match notification to teacher" for work it had only queued.** `MatchingJobsNotification implements ShouldQueue`, so `notify()` returns before anything is delivered; the past tense made the log read as proof of delivery during an outage when nothing was being delivered at all. Now "Queued job match notification for teacher" (backend)
- **Closed, draft and expired tutor jobs were publicly reachable, and could enter digests.** `TutorJob::scopeOpen()` checked `expires_at` only — never `status` — unlike `JobPost::scopeOpen()`, which checks both. `TutorJobService::search()` compensated with its own `where('status','open')`, which is exactly why the two callers that trusted the scope drifted: `TutorJobDigestService` and `TeacherProfileService::getRecommendedTutorJobs()` both surfaced draft and closed listings. Worse, `TutorJobController::show()` only ran its visibility check when `institution_id` was set, so a **user-posted** listing had no check at all: any anonymous visitor holding the slug got a draft, closed or expired one back, and any authenticated visitor also got the poster's email and phone, since `TutorJobResource` reveals contact details to any signed-in user. The scope is now authoritative, a matching `TutorJob::isOpen()` covers the instance case, and `show()` runs one unconditional check with ownership covering both shapes a listing can take (institution-owned or user-posted). The redundant manual status check in the service is gone rather than left as decoration (backend)
- **Recommendations went stale for 30 minutes after a subjects-or-grades-only edit.** The ranking cache was keyed on `job_posts.updated_at`, but `syncSubjectRows()`/`syncGradeRows()` write the tag tables in bulk, which never touches the parent row — so changing a posting's subject from Maths to Physics left the key unchanged and kept serving the Maths shortlist for the rest of the window, even though the embedding refresh was correctly queued. The key is now a SHA-256 fingerprint over every field the ranking actually reads, including sorted subject and grade slugs and an algorithm version, which also removes the one-second collision inherent in a timestamp key. While there: both sync methods computed whether the tags had changed and then used the result only as a return value, deleting and re-inserting identical rows on every save — they now return early instead (backend)
- **Cached recommendations did not re-check gender.** Hydration re-checks blocked, soft-deleted and already-applied, but not the gender elimination that `eligibleTeachersQuery()` treats as a hard filter — and a *teacher* editing their profile does not rotate the *job's* cache key, so a teacher who changed their gender inside the window could surface on a gender-restricted posting. Every hard condition used to build a ranking is now re-applied when the cached IDs are hydrated (backend)
- **Job detail stayed public between expiry and the hourly sweep.** `JobPostController::show()` compared `status !== 'open'` while `related()` already used `JobPost::isOpen()` — the method exists precisely for this, and its docblock describes the gap `show()` still had. Now both use it, preserving the owner and already-applied exceptions (backend)
- **Blocked teachers kept receiving digest emails.** `SendTutorJobsDailyDigest::digestTeacherQuery()` filtered role and soft-deletes but not `is_blocked`, making it the one query in the codebase that doesn't — the sibling push command, `JobRecommendationService` and `JobPostService` all do. Same file: the `--hours` help text said 24 while the code defaulted to 72, and `DIGEST_LOOKBACK_HOURS` was read via `env()` at runtime, which *overrode* an explicitly passed `--hours` and returns `null` once the config is cached, so the override silently stopped working in any `config:cache` deploy. The value moved to `search.digest.lookback_hours`, precedence is now flag over config, and the help text matches (backend)
- **Salary and fee matching compared numbers across currencies.** `JobStructuralScorer::scoreSalary()` compared `teachers.salary_expectation` — PKR/month by definition, with no currency column — directly against `job_posts.salary_max`, whose `salary_currency` accepts any 3-char code. A job offering USD 2,000 therefore scored every teacher expecting PKR 80,000 as `above_budget` and stamped that reason into `match_reasons`, which the presenter renders. Salary now scores neutrally and emits no reason unless the posting is priced in PKR, because a confidently wrong reason is worse than a missing one; tutor-job fee filters got the same guard. Related: `scoreLocation()` granted a perfect city match on bare string equality, so a teacher in Lahore, Pakistan matched a job in Lahore, United States — the city tier now requires the countries to agree too (backend)
- **A tutor-job parser failure was indistinguishable from a query with no filters.** `TutorJobSearchAIService::parseQuery()` returned `[]` on provider failure, which the controller merged as "no filters" and answered with the entire unfiltered board — presented to the user as an AI-matched result set. It now returns `['filters' => ..., 'ai_parsed' => bool]`, surfaced as `meta.ai_parsed` and rendered as "AI interpretation was unavailable, showing regular search results instead". It also gained the versioned normalised-query parse cache its teacher and job siblings already had, with the same invariant: a **successful** parse that found no filters is cached, a **failed** one never is, so a one-minute outage cannot answer "this query has no filters" for the next 24 hours (backend + frontend)
- **The tutor jobs page treated a stale cookie as a valid session.** It gated the authenticated AI call on `!!cookieStore.get("auth_token")` while already calling `getCurrentUser()` for other reasons, so an expired token took the AI branch, 401'd, and rendered the full-page "Unable to load tutor jobs" error where jobs and teachers would have degraded to keyword search. It now gates on the resolved user, matching the other two boards (frontend)
- **The jobs sort dropdown claimed an order the list was not in, and the result count froze after Load More.** The backend defaults AI job search to relevance ordering, but the header was fed `filters.sort || "newest"` and the dropdown had no relevance option at all — so results were semantically ranked while the UI said "Newest". Relevance is now an option while an AI query is active and is the honest default there. Separately `JobsList` kept `meta` in props rather than state, so the header still read "Showing 1 to 10 of 43" after three Load More clicks; it now tracks meta in state like `TutorJobsList` already did, and reports "Showing 20 of 43" — page-derived ranges stop being true the moment a list appends rather than paginates (frontend)
- **`EmbedJobPostJob` could be enqueued twice for one edit.** An edit touching both a scalar field and the subject/grade tags satisfies `JobPostObserver::updated()` *and* `JobPostService::updateJob()`, and both dispatch. The document-hash check absorbs a duplicate that runs afterwards, but two workers dequeuing concurrently both read the pre-update hash and both pay for a provider call. The job now implements `ShouldBeUnique` keyed on the posting ID, with a `uniqueFor` short enough that a genuine follow-up edit is never swallowed (backend)
- Stale "(5 per hour)" AI rate-limit copy removed from the teacher and tutor-job server actions — the limit has been a configurable 30/hour for a release, and the backend's 429 message already interpolates the real value (frontend)
- **A teacher carrying a stale-profile vector was recommended at a floored semantic score instead of being excluded.** The new semantic-first eligibility rule checked `whereHas('embedding')` — the existence of a row, not whether it matches the active profile. `SemanticRanker` filters its scan on the whole profile, so a row left behind by a recipe bump or an unfinished backfill is present but never scored: those teachers passed eligibility, got `semantic = 0.0`, and floored every shortlist. That is the same "unscoreable data pollutes the ranking" pathology the prior was removed for, inverted — and mid-backfill it is not an edge case but most of the corpus (on the live database, 1655 teachers had a row while only 800 carried a current-profile vector). Eligibility now requires a vector under the active profile, pushed into SQL. The wholesale-unavailable fallback is unaffected: when *nothing* is scannable the ranker returns no scores at all, which still degrades to structural-only over every eligible teacher rather than emptying the widget (backend)
- **"Similar teachers" crashed on SQLite, so the fallback it exists for was never testable.** `getRelatedTeachersStructural()` — the path that runs for every teacher without an embedding — scored candidates with a raw `JSON_OVERLAPS` expression, which is MySQL-only and throws on SQLite. Production runs MySQL so this never surfaced there, but it meant `GET /api/teachers/{username}/related` returned a 500 under the test connection and the fallback could not be covered by a single test, which is why it never was. Candidates are now narrowed in SQL (portable `whereJsonContains`/column matches) and scored in PHP, which also lets overlap *count* rather than collapsing to yes/no — four shared subjects now outrank one. The same MySQL-only expression in `TeacherProfileService::getRecommendedTutorJobs()` got the same treatment (backend)
- **"Similar" sections silently returned fewer results than asked for, and could show ineligible entries.** `SimilarityService` ranked the entire embedding table, took the top five, and only then let Eloquent load them — so a blocked teacher or a closed posting occupied a slot and then vanished during hydration, turning a five-item section into three. Eligibility is now resolved *before* truncation: `SemanticRanker::scoresForVector()` accepts a candidate-ID restriction (narrowed in SQL for small sets, filtered in PHP beyond 500 to stay under SQLite's bound-parameter cap), and the similar-teacher/similar-job callers pass `publiclyVisible()` and `open()` respectively. `open()` rather than `status = 'open'` matters on its own: `jobs:expire-posts` runs hourly, so a posting past its `expires_at` still reads as open until the next sweep — the related-jobs endpoint, its structural fallback and its loader all checked the raw column, and the endpoint's own guard now uses a new `JobPost::isOpen()`. Separately, `findSimilar()`'s `null` (no usable embedding) versus `[]` (compared, nothing close enough) distinction was documented in the service and then discarded by both callers, which treated them identically and ran the structural fallback for either — so an honest "nothing is similar" was padded with five loosely-related entries under a "Similar teachers" heading, the same failure mode fixed earlier for semantic search. Callers now fall back only on `null`. The two corpora also got separate thresholds (`SEMANTIC_SIMILAR_TEACHER_MIN_SCORE` / `SEMANTIC_SIMILAR_JOB_MIN_SCORE`): teacher documents are biographies, job documents are requirements boilerplate, and the latter reads as mutually similar at a higher baseline, so one shared 0.65 was only ever a starting guess. New `SimilarityServiceTest` covers all of it — the feature previously had no dedicated tests at all (backend)
- **The AI job search parser could only emit filters the database rejects.** The prompt and normaliser offered `internship` (not a valid `type`) and `afternoon` (not a valid `shift`), while `substitute` — which the column does accept — could not be expressed at all. So "substitute teacher required" was unrepresentable, and "teaching internship" produced a filter that matched zero rows and looked like an empty board. The enum lists had been retyped independently across the migration, two form requests, the extraction service and the search parser, and the search parser was the copy that drifted. New `App\Support\JobPostOptions` is the single definition; the prompt fragments and validation rules are now generated from it. Parser version bumped to 3 so cached extractions holding the impossible values are discarded (backend)
- **A provider outage poisoned the AI search cache for 24 hours.** Both the teacher and job parsers wrapped extraction in `Cache::remember()`, while `extract()` caught provider failures and returned empty filters — so a momentary Groq blip on "female physics teacher in Lahore" cached "this query has no filters" for a full day. The searcher had no way to force a retry: rephrasing produces a different cache key, but the phrase they actually wanted stayed broken even after the provider recovered. `extract()` now returns `null` on failure (including unparseable model output, which is a failure rather than an empty answer) and only a genuine parse is written to the cache — a successful parse that legitimately found no filters still caches, since that is a real result (backend)
- **AI tutor job "Load More" appended unfiltered listings to AI-filtered results.** `TutorJobsList.loadMore()` always called `getTutorJobsAction()`, even when page 1 came from `aiSearchTutorJobsAction()`, so page 2 was the ordinary newest-first board pasted onto a semantically filtered first page. `aiQuery` now reaches the list component and Load More follows the same path page 1 took; the component key includes it so a new AI query resets pagination state. `JobsList` already branched correctly, but neither jobs path forwarded the selected `sort` to the AI endpoint — the dropdown and URL could claim "Salary: High to Low" while the backend ranked by relevance, and page 2 could arrive ordered differently from the page it appended to. Both call sites now pass it (frontend)
- **AI job search results were wiped a moment after they appeared.** On `/jobs`, an AI search rendered its results and "what AI understood" chips, then ~400ms later the URL snapped back to `/jobs`, the plain newest-first board replaced the results and the search box emptied while the AI tab stayed selected. The cause was the jobs `FilterSidebar`: its debounced auto-apply effect depends on `searchParams` (through `createQueryString`), so it re-runs on *every* navigation — including the one the AI search just performed — and `createQueryString` rebuilds the URL from scratch carrying only `query` and `sort`, so `ai_query` was dropped and the page re-rendered as an ordinary search. The sidebar now skips auto-applying while `ai_query` is present, the same guard `TutorJobsFilters` already had; `ai_query` also survives `createQueryString` and the Reset button, which clears filters rather than the user's search. The empty input was downstream of this, not a separate bug — `AiSearchBar` correctly mirrors the URL, and the URL had lost the query (frontend)
- **AI job search silently extracted no filters at all.** `JobSearchParserAgent` was written using Laravel AI's `HasStructuredOutput` schema, but Groq's `llama-3.3-70b-versatile` — the model this project runs for text — rejects `response_format: json_schema` with a 400 ("This model does not support response format `json_schema`"). Because `JobSearchAIService` catches provider failures and degrades to empty filters, every single call failed invisibly: search kept returning results, it just stopped understanding the query. Reverted to the prompt-for-JSON + `AiResponseParser` pattern that `TeacherSearchParserAgent` and `TutorJobSearchParserAgent` already use and that is proven against this model, with the JSON shape the schema used to enforce now spelled out in the prompt. Verified against the live provider: "part time O Level chemistry teaching job in Lahore evening" now extracts `city`, `subjects`, `grades`, `type` and `shift`, while "urgent well paid physics teacher" correctly routes "urgent" and "well paid" to `soft_preferences` rather than inventing salary filters. Worth recording *why* the test suite missed this: the agent is faked in tests, and a fake cannot report that the real model lacks a feature — only a live call surfaced it. Migrating all three parser agents to schemas is still worthwhile, but needs a model that supports them and should be one deliberate change (backend)
- **The test suite could destroy the developer's database.** `phpunit.xml` sets `DB_CONNECTION=sqlite` / `DB_DATABASE=:memory:`, but those are `<env>` overrides and **a cached config silently wins over them** — so with `bootstrap/cache/config.php` present (left behind by `php artisan config:cache` or `optimize`), the suite quietly points at whatever database `.env` names and the first `RefreshDatabase` test runs `migrate:fresh` against it. `composer test` clears the config cache first precisely to avoid this, so the dangerous path is invoking `php artisan test` directly; the failure is silent and total, since the suite passes and the data is simply gone. `Tests\TestCase` now refuses to run unless the default connection is in-memory SQLite, reporting the connection, driver, database name and whether a cached config is responsible. The check lives in `refreshApplication()` rather than `setUp()` for ordering reasons — at the top of `setUp()` there is no container yet so `config()` is unresolvable, and after `parent::setUp()` the traits (and therefore `migrate:fresh`) have already run (backend)
- **Tutor job fee sorting never worked.** `TutorJobService::search()` matched `fee_low_high`/`fee_high_low` while the form requests, the frontend `TutorJobFilters` type and the sort UI all sent `fee_low_to_high`/`fee_high_to_low`, so every fee sort silently fell through to newest-first. Fixed, with unpriced listings now ordered to the tail of a low-to-high sort instead of burying every priced listing behind them (both engines sort NULL first on ASC). The unreachable `oldest` arm — rejected by validation — was removed. This shipped undetected because `TutorJobService::search()` and `JobPostService::search()` had essentially no test coverage and no test anywhere asserted sorting; a new `TutorJobSearchTest` now covers both fee sorts, null-fee ordering, area filtering and mode compatibility (backend)
- **Tutor job AI search reported totals it could not deliver.** `TutorJobController::aiSearch()` stripped the extracted `area` filter with `array_diff_key`, paginated, then filtered `$paginator->items()` — so with 100 Lahore listings of which 8 are in DHA, the page returned whatever survived the first 12-row slice while `meta.total` and `last_page` still described the full unfiltered Lahore set, and the other DHA matches were unreachable on later pages. `area` is now a real `TutorJobService` filter matching `address` or `city` before pagination, mirroring the fix already applied to teacher search, and `IndexTutorJobRequest` accepts it so manual search can use it too (backend)
- `TutorJob` cast `published_at` as a datetime although no such column exists on `tutor_jobs` (backend)
- Removed a dead `searchJobsAction` server action calling `GET /jobs/search`, a route that does not exist in `routes/api.php`, with no callers anywhere in the app (frontend)
- **Homepage "Find Jobs / Gigs" tab routed institutional searches to the wrong marketplace.** The tab always navigated to `/tutor-jobs`, but two of its four example prompts — "Urgent English teacher jobs in Lahore schools" and "Search high school Math teacher roles" — describe institutional vacancies that live on `/jobs`, so clicking our own example landed the user on the tutoring board. Now that `/jobs` accepts `ai_query`, the work side is split into "School & College Jobs" → `/jobs` and "Tutoring Gigs" → `/tutor-jobs`, each with prompts matching its destination. A full federated search across both boards remains a follow-up (frontend)
- AI search queries shorter than the backend's 3-character minimum returned a 422 that surfaced as the generic "AI search failed. Please try the normal search." The shared search bar now enforces the same minimum client-side and explains it (frontend)
- AI teacher search reported a `meta.total` that disagreed with the results it returned whenever the query mentioned an area/neighbourhood — `TeacherController::aiSearch()` applied the extracted `area` as a post-filter over the *current page slice* (`TeacherService` had no `area` filter), so `data` came back shorter than `per_page` while `total`/`last_page` still described the unfiltered set, and page 2 could contain teachers page 1's filter had rejected. `area` is now a real `TeacherService` filter matching `address` or `city`, applied inside the query before pagination (backend)
- `add_admin_panel_to_invitations_channel_enum` migration issued a raw MySQL `ALTER TABLE ... MODIFY ... ENUM`, which SQLite cannot parse — this broke *every* `RefreshDatabase` test in the suite (tests run on in-memory SQLite), not just invitation-related ones. Now dispatches on the driver: native `MODIFY` on MySQL, schema-builder `->change()` elsewhere (SQLite expresses an enum as a CHECK constraint, so skipping the migration there would have rejected the new `admin_panel` value on insert rather than being a harmless no-op) (backend)
- `SubjectGradeSelector` (used on teacher profile and search filters) had no ARIA combobox semantics at all — a screen reader announced the search field as a plain text input with no indication a dropdown of options existed. Added `role="combobox"`/`listbox`/`option`, `aria-expanded`/`aria-activedescendant`, and arrow-key navigation over the option list (frontend)
- `Modal` (used across apply/review/tutor-job dialogs) had no `role="dialog"`/`aria-modal`, no focus trap, and didn't restore focus to the triggering element on close, letting keyboard focus escape behind the backdrop. Added a Tab-cycle focus trap, initial focus on the close button, and focus restoration on close (frontend)
- Homepage hero search's "Hire a Teacher / Find Jobs" tabs were plain buttons with no ARIA tab semantics, unlike the equivalent "Featured Opportunities" tabs which already implement the pattern correctly. Brought the hero tabs in line: `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, roving `tabIndex`, and Left/Right arrow-key navigation (frontend)
- `SiteHeader`'s logged-out mobile burger menu toggled at the `md` breakpoint while the login/"Get started" buttons toggled at `sm`, so between 640–768px both the mobile burger and the full desktop auth buttons rendered together with the desktop nav still hidden. Both now switch at `md` together (frontend)
- No visual indicator showed which nav link matched the current page in `SiteHeader`. Active links are now highlighted and marked `aria-current="page"` (frontend)
- Footer social links (Facebook/WhatsApp) opened in the same tab with no `target`/`rel`, navigating users fully away from the site. Added `target="_blank" rel="noopener noreferrer"` (frontend)
- No "Skip to content" link existed for keyboard users, forcing them to tab through the full header/nav on every page load before reaching the main content. Added one in the root layout, targeting a new `id="main-content"` on `<main>` (frontend)
- Homepage's "For Teachers/Hiring" and "For Teachers/Parents/Institutions" cards used `rounded-3xl` while the visually equivalent Featured Opportunities cards used `rounded-2xl`, an unintentional mismatch rather than a deliberate hierarchy. Normalized to `rounded-2xl`, matching the documented card convention (frontend)
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
- **Authenticated teacher profile responses were marked publicly cacheable.** `GET /api/teachers/{username}` and `/related` carry no auth middleware, but `TeacherResource` reads `$request->user('sanctum')` and unmasks email, phone, exact address and a signed CV URL whenever a token is present — while both endpoints returned `Cache-Control: public, max-age=120, stale-while-revalidate=60` and no `Vary`. That combination tells every shared cache between the API and the browser that one teacher's contact details are a public document, free to replay to the next caller. A CDN was never required for this to bite: Next.js server-side `fetch` honours `Cache-Control` and its data cache is shared across users, so the exposure was reachable with the current deployment. Responses to an authenticated request are now `private, no-store`; guest responses stay publicly cacheable, and both send `Vary: Authorization` — set on *both* branches deliberately, since a cache that has already stored the guest copy needs to know a tokened request is a different entry, and saying so only on the authenticated response comes too late. New `App\Support\ResponseCache` centralises the decision, and `PublicTeacherCacheHeadersTest` locks it in from both sides (backend)
- Blocked and soft-deleted teachers could still be reached through the public directory. `JobRecommendationService` filtered on `users.is_blocked`, but `TeacherService::search()`, `findByUsername()` and the similar-teachers loader did not — so blocking an account removed it from recommendations while leaving it listed, searchable and directly addressable by username. Replaced the per-feature checks with one `Teacher::publiclyVisible()` scope (blocked flag plus the relation's soft-delete scope, which also covers profiles outliving a deleted user) applied across search, profile lookup, the related-teacher loader and the similarity candidate set (backend)
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

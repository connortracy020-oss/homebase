# Homebase build plan (draft for your OK)

Written 2026-10-19 after the research pass. What the research found, and what changed from your brief, is in [research/INDEX.md](research/INDEX.md). Nothing is built yet.

## 1. Stack (and why)

| Piece | Choice | Why |
|---|---|---|
| Server | **Python 3.13 + FastAPI** | Your language. FastAPI reads like plain functions, and it gives the app's pages, the REST API and the Claude API one shared code path. |
| Database | **SQLite** via **SQLModel** | One file in `data/`, nothing to install, easy to back up and export. SQLModel tables are ordinary Python classes. |
| Pages | **Jinja2 templates + HTMX**, a little vanilla JS, **KaTeX** for math | Server-rendered HTML, so there's no React build step to learn. HTMX handles checkbox ticks and timers without page reloads. Works on a phone browser and installs as a home-screen app (PWA). |
| Video | **YouTube iframe API** | Every lecture we use is on YouTube, including MIT's. The player reports the current time, so "add note" stamps it automatically. |
| PDFs | Browser's built-in viewer for reading; **pypdf** to cut out the exact key pages for feedback | Avoids copying textbook text into the app. |
| Photos | **Pillow**: rotate upright, resize to ≤2000 px, keep the original | Matches Claude's image limits (from shared research). |
| AI feedback | **Anthropic SDK, `claude-opus-5-5`**, structured JSON output | See §5. |
| Claude access to the app | **MCP server** (official Python `mcp` SDK) on top of the same functions as the REST API | Claude Code and Claude Desktop can read your progress and make changes in it. |
| Generated problems | **NumPy / SymPy** generators that compute and check the answer | Meets the rule that any generated problem has a verifiable answer. |
| Tests | **pytest**, plus a browser check of each screen at laptop and phone width | |
| Phone access | **Tailscale** (free) to the laptop | Data stays on your disk; nothing is public. The app is built so moving to Fly.io (~$2–3/mo) later means copying the data folder, not rewriting anything. |
| Durability | Nightly copy of `data/` into OneDrive (or any synced folder) + one-click **Export all** (JSON + uploads zip) | |
| Version control | **git**, with a commit per working step | Git isn't installed yet. I'd install it with `winget install Git.Git`, with your OK. |

## 2. Data model (SQLite tables)

- **Course**: code, title, Winter instructor and meeting times, an `exam_style_known` flag, plus a note shown in the app (for ECE 200 it says the grading and exam style are unknown).
- **CourseWeek**: course, week 1–10, topics, the OSU template it came from, readings (resource + section).
- **PrepWeek**: one of the 11 calendar weeks Oct 19 – Jan 3, with planned hours and its tasks.
- **Task**: a checklist item (`watch | read | solve | submit | review | lab | exam`), linked to a video, reading, problem set or exam; estimated minutes; done time.
- **Resource**: URL, license, local file path, `verified`, notes. Seeded straight from the research JSON.
- **Video** + **Chapter**: duration and priority (core/optional/skip). Chapters have a time, a title and a kind (concept, example, demo…).
- **Note**: markdown, optionally pinned to a video and timestamp, or to a problem.
- **ProblemSet** + **Problem**: source PDF and page, topics. `key_type` is one of `official_worked | official_answer | computed | none`. Key file and page are stored as pointers (we never type an answer in by hand). Generated problems also store the generator name and seed.
- **Submission**: problem or exam attempt; uploaded files; status `pending → reviewed`. Also stored: transcription, feedback, verdict (`correct | partial | incorrect | unclear`), and who reviewed it (`api | claude_session | self`).
- **Mistake**: problem, submission, cause tag (concept / setup / algebra-sign / units / careless), Leitner box 1–5, due date, retired date. Each re-solve is stored as a **ReviewAttempt** (`solid | shaky | miss`).
- **ExamTemplate** + **ExamAttempt**: source PDF, solutions PDF, time limit, rules; start and end time, per-problem score, total.
- **StudySession**: course, minutes, source (`timer | manual | claude`).
- **ActivityLog**: every change made through the API or by Claude, with who made it, so you can see what Claude did and undo it.

## 3. Screens

1. **Today**: what's due this prep week, the mistake reviews due today (capped at about 15–20 min), and a study timer. This is the phone home screen.
2. **Course → Week**: the checklist, videos, readings, problem sets, and the exam-style note.
3. **Video**: player with clickable chapters, and a notes pane that stamps the current time.
4. **Problem set**: problem list with key badges ("official worked solution", "answer only", "computed", "no key"), the PDF, and an upload button.
5. **Submission**: photos, the transcription (you can correct it), feedback, verdict, and "add to mistake log".
6. **Mistakes & Review**: the Leitner queue, re-solve cold, mark solid, shaky or miss.
7. **Exams**: pick an exam. Exam mode is full screen with a countdown and notes hidden. Then upload, get feedback against the real solutions, and score it.
8. **Progress**: hours per course per week (planned vs actual), checklist %, exam scores, and mistake-box counts. Small charts, no clutter.
9. **Settings / Export**: backup status, Export all, and the AI-feedback mode.

Design: cream background, charcoal text, one muted accent per course, status shown as small text badges rather than colour-heavy widgets.

## 4. Content seeding

- The research JSON becomes **`content/<course>/weekNN.json`**, one file per course week: links, page references, our own summaries and chapter lists. These files go in git. No copyrighted text goes in git; PDFs stay in the git-ignored `library/`.
- A **seed script** loads `content/` into SQLite. Re-running it updates content without touching your progress, notes or submissions.
- A **validator** fails the build if any task points at a missing file, a dead link, or a problem whose key is marked official but has no key page.
- **Generated problems** (to fill the gaps: Y-Delta, supermesh, mesh, convolution, DFT, integrals) come from small Python generators. Each one builds the problem, solves it with NumPy or SymPy, checks it a second way (e.g. nodal vs mesh, `np.convolve` vs a hand loop, SymPy vs numeric integration), and uses "nice" numbers so it works without a calculator.

## 5. Submissions and AI feedback

1. You upload photos or a PDF of your work for one problem (or a whole exam).
2. The app cuts the official solution pages for that problem out of the key PDF.
3. Claude gets your pages plus the key pages and returns structured JSON with:
   - a transcription of your work
   - a step-by-step check
   - the first wrong step
   - the cause tag
   - a short explanation
   - a verdict
   - an "unsure / illegible" flag
4. The prompt tells Claude the key is the authority and that it must not invent an answer when there is no key. Problems with `key_type: none` get reasoning-only feedback, clearly labelled.
5. You confirm or correct the verdict. A miss goes into the mistake log in one click.

There are two ways to run step 3 (question 1 below):
- **API mode:** instant. It needs an Anthropic API key in `.env`. My estimate is roughly $0.05–0.10 per problem with Opus 5.5 ($4 / $20 per million tokens, about 15k tokens in and 2k out), or about $5–10 for 100 submissions.
- **Claude-session mode:** submissions wait in a "needs review" queue. When you next open Claude Code or Claude Desktop, Claude reviews them through the MCP tools. No extra cost on your subscription, but not instant.

## 6. The Claude API (MCP)

Tools Claude gets, all logged in ActivityLog:
- **Reading:** `get_overview`, `get_week`, `get_progress`, `list_due_reviews`, `list_mistakes`, `get_submission`, `list_pending_submissions`.
- **Writing:** `mark_task_done`, `log_study_session`, `add_note`, `add_mistake`, `record_review_outcome`, `post_feedback`, `record_exam_score`.

So if you work a problem with me in Claude, I can log the time, tick the task and file the mistake. Claude Code and Claude Desktop on this laptop connect locally. Using it from claude.ai on your phone needs a public HTTPS address with a token (question 2).

## 7. Prep schedule, Oct 19 – Jan 3 (≈50 h)

Lighter until Thanksgiving, heavy all December, easing at Christmas. ECE 201 gets the most time. The goal is honest: a **full first pass of ECE 201**, **MTH 254 through Exam 2 scope** (integrals previewed), and **ECE 200 through convolution plus 5 Python labs**. Video times assume about 1.25× speed.

| Wk | Dates | Hrs | ECE 201 | MTH 254 | ECE 200 |
|---|---|---|---|---|---|
| 1 | Oct 19–25 | 3 | Charge, V, I, power, sign convention (6.002 L1, short videos), Ulaby ch 1 exercises | — | — |
| 2 | Oct 26–Nov 1 | 4 | Ohm, KCL/KVL, dependent sources (6.002 L2) | Vectors, dot product (18.02 L1) | — |
| 3 | Nov 2–8 | 4 | Series/parallel, dividers, Y-Δ | Cross product, determinants (L2) | Complex numbers, sinusoids, phasors |
| 4 | Nov 9–15 | 4 | Nodal + supernode | Lines, planes, curves (L4–L5) | Phasor addition, spectrum · Lab 1 |
| 5 | Nov 16–22 | 4 | Mesh analysis | Velocity, arc length (L6) | Fourier series idea · Lab 2 |
| 6 | Nov 23–29 | 2 | **Thanksgiving:** mistake-log reviews + one timed Midterm-1-scope set | | |
| 7 | Nov 30–Dec 6 | 7 | Supermesh, superposition, Thevenin/Norton (6.002 L3) | Surfaces, level curves, partials (L8) | Sampling, aliasing · Lab 3 |
| 8 | Dec 7–13 | 6 | Max power, op-amps (L19–L20) | Chain rule, gradient (L11–L12) · **timed Exam 1** (18.02SC, skip matrices) | FIR filters · Lab 4 |
| 9 | Dec 14–20 | 8 | Op-amp drills, capacitors, RC (L12) · **timed EE 40 exam** | Tangent planes, max/min (L9–L10) | Convolution, LTI · Lab 5 · **timed GT Quiz 1** |
| 10 | Dec 21–27 | 5 | Inductors, RL, step-response method, semiconductor/fab intro | **Timed Exam 2-scope** practice | Frequency response preview |
| 11 | Dec 28–Jan 3 | 3 | Light pass: mistake sweep across all three, ECE 201 final-scope skim | Double-integral preview (L16) | Review |

Week 8 is OSU's own fall finals week, so it's 6 h, not 8. Change it if you need. From Jan 4 the app switches to **term mode** and follows each course's 10-week plan alongside your real classes.

## 8. Build stages and who does what

Each stage ends with tests passing, a short "how to run it" note in the README, and a commit.

| Stage | What | Who |
|---|---|---|
| a | Skeleton: models, seed loader, Today, course/week checklists, timer, progress, export, backup | Me |
| b | ECE 201 week 1 as the template: video + chapters + timed notes, readings, problem set with key badges, first circuit generator | Me |
| c | Uploads, key-page cutting, AI feedback (API + session queue), MCP server | Me. A sub-agent builds a small test set (sample work images with known errors) and checks feedback quality. |
| d | Mistake log + Leitner review queue | Me |
| e | Timed exams: templates from real exam PDFs, exam mode, scoring | Me |
| f | Content for all 10 weeks × 3 courses | **3 parallel sub-agents**, one per course, writing `content/` files. **1 generator agent** for code-checked problems. **1 validator agent** that checks every link, key pointer and task. I review every diff before it's committed. |

Optional extra in stage f: chapter timestamps for the YouTube (non-MIT) videos, pulled from their captions with Claude in Chrome.

## 9. Things only you can do

- Fill in the free Ulaby 3rd-edition form (course "ECE 201", Oregon State; name optional), then save the PDF to `library/ece201/ulaby/`. The book page is https://www.fulcrum.org/concern/monographs/5t34sp19h, which has a "Register for Free Download" button.
- Install **Tailscale** on the laptop and phone (free), if you want phone access.
- If you pick API mode: create an Anthropic API key and put it in `.env`. I never see or type it.
- Optional: ask Prof. Anand whether he'd share the old ENGR 201 W22 homework PDFs.

## 10. Decisions (answered 2026-10-19)

1. **Feedback engine:** both modes. Claude-session review is the default. API mode is a switch in Settings and needs a key in `.env`.
2. **Claude access:** Claude Code and Claude Desktop on this laptop only, via a local MCP server. Nothing is exposed to the internet.
3. **Hosting:** runs on the laptop. The phone connects over Tailscale and works only while the laptop is on.

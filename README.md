# Homebase

Connor's home base for teaching himself ECE 201, MTH 254 and ECE 200 before Winter 2027 at OSU. It holds a week-by-week plan with checklists, a study timer, and progress per class. Later stages add video notes, problem sets, AI feedback on handwritten work, a mistake log with spaced review, and timed practice exams. The full plan is in [PLAN.md](PLAN.md), and what the research found is in [research/INDEX.md](research/INDEX.md).

## Run it

```powershell
.\run.ps1
```

Then open **http://localhost:8254**. The first run sets up the Python packages (about a minute).

**On your phone:** install Tailscale on the laptop and the phone and sign in to both with the same account. While the laptop is on, open `http://<laptop-name>:8254` on the phone. In the phone browser's menu, choose "Add to Home Screen" to get an app icon.

## Pages

| Page | What it does |
|---|---|
| **Today** | This prep week's checklist, a study timer, and logging time by hand |
| **Plan** | All 11 prep weeks (Oct 19 – Jan 3), with planned hours and tasks |
| **ECE 201 / MTH 254 / ECE 200** | Instructor, exam-style notes (marked *unknown* where they are), and the 10 term weeks |
| **Progress** | Hours logged vs planned per course and week, tasks done, and the activity log |
| **Settings** | Export everything as a zip; daily backup to OneDrive |

The timer keeps running if you close the tab or your phone sleeps; press **Stop & log** when you finish.

## Studying a week (stage b, built out for ECE 201 week 1)

Open **ECE 201 → Week 1**. The week page is the hub for that week:

- **Watch:** the week's lectures. A video page has the player, clickable chapters (built from MIT's own caption files), and notes. A note is pinned to the moment you *started typing* it, and clicking its time jumps the video there. Notes can include math such as `\(v = iR\)`. Homebase remembers where you stopped. Ticking *Watched* also ticks the matching task in the plan.
- **Read:** links to each reading. Local copies open from `library/`. The free Ulaby textbook shows *not downloaded yet* until you save it as `library/ece201/ulaby/ulaby_cad3e.pdf`.
- **Solve:** problem sets. Each problem says what its key is:
  - *Official worked solution* / *Official answer only*: the problem is cut out of the real PDF page, and the solution stays hidden until you click **Show**.
  - *Answer computed and checked by code*: generated problems (week 1: power and the passive sign convention, power balance around a loop, charge vs. current). Type your answers and get ✓/✗ per answer, plus worked steps. Each generator checks its own answer a second way before it shows you the problem.
  - After each problem, rate it **Solid / Shaky / Missed it**. Those ratings feed the mistake log in stage (d).

The other weeks and courses get the same structure in stage (f): add `content/<course>/weekNN.json` (see `content/ece201/week01.json`, which is the template).

Problem images are cut out of the PDFs on demand and cached in `data/cache/`. No problem text is copied into git.

## Feedback on handwritten work (stage c)

On any problem page, use **Submit your handwritten work**. Upload photos (one per page, upright, good light) or a PDF scan. Homebase rotates photos upright, resizes them, and bundles a review packet: the problem, the **official key** for it (cut from the published solution, or the code-computed answers), and your pages.

Claude then reviews the packet one of two ways:

| Mode | How | Cost |
|---|---|---|
| **Claude session** (default) | Open Claude Code or Claude Desktop with the Homebase tools connected and say *"Review my pending Homebase submissions."* Claude reads each packet and posts feedback back. | Covered by your Claude plan |
| **Instant (API)** | Put `ANTHROPIC_API_KEY=...` in a file named `.env` in the Homebase folder (it's git-ignored), restart, and pick "Instantly via the API" on the Feedback page. | About 5–10¢ per problem (Claude Opus 5.5) |

Each review gives you:
- a transcription of what Claude read in your work
- the first error, with a cause tag (concept / setup / algebra-sign / units / careless)
- short feedback
- a table of your answers next to the key's
- a verdict: correct, partial, incorrect or unclear

The rules Claude follows are in `app/feedback.py`:
- the key wins any disagreement
- unreadable writing is flagged, never guessed
- no answer is ever called "correct" when no key exists

Then you settle the verdict (**Agree** or pick another), and that counts as an attempt on the problem.

`scripts/feedback_eval.py` makes fake handwritten submissions with known mistakes to check review quality. In the first run, a separate Claude reviewer got 7/7 verdicts and causes right.

## Mistake log and spaced review (stage d)

**What goes in the log:**
- a problem you rate *Missed it* (or *Shaky*, while the "add to mistake log" box is ticked, which it is by default)
- a wrong typed answer on a generated problem
- feedback you settle as incorrect or partial, which brings its cause tag and "first error" note along

Missing a problem that's already in the log sends it back to box 1 instead of making a copy.

**Review** (in the nav, with a count) lists today's **cold re-solves**: no notes and no peeking until you're done. It follows the 5-box ladder from the research:

| Box | Next re-solve after |
|---|---|
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 14 days |
| 5 | 28 days |

- **Solid** (right, no help): up one box. Solid from box 5 retires it.
- **Shaky** (hint needed or slow): same box, same gap again.
- **Missed it**: back to box 1, tomorrow.

Reviewing an item when it comes due:

- **Order:** today's queue is oldest-due first and mixes courses.
- **Daily budget:** it holds about 20 minutes of re-solves. Extra items wait, with no penalty.
- **Generated problems:** these come back with **new numbers** each time, so you can't just remember the answer.
- **Pre-exam sweep:** 5 to 7 days before an exam, use the **pre-exam sweep** link for a course. It re-solves every logged problem for that course, including retired ones. A retired one you miss goes back on the ladder.
- **Mistake log page:** shows every item, where it sits, and which causes keep coming up per course.

## Timed practice exams (stage e)

**Exams** (in the nav) lists real past exams that come with official solutions:

| Course | Exams so far |
|---|---|
| ECE 201 | Berkeley EE 40 Fall 2011 Midterm 1; the ECE 201 parts of Spring 2012 Midterm 2 |
| MTH 254 | MIT 18.02 Exams 1 and 2 |
| ECE 200 | Georgia Tech ECE 2026 Spring 2025 Quizzes 1 and 2 |

**Taking one:**
1. **Rules page.** It shows the time limit and practice rules: closed book and no calculator, plus the note sheet or 3x5 card OSU-style exams allow. It also shows the original exam's rules, anything left out as out of scope (with the time cut to match), and how the exam was checked.
2. **Start the clock.** Exam mode hides the navigation, shows a countdown that turns red at 5 minutes, and runs the clock on the server, so closing the page doesn't pause it. At zero: *Time's up, pencils down.* The time is logged as study time.
3. **Upload** photos of your pages.
4. **Grade** problem by problem with the official solution shown next to each one.
   - **Suggested points (optional):** say *"Grade my Homebase practice exam"* in a Claude session, or use the API button if you have a key. Claude suggests points with a comment and the first error for each problem. You enter the final points.
   - **Mistake log:** problems you lose points on are ticked for it, and you can untick any.
5. **Scores** show on the exam page and on Progress.

**Why each exam is checked by eye.** `scripts/exam_audit.py` found that many archive "blank" exams are really solved copies, so every exam is checked by eye before it goes in. The audit results are in `research/exam_audit.txt`, and `scripts/contact_sheet.py` / `scripts/exam_pages.py` show what's on each page.

**Adding more exams:** use `content/<course>/exams.json`. Each problem points at exam and solution pages, or at a text-bounded region of a page.

## What's in the courses (stage f)

All 10 term weeks of all three courses are filled in:

| Course | Readings | Problems with keys (generated, with new numbers each time) | Timed exams |
|---|---|---|---|
| ECE 201 | 48 | 344 (65) | 7 Berkeley EE 40/100 exams |
| MTH 254 | 64 | 228 (40) | 7 MIT 18.02 exams and practice exams |
| ECE 200 | 34 | 190 (36) | 8 Georgia Tech ECE 2026 quizzes and finals |

The main sources for each course:
- **ECE 201:** Ulaby exercises and concept questions, Kuphaldt worksheets, Fiore answers (optional), MIT 6.002 notes, OpenStax Physics.
- **MTH 254:** OpenStax Calculus Vol 3 (every section), CLP-3 text and problem book, MIT 18.02SC problem sets and supplementary problems.
- **ECE 200:** Signal Processing First slides, Think DSP, the DSP First problem database (worked solutions as scans), and the DTFT/DFT draft chapters.

Every problem's key is a published solution or code-computed. Every exam was checked by eye.

**Known thin spots:**
- ECE 201 Y-Delta and supermesh: the generated drills help.
- MTH 254: no keyed curvature practice.
- ECE 200 weeks 8–10 (DTFT, DFS, DFT): these come only from exam problems plus generated DTFT/DFT drills.

**Adding or changing content:** see [content/README.md](content/README.md). `scripts/validate_content.py --render` checks every file, link, page and crop; `scripts/wire_generated.py --write` adds a generator's drills to its week.

## Claude access (MCP server)

`mcp_server.py` gives Claude these tools on your Homebase:

| Tools | What Claude can do |
|---|---|
| `get_overview`, `get_week`, `get_progress`, `list_problems`, `get_problem` | See your plan, progress and problems |
| `list_pending_submissions`, `get_submission`, `post_feedback` | Review your queued work |
| `mark_task_done`, `log_study_session`, `add_note`, `record_problem_result`, `mark_video_watched` | Log work you do with Claude in chat |
| `list_due_reviews`, `list_mistakes`, `add_mistake`, `record_review_outcome` | Run your daily re-solves in chat and log mistakes |
| `list_exams`, `post_exam_grades` | See practice exams and suggest grades for a finished sitting |
| `recent_activity` | See what changed recently |

**Connected on this laptop (2026-10-19):**
- **Claude Code:** user scope, so every project sees Homebase.
- **Claude Desktop:** restart it once to load Homebase. Its previous config is saved next to it as `claude_desktop_config.before-homebase.json`.

Everything Claude changes shows up as **Claude** in the activity log on the Progress page.

- **Claude Code in the Homebase folder:** picks it up from `.mcp.json` (approve it once when asked).
- **Claude Code anywhere** (run once in a terminal):
  ```
  claude mcp add --scope user homebase -- C:\Users\conno\Documents\Homebase\.venv\Scripts\python.exe C:\Users\conno\Documents\Homebase\mcp_server.py
  ```
- **Claude Desktop:** add this to `%APPDATA%\Claude\claude_desktop_config.json` under `"mcpServers"`, then restart Claude Desktop:
  ```json
  "homebase": {
    "command": "C:\\Users\\conno\\Documents\\Homebase\\.venv\\Scripts\\python.exe",
    "args": ["C:\\Users\\conno\\Documents\\Homebase\\mcp_server.py"]
  }
  ```

The MCP server reads the same database as the web app, so the web app doesn't need to be running.

## Your data

- Everything you do is in `data/homebase.db`, a single SQLite file. `data/` is never committed to git.
- **Backup:** once a day while Homebase runs, a copy goes to `OneDrive\Homebase backups` and the last 14 days are kept. You can pick a different folder in Settings.
- **Export:** Settings → Download export gives a zip with every table as JSON, plus your uploads.
- Course PDFs live in `library/`. They're personal-study copies and are also never committed.

## How it's built

- **FastAPI** (Python web framework) and **SQLite** via **SQLModel**. Each table is a Python class in `app/models.py`.
- Pages are HTML templates in `app/templates/`; `app/static/app.js` adds instant checkbox saves and the timer.
- Every action is a function in `app/services.py`. The pages, the JSON API (`/api/...`), and in a later stage the Claude MCP server all call those functions, so every change lands in the activity log, including changes made by Claude.

```
app/        the app (models, services, pages, API, backup)
app/generators/   problem generators with code-checked answers
app/pdfpages.py   cuts one problem or solution out of a PDF page
content/    course content as JSON: weeks, videos, prep schedule (committed)
research/   research reports + data the content came from (committed)
library/    downloaded course PDFs (git-ignored)
data/       your database, uploads, exports (git-ignored)
scripts/    one-off tools (build content from research, check research)
tests/      pytest tests
```

### Changing content

1. Edit the files in `content/`. `prep_schedule.json` is the week-by-week plan.
2. Restart Homebase, or run `.venv\Scripts\python -m app.seed`.

Re-seeding keeps your done marks and study time. A task that you delete from the content file is removed, and the removal is noted in the activity log.

`scripts/build_content.py` regenerates `content/<course>/weeks.json` and `videos.json` from `research/`.

### Tests

```powershell
.venv\Scripts\python -m pytest -q
```

Tests use a temporary database, so your real data is never touched. To try the app without touching your data, start it with `$env:HOMEBASE_DATA="C:\temp\hb-test"; $env:HOMEBASE_NO_BACKUP="1"`. To pretend it's another day, also set `$env:HOMEBASE_TODAY="2026-12-14"`.

## Ground rules this app follows

- Answer keys come only from real published solutions or from answers computed and checked with code. Claude gives feedback, but it is not the answer key.
- Anything unverified is labelled. ECE 200's grading and exam style at OSU are unknown, and the app says so.
- Resources are linked or stored locally for personal study only; nothing copyrighted is committed.

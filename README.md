# Homebase

Connor's home base for teaching himself ECE 201, MTH 254 and ECE 200 before Winter 2027 at OSU. It holds a week-by-week plan with checklists, a study timer, and progress per class. Later stages add video notes, problem sets, AI feedback on handwritten work, a mistake log with spaced review, and timed practice exams. The full plan is in [PLAN.md](PLAN.md), and what the research found is in [research/INDEX.md](research/INDEX.md).

## Run it

```powershell
.\run.ps1
```

Then open **http://localhost:8254**. The first run sets up the Python packages (about a minute).

**On your phone:** install Tailscale on the laptop and the phone and sign in to both with the same account. While the laptop is on, open `http://<laptop-name>:8254` on the phone. In the phone browser's menu, choose "Add to Home Screen" to get an app icon.

## What's here (stage a)

| Page | What it does |
|---|---|
| **Today** | This prep week's checklist, a study timer, and logging time by hand |
| **Plan** | All 11 prep weeks (Oct 19 – Jan 3), with planned hours and tasks |
| **ECE 201 / MTH 254 / ECE 200** | Instructor, exam-style notes (marked *unknown* where they are), and the 10 term weeks |
| **Progress** | Hours logged vs planned per course and week, tasks done, and the activity log |
| **Settings** | Export everything as a zip; daily backup to OneDrive |

The timer keeps running if you close the tab or your phone sleeps; press **Stop & log** when you finish.

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

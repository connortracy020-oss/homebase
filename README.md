# Homebase

Connor's home base for teaching himself ECE 201, MTH 254 and ECE 200 before Winter 2027 at OSU. It holds a week-by-week plan with checklists, a study timer, and progress per class. Later stages add video notes, problem sets, AI feedback on handwritten work, a mistake log with spaced review, and timed practice exams. The full plan is in [PLAN.md](PLAN.md), and what the research found is in [research/INDEX.md](research/INDEX.md).

## Run it

```powershell
.\run.ps1
```

Then open **http://localhost:8254**. The first run sets up the Python packages (about a minute).

**On your phone:** install Tailscale on the laptop and the phone and sign in to both with the same account. While the laptop is on, open `http://<laptop-name>:8254` on the phone. In the phone browser's menu, choose "Add to Home Screen" to get an app icon.

## Desktop app

Open **Homebase** from the Start menu or the desktop icon. Right-click it to pin it to the taskbar. It opens in its own window, with no tabs or address bar. Homebase starts quietly in the background if it isn't already running.

- **Closing the window** leaves Homebase running, so your phone can still reach it over Tailscale.
- **To stop it,** go to Settings → Desktop app → **Stop Homebase**. This only works from the laptop.
- **Server messages** go to `data/logs/server.log`.

The shortcuts come from `.venv\Scripts\python scripts\install_desktop.py`. Add `--remove` to take them away again. The window uses Edge in app mode (Chrome if Edge is missing), with its own profile in `data/desktop/`. On the iPhone, Safari → Share → **Add to Home Screen** gives the same icon.

## Pages

| Page | What it does |
|---|---|
| **Today** | This prep week's checklist (the next task's key is course-colored), a study timer with this week's progress ring, reviews and feedback waiting, and logging time by hand |
| **Plan** | All 11 prep weeks (Oct 19 – Jan 3), with planned hours and tasks |
| **Courses** | The three course tiles; each opens the course page (instructor, exam-style notes marked *unknown* where they are, the 10 term weeks) |
| **Circuits** | The Circuit Bench: draw a circuit and it solves as you build it (see below) |
| **Progress** | Hours logged vs planned per course and week, tasks done, and the activity log |
| **Settings** | Local AI status, light / dark / match device, export everything as a zip, daily backup to OneDrive |

On a laptop the nav is the tab strip at the top. On a phone it's the bottom bar (Today, Courses, Review, Exams, and More for the rest). The moon/sun key switches light and dark mode, per device.

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

## Readings and read aloud

Clicking a reading anywhere (a task, or **Open** on a week page) opens your own PDF from `library/` inside Homebase, at the reading's first page. **Open in browser ↗** gives you a full Edge tab instead.

**Read aloud** (the second tab on the reader) reads the PDF to you in Lecture Desk's **Chatterbox** voice:
- **What you see:** the page is shown as an image, and the sentence being read is highlighted on it.
- **Controls:** click any sentence to start there. Use ▶/❚❚, previous and next sentence, speed (0.8–2×), the page box, **Follow along**, and **⛶ full screen**.
- **Keys:** Space plays or pauses, ←/→ move a sentence, PgUp/PgDn change pages, F is full screen.
- **You resume where you stopped:** the place is saved per reading.
- **Reading options** sets what to skip: page headers and numbers, footnotes, picture and table captions, reference markers, and mostly-math lines.
- **Timing:** the voice takes up to about 1½ minutes to start the first time. Making speech takes a little longer than playing it (about 1.2 to 1.7 seconds of work per second of speech, plus 3–4 seconds per sentence), so Homebase works ahead:
  - While you listen, it keeps about 2 minutes of upcoming sentences prepared, running on into the next page. The sentence you're waiting for always goes first, and look-ahead for a place you've jumped away from is dropped.
  - **Prepare the next 10 pages now** (in Reading options) has the voice speak the next pages in the background, from the page you're on. It never holds up what's playing, you can stop it, and replaying prepared pages has no waiting at all. Use it before you sit down to listen.
  - Pausing doesn't lose anything: prepared sentences stay cached.
- **When it stops:** after 3 idle minutes, or right away with **Stop the voice**, which frees the GPU.

**How it shares Lecture Desk's voice:**
- Homebase runs Lecture Desk's `ChatterboxReader.exe` as its own separate process, read-only.
- Its model folder, `data/speech/models/`, holds hard links to Lecture Desk's model files: the same files on disk, with no copy and no change.
- Audio is cached in `data/speech/reader-cache/`.
- If Lecture Desk is using its Chatterbox voice, or the GPU lacks about 4.5 GB free, Homebase says so instead of competing. **Try anyway** overrides it.
- It never downloads or changes anything in Lecture Desk's folders.

## Notes (organized notebooks)

**Notes** in the nav opens one notebook per course.

**How each notebook is laid out:**
- **Inbox:** things not sorted yet.
- **Units:** one per term week, named by its topic. You can rename them by clicking the title, and add your own.
- **Formula sheet:** collected automatically, see below.

Every unit has the same five parts: **Key ideas, Definitions, Formulas & equations, Worked examples, and Pitfalls & tips**.

**Editing:**
- **+ Add** a block, then edit it in place. ✎ or a double-click reopens a block.
- Math is LaTeX, with `\( \)` inline and `$$ $$` on its own line, and a live preview shows it as you type.
- Formula blocks have a name, the equation, "where" (what the symbols mean) and "use when".
- Drag a block to reorder it or move it to another part. ⇄ moves it to another unit.
- Delete with × and undo from the message that pops up. **History** lists every change, with Undo.

**Formula sheet:** every formula from all units, grouped by unit. Star (★) the ones you want for an exam sheet. **Print the starred ones** lays them out on one page.

**Screenshots:**
- **Add a screenshot**, paste one (Ctrl+V) or drag one onto the page. It's kept in `data/notes/`, which stays out of git.
- **✦ Draft notes** on a screenshot asks the local AI to draft blocks with a suggested unit and part. You check each draft and press **Add**, or **Add all**. Nothing is saved until you do.

**Elsewhere in Homebase:**
- **→ notebook** on a video note copies it into that week's unit, linked back to the video at that time.
- The week hub shows how many notes the week has, with a link.

**Interactive illustrations:** an **interactive** block is a small HTML and JavaScript illustration, such as draggable vectors or a slider that changes R and C on an RC curve, with a description above it.
- Claude writes them through `notes_add(kind="interactive", description=...)`. You can also edit one in place: the code is in the block's editor, with a live preview.
- Each one runs in a sandboxed frame. It can't read Homebase, your cookies or storage, and it has no network access, except loading libraries from cdn.jsdelivr.net.
- It follows the app's light/dark theme and the course color, and its frame grows to fit.
- The rules and helpers (`HB.color`, `HB.onTheme`, `HB.math`) are in `app/widgets.py`.

**With Claude:** give Claude Code or Claude Desktop a screenshot and say *"Add this to my MTH 254 notes"*.
- Claude reads the outline and writes the content in its own words.
- It puts each piece in the matching unit and part, and updates an existing formula instead of adding a duplicate.
- If it isn't sure where something goes, it puts it in the Inbox with a suggested home.
- When a figure matters, it keeps the screenshot itself, cropped to the figure. An image pasted into a chat lives only in Claude's sandbox, so `screenshots_recent` shows Claude the image on your clipboard and your newest screenshots (from the last 6 hours, in the Windows Screenshots folder that Win+Shift+S saves to). Claude picks the one that matches and passes its name to `notes_add(screenshot=..., crop=...)`.
- It tells you what it added and where. Its blocks show a **by Claude** label and can be undone.
- The tools it uses are `notes_outline`, `notes_search`, `notes_add`, `notes_update`, `notes_move` and `notes_add_unit`.

## Local AI (Qwen in your own Ollama)

When the Ollama app is running, Homebase uses a local model (default `qwen3.5:9b`) for four things:

| Where | What |
|---|---|
| Problem page → **Ask** (right-hand card on a laptop; the **Ask** button on a phone) | Hints, "check my final answer", and "explain the solution" after you've revealed it. Chats are saved per problem. |
| Problem page → **Check your final answer** (book problems) | Type your answer (`P = 6 W delivered`); Qwen compares it with the official key in about 5–15 s. If its tip quotes the key, the tip is hidden until you press "Show the key's values". |
| Problem page → **Snap my work** | Opens the phone camera, sends the photo straight away, and Qwen does a quick check against the key (about a minute). |
| Submission page | The quick check's feedback (labelled **Qwen · local**), with **Ask Claude to review too** for a second opinion. |

How it shares Ollama with your other apps (Lecture Desk uses `qwen3.5:9b`, OpenClaw uses the Qwen 3.8 27B):
- **It only sends chat requests.** It never starts, stops or reconfigures Ollama, and never pulls, deletes, copies, creates or renames models. All settings (context size, thinking, temperature) go on each request.
- **It waits its turn on the GPU.** If another app's model is loaded, the job waits, and the page says so, instead of pushing that model out. **Run anyway** is there if you know the other app is idle.
- **It does one job at a time,** with small contexts (8–16k tokens), and lets the model unload within a few minutes.

Hints are checked before you see them. For generated problems, Homebase blocks any hint containing the computed answer. For every problem, the model also checks its own hint for a give-away; a leaking hint is redone once, then held back.

Local verdicts are only suggestions. Nothing counts toward your results until you press **Agree** or rate the problem yourself. Timed exams never use the local model. If Ollama is off, everything else works, and submissions go to Claude as before. Settings → **Local AI** shows the status, the model and two switches.

How far to trust it: once you have 10–15 submissions with settled verdicts, run

```
.venv\Scripts\python scripts\eval_local.py
```

It re-checks them with the local model, without changing anything, and reports how often it agrees. If it agrees about 85% of the time and never calls wrong work correct, it's trustworthy enough to rely on.

First trial (2026-10-19, `qwen3.5:9b`):
- **Answer checks:** right verdicts on all-correct, all-wrong and one-part-wrong typed answers.
- **Quick checks:** right verdicts on typed-up work, one right and one with a sign-convention error. It found the first error.
- **Hints:** "just tell me the answer" got a hint instead of the answer.

That trial used typed-up work, not your handwriting. Your handwriting is still untested.

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

## Python labs (ECE 200)

ECE 200 at OSU has a weekly 2-hour computer lab. OSU doesn't publish its lab list, so Homebase has its own: 10 Python labs, one per term week, using NumPy, SciPy and Matplotlib in place of MATLAB. They're on each ECE 200 week page under **Labs**.

| Week | Lab | Background handout (DSP First, MATLAB) |
|---|---|---|
| 1 | Sinusoids and phasors | Lab P-2: complex exponentials (multipath) |
| 2 | Spectrum and synthesis | Lab 04: music synthesis |
| 3 | Sampling and aliasing | Lab S-8: spectrograms, chirp aliasing |
| 4 | FIR filters by hand | Lab S-4: convolution and FIR filters |
| 5 | Convolution and LTI systems | Lab P-9: sampling, convolution, FIR filtering |
| 6 | Frequency response of FIR filters | Lab P-12: bandpass and nulling filters |
| 7 | Averaging and nulling filters on sampled signals | Mini-Project 03: tone removal |
| 8 | The DTFT | Lab S-6: FIR filter design |
| 9 | Discrete-time Fourier series | Lab P-14: octave band filtering |
| 10 | The DFT by hand and touch-tone decoding | Lab 09: DTMF encoding and decoding |

**Doing a lab** (in a terminal in the Homebase folder; lab 4 as the example):

1. Run the checker once. It copies the starter to `data\labs\lab04_fir.py`, your own copy:
   ```powershell
   .venv\Scripts\python labs\check.py 4
   ```
2. Open `data\labs\lab04_fir.py` (VS Code works well: the `# %%` lines make cells you can run one at a time). Fill in every function marked **TODO**.
3. Run the checker again. Each check prints:
   - **PASS:** your function matches NumPy/SciPy.
   - **FAIL:** it doesn't, and the message says by how much.
   - **TODO:** the function still returns `None`.
   - **ERROR:** your code crashed, and the message gives the line.
4. Run your file to see its plots: `.venv\Scripts\python data\labs\lab04_fir.py`.
5. When everything passes, tick the lab in the plan. The lab page and the week page show your last check.

**How it checks:**
- Your functions get test inputs, and the answers are compared with NumPy/SciPy. For example, your FIR loop is compared with `np.convolve` and `scipy.signal.lfilter`, and your DFT with `np.fft.fft`.
- When the point of a lab is to write something by hand (convolution, the DFT, frequency response), that function fails if it calls the built-in. Comments that mention the built-in are fine.
- Check a file somewhere else with `labs\check.py 4 --file C:\path\to\file.py`.

**Where things are kept:**
- Your lab files and check results are in `data\labs\`, which is backed up and included in the export.
- The starters in `labs\ece200\` stay blank.
- The checks are in `app/lab_checks/ece200.py`.
- Worked answers for the tests are in `tests/lab_answers/`. They are spoilers, so do the lab first.

If an older `.venv` is missing SciPy or Matplotlib, run `.venv\Scripts\python -m pip install -r requirements.txt` once.

## Circuit Bench

**Circuits** in the nav. Draw a circuit and it solves as you build it. The full design is in `design/CIRCUITS-PLAN.md`; phase 1 (DC and transients) and phase 2 (AC and frequency response) are built.

**Drawing:**
- Pick a part on the left (or press 1–8) and click where it goes. R rotates, X mirrors, Del deletes, Ctrl+Z / Ctrl+Y undo and redo. ⋯ → Keyboard shortcuts lists the rest.
- Wire by dragging from a terminal, or tap one terminal and then another (easier on a phone). Wires route around parts and never connect anything by accident.
- A wire end or a terminal that lands on another wire joins it, and a dot shows the junction. Wires that only cross don't join. Net labels with the same name are one node.
- It saves itself as you work. If Homebase can't be reached, it keeps a copy on the device and saves when it can. If Claude or another tab changed the circuit since you opened it, it asks which version to keep.

**Parts:** resistors, capacitors, inductors, voltage and current sources (constant, step, pulse or sine), the four dependent sources (controlled the textbook way, by `v(R2)` or `i(R2)`), ideal or finite-gain op-amps, coupled inductors (k or M, with dots), ideal transformers, three-phase sources (Y or Δ, abc or acb), one- and two-way switches that flip at a set time, ammeters, voltmeters, ground and net labels. A sine source takes its amplitude as peak or RMS, its frequency as ω or f, a phase (cosine reference) and a DC offset.

**What it shows:**
- Exact answers when the values allow (fractions like 72/13 V), otherwise decimals.
- Wires colored by voltage, a voltage pill on every node, each part's current, and a warm glow on parts that absorb power. Moving current markers are in the ⋯ menu.
- Tap a node to see KCL there: every current in and out. The power table shows that what's delivered is absorbed.
- When it can't solve, it says why in words and marks the parts, for example a loop of voltage sources, a floating node, or an op-amp with no feedback.
- **3D:** voltage becomes height, so a resistor is a ramp and a source is a cliff, and current runs as beads. Drag to orbit, or use WASD to move, Q/E to turn and Shift to go faster. The corner button or F makes it full screen (Esc leaves), with a Play button for AC and transient playback. There are three quality levels (Battery, Balanced, Cinematic). You never need the 3D view to use the bench.

**AC** (any sine source switches the bench to AC; the DC/AC switch on the right goes back):
- Every node and part as a phasor, in polar and rectangular form (exact when ω and the values allow), peak or RMS, always labelled.
- Complex power for every part (P, Q, |S|), the power factor with its lead or lag, and the capacitor that would correct it. Three-phase circuits add line and phase values, total power and the neutral current.
- **Phasors and waveforms:** the phasor diagram beside the waveforms its arrows make, with a time cursor. ▶ plays the cycle in slow motion through the 2D and 3D views.
- **Try ω:** a slider re-solves the whole circuit at another frequency as you drag (a what-if until you press Set).
- **Bode plot:** magnitude and phase over frequency, with the −3 dB corners, the peak, ω₀, Q and the bandwidth marked. Its cursor shows the circuit at that frequency.
- **H(s) and poles:** the transfer function between any source and output, exact when the values are, its poles and zeros on the s-plane, and the step and impulse responses. It works from the DC panel too.
- **AC Thevenin:** V_th and Z_th at a part or at terminals a and b, and the load Z_th* for maximum power.
- **Predict first** works in AC too: you guess a magnitude and an angle, and a miss by √2 (peak vs RMS) or by the angle only is called out.
- **3D in AC:** an instant of the cycle, or **|V| and phase**: height is each node's amplitude and color its phase angle.

**Study tools** (on the right, or in the bottom sheet on a phone):
- **Predict first:** values show as **?** until you commit a guess. A wrong guess tells you if only the sign or a factor of 1000 is off.
- **Equations:** the node equations it solved, and the matrix, exactly.
- **Thevenin / Norton** at any part, or at terminals labelled a and b: V_th, R_th and I_N, found the textbook way (a test source handles dependent sources), plus maximum power transfer.
- **Superposition:** each source's share of every node voltage, and the check that the shares add up.
- **Check my work:** type your node voltages, and it names the KCL equation that breaks, with the actual currents.
- **Sweep:** select a part and press **Sweep** to plot what changes as its value runs over a range. Its value slider changes it live.
- **Over time:** switches and step, pulse or sine sources. The values at t = 0⁻, 0⁺ and ∞ are exact, the first-order formula appears when there's one capacitor or inductor, and a scope plots everything. Playback runs the 2D and 3D views through time. It steps with TR-BDF2 and sizes each step from its own error estimate, so an RLC circuit rings only if it really does. With sine sources it starts in the sinusoidal steady state. **Spectrum** shows the run's frequency content (an FFT over whole periods when the period is known).

**With the rest of Homebase:**
- Generated ECE 201 circuit problems (52 of the 65; the rest have no circuit to draw) have **Open on the Circuit Bench**: the same circuit, with the same names and values, and predict first on. Your copy is kept, so opening it again goes back to your work.
- 13 Ulaby exercises have the button too (2-6, 3-1 to 3-6, 3-9, 3-12, 3-13, 4-6, 5-15, 5-16): their figures drawn on the bench, the same drawings the self-test checks against the published answers. They live in `app/static/circuits/selftest/book.js`; after changing one, run `node scripts/export_bench_book.mjs` to update `content/ece201/bench.json`, which the server opens them from.
- A wrong prediction or check on a problem's circuit goes into the mistake log, once a day per problem.
- ⋯ → **Add a picture to my notes** saves the schematic, as it looks right now, in a notes unit with a link back to the circuit.
- ⋯ → export a SPICE netlist (`.cir`) for LTspice, or the circuit file (`.json`).
- **Self-test** (`/circuits/selftest`, linked from the Circuits page) runs the solver in whatever browser opens it, on 26 Ulaby exercises with worked solutions (chapters 2 to 9: DC, transients, RLC, phasors, AC power and frequency response), and shows whether each one matches the book. Run it once on your phone.

**With Claude:** Claude can list, read, build and change circuits (`circuits_list`, `circuits_get`, `circuits_check`, `circuits_save`, `circuits_attempts`), for example from a figure you share. It checks each drawing with the bench's own solver, so it sees the same nodes, netlist and values you would, AC phasors included.
- **A shorthand for drawing:** a two-terminal part can say where its two pins go (`from`, `to`), any part can give its spot as `at`, and a wire can be a `path` of points. The bench stores the usual x, y and rotation (`expandDrawing` in `core/doc.js`).
- **Checks the solver doesn't make** (`io/lint.js`): wire ends that touch nothing, parts drawn on top of each other, wires through a symbol, shorted parts, diagonal wires and crowded labels.
- **A picture of the drawing** (`io/picture.js`, drawn by `app/circuit_picture.py`): the 2D view's own symbols and labels, node names, red rings on anything unconnected, and grid coordinates on the edges. `circuits_check` and `circuits_save` return it, so Claude can compare its drawing with the figure before telling you it's ready.

These checks need Node (installed on this laptop). Without Node, Claude can still save circuits written out in full, unchecked. Claude's changes are marked as Claude's, and it can't overwrite a change you made after it read the circuit.

**Not built yet:** op-amp output limits (rails and slew rate), superposition and the equations card in AC, diodes and transistors, SPICE import, "swap in the Thevenin equivalent", and goal exercises (phase 3 of the plan, and what phase 2 left).

## Claude access (MCP server)

`mcp_server.py` gives Claude these tools on your Homebase:

| Tools | What Claude can do |
|---|---|
| `get_overview`, `get_week`, `get_progress`, `list_problems`, `get_problem` | See your plan, progress and problems |
| `list_pending_submissions`, `get_submission`, `post_feedback` | Review your queued work |
| `mark_task_done`, `log_study_session`, `add_note`, `record_problem_result`, `mark_video_watched` | Log work you do with Claude in chat |
| `list_due_reviews`, `list_mistakes`, `add_mistake`, `record_review_outcome` | Run your daily re-solves in chat and log mistakes |
| `list_exams`, `post_exam_grades` | See practice exams and suggest grades for a finished sitting |
| `notes_outline`, `notes_search`, `notes_add`, `notes_update`, `notes_move`, `notes_add_unit` | Organize your notebooks (see Notes) |
| `screenshots_recent` | Find the screenshot you mean on this laptop, to keep it in your notes |
| `circuits_list`, `circuits_get`, `circuits_check`, `circuits_save`, `circuits_attempts` | Read, build, check and change Circuit Bench circuits, and see your predictions |
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
app/labs.py, app/lab_checks/   loads labs, runs the checks against NumPy/SciPy
app/circuits.py, app/static/circuits/   the Circuit Bench: storage here, the editor and solver in the browser
app/static/vendor/three-r170/   Three.js for the 3D view (MIT license), copied in so it works offline
content/    course content as JSON: weeks, videos, prep schedule (committed)
labs/       Python lab starters (labs/ece200/) and labs/check.py, the lab checker
research/   research reports + data the content came from (committed)
library/    downloaded course PDFs (git-ignored)
data/       your database, uploads, exports (git-ignored)
scripts/    one-off tools (build content from research, check research)
tests/      pytest tests; tests/js/ has the bench's solver tests (Node)
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

pytest also runs the Circuit Bench's solver tests (`node --test tests/js`) when Node is installed. Tests use a temporary database, so your real data is never touched. To try the app without touching your data, start it with `$env:HOMEBASE_DATA="C:\temp\hb-test"; $env:HOMEBASE_NO_BACKUP="1"`. To pretend it's another day, also set `$env:HOMEBASE_TODAY="2026-12-14"`.

## Ground rules this app follows

- Answer keys come only from real published solutions or from answers computed and checked with code. Claude gives feedback, but it is not the answer key.
- Anything unverified is labelled. ECE 200's grading and exam style at OSU are unknown, and the app says so.
- Resources are linked or stored locally for personal study only; nothing copyrighted is committed.

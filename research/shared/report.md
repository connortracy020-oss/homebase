# Shared research: calendar, course facts, study method, Claude API, hosting

Generated 2026-10-19. Everything below was read on the pages linked, fetched that day, unless it's marked otherwise. Machine-readable data is in `resources.json` (the `calendar.entries`, `resources` and `unverified` keys).

---

## 1. OSU academic calendar (Corvallis, Pacific time)

Sources:
- Registrar academic calendar. Fall 2026 is on page 1: https://registrar.oregonstate.edu/osu-academic-calendar. Winter 2027 is on page 2: https://registrar.oregonstate.edu/osu-academic-calendar?page=1
- 4-year calendar: https://registrar.oregonstate.edu/osus-4-year-calendar
- Final exam schedule: https://registrar.oregonstate.edu/final-examination-schedule

Confidence: **high**. The two registrar pages agree on every date they both list.

### Fall 2026 (current term, for context)
| Date | Event | Verified |
|---|---|---|
| Wed 2026-09-23 | Classes begin | yes |
| Wed 2026-11-11 | Veterans Day observed (holiday) | yes |
| Fri 2026-11-13 | Last day to withdraw from a course (no refund) | yes |
| Mon 2026-11-16 | Winter 2027 priority registration begins | yes |
| Thu-Fri 2026-11-26/27 | Thanksgiving break | yes |
| Fri 2026-12-04 | Classes end | yes |
| Mon 2026-12-07 to Fri 2026-12-11 | Finals week. The term ends 12-11 | yes |
| 2026-12-12 to 2027-01-03 | Winter break | yes |
| Wed 2026-12-16 | Fall grades available | yes |

### Winter 2027 (the target term)
| Date | Event | Verified |
|---|---|---|
| Mon 2027-01-04 | Classes begin. The Homebase plan ends the day before | yes |
| Sun 2027-01-10 | Last day to add online without dept. approval. Also the last day to drop with a 100% refund | yes |
| Fri 2027-01-15 | Last day to audit | yes |
| Sun 2027-01-17 | Last day to add online with dept. approval | yes |
| Mon 2027-01-18 | MLK Jr. Day (holiday) | yes |
| Sun 2027-01-24 | Last day to withdraw with a 50% refund | yes |
| Mon 2027-02-15 | Presidents' Day. **Neither OSU calendar lists it.** Secondary sources say OSU holds classes that day | **no** |
| Fri 2027-02-19 | Last day to withdraw (no refund). Also the last day to change grading basis (by noon) | yes |
| Mon 2027-02-22 | Spring priority registration begins | yes |
| Fri 2027-03-12 | Classes end. Last day to withdraw from the term | yes |
| Mon 2027-03-15 to Fri 2027-03-19 | Finals week. The term ends 03-19 | yes |
| **Tue 2027-03-16, 16:00** | **MTH 254 group final** (110 min). The instructor gives the room | yes |
| Wed 2027-03-24 | Winter grades available | yes |

### Exam schedule facts
These come from the registrar's exams page: https://registrar.oregonstate.edu/exams
- Finals are 110 minutes. Group finals start at 0730, 1600 or 2000, Monday to Thursday.
- Group midterms last one class period and start no earlier than 19:00.
- The Winter 2027 MTH 254 lecture sections all carry a **Tue 7:00-8:20 pm "Group Midterm Exam (GRP MID)"** meeting for the whole term (class search, section 020). So MTH 254 midterms are evening group exams on Tuesdays. The specific dates are not posted; the syllabus will give them.
- ECE 200 and ECE 201 have **no group final** in the table. Their finals follow the by-meeting-time grid on the same page: ECE 201 lecture is TR 8:30 and ECE 200 lecture is MW 4:00 pm. The exact slots were not looked up.

---

## 2. Course facts

Sources: https://catalog.oregonstate.edu/courses/ece/ and https://catalog.oregonstate.edu/courses/mth/ (2026-27 catalog). Confidence: **high**.

| Course | Exact catalog title | Credits | Prereqs (catalog) |
|---|---|---|---|
| ECE 201 | DC AND TRANSIENT CIRCUITS | 4 | MTH 251/251Z/251H/251HZ (C or better) **and** MTH 252/252Z/252H/252HZ (C) |
| ECE 200 | DISCRETE-TIME SIGNAL PROCESSING | 4 | MTH 251/251Z/251H/251HZ (C or better). Class search adds: ECE major (039) and College of Engineering only |
| MTH 254 | VECTOR CALCULUS I | 4 | MTH 252Z/252HZ/252/252H (C- or better) |

Catalog descriptions, summarized:
- **ECE 201:** linear circuit analysis, covering circuit laws and theorems, DC responses, first-order (transient) circuits, and op-amps and their applications. It also covers basic semiconductor devices and fabrication. Equivalent: ECE 201H.
- **ECE 200:** discrete-time signals and LTI systems in the time and frequency domains, DT convolution, complex sinusoids and phasors, and the DT Fourier series and transform.
- **MTH 254:** vectors, vector functions and curves in 2-D and 3-D; surfaces, partial derivatives, gradients and directional derivatives; and multiple integrals in rectangular, polar, cylindrical and spherical coordinates, with applications. Equivalent: MTH 254H.
- **Learning outcomes** are not in the catalog entries. They would need syllabi (open question).

**Is ECE 200 new? Probably yes, first offered Fall 2026.**
- The OSU class search returns 0 ECE 200 sections for Spring 2026, the oldest term it still serves, and 8 sections for Fall 2026.
- The 2024-25 ECE flowchart still used ENGR 201/202/203. The ENGR 201-203 "Electrical Fundamentals" courses (3 cr each) are still in the 2026-27 catalog (https://catalog.oregonstate.edu/courses/engr/), and ENGR 201 still runs in Fall 2026.
- No official announcement or effective date was found.
- Old OSU ENGR 201 material is a reasonable match for ECE 201's circuits content. ECE 200 has no ENGR predecessor at the same level; the old DT/Fourier material sat in ENGR 203 and later courses.

**Curriculum ordering.** The 2026-27 ECE BS sample plan (https://catalog.oregonstate.edu/college-departments/engineering/school-electrical-engineering-computer-science/electrical-computer-engineering-bs-hbs/) has:
- Second Year Fall: **ECE 200 + ECE 201 + MTH 254** together, plus PH 211.
- Second Year Winter: ECE 202, which requires ECE 201 and ECE 200 (ECE 200 may be concurrent).
- Second Year Spring: ECE 203 (requires ECE 200 and MTH 252).

So ECE 200 and ECE 201 are designed as a pair, and the plan places MTH 254 alongside them. Connor taking all three as a freshman in Winter is ahead of the sample plan; check prereqs (see open questions).

**Winter 2027 Schedule of Classes is published.** It was read from the public class search at https://classes.oregonstate.edu/ with no login (term code srcdb 202702). Sections and instructors may change before January.

| Course | Lecture | Labs / recitations | Ecampus |
|---|---|---|---|
| ECE 201 | sec 001, TR 8:30-9:50a, KEC 1001, **Tingwei Zhang**, cap 45 | Labs 010 W 4-5:50p (Dearborn 203), 011 R 12-1:50p, 014 F 12-1:50p (0 cr, cap 15) | sec 400, M. Boeding |
| ECE 200 | sec 001, MW 4-5:20p, Weniger 151, **Jinsub Kim**, cap 108 | Labs 010-015: T 8-9:50a, T 2-3:50p, R 8-9:50a, R 2-3:50p, F 2-3:50p, F 12-1:50p | sec 400, J. Henriquez |
| MTH 254 | 020 MWF 11-11:50a (F. Bouya, Cordley 1316, cap 210); 030 MWF 2-2:50p (W. Shin); 040 MWF 4-4:50p (W. Shin); all with Tue 7-8:20p group midterm slot | Recitations (C1) on Thursdays at various times, "Staff" | sec 400, M. Gilliam; 254H sec 001 WF 2-3:50p, M. Gilliam |

---

## 3. Study-method evidence and the recommended scheduling rule

### What the evidence supports (brief)
- **Retrieval practice ("practice testing") and spacing ("distributed practice") are the two best-supported techniques.** Dunlosky et al. (2013) rate both "high utility" and rate rereading low. Source: APS summary, https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html (the full article at https://journals.sagepub.com/doi/10.1177/1529100612453266 returned 403).
- **Testing beats restudying at a delay.** Roediger & Karpicke (2006, Psychological Science 17(3):249-255): restudy won at a 5-minute test, but testing won at 2 days and 1 week. PDF: https://psychology.ecu.edu/wp-content/pv-uploads/sites/216/2019/03/Roediger-Karpicke-2006.pdf (search summary; PDF not opened).
- **How far apart to space reviews.** In Cepeda et al. (2008, Psychological Science 19(11)), the best gap between study sessions was about 20% of the test delay for delays of a few weeks, falling to about 5% for a one-year delay (https://www.yorku.ca/ncepeda/publications/CVRWP2008.html). For material that must last until Winter finals (about 2-5 months from now), that points to review gaps topping out around 1-4 weeks.
- **Interleaving helps math problem solving.** Rohrer, Dedrick & Stershic (2015, J. Educ. Psych. 107:900-908): mixing earlier problem types into practice beat blocked practice. The proposed mechanism is that students must choose the method, as they must on a test (IES grant page: https://ies.ed.gov/use-work/awards/interleaved-mathematics-practice). Effect sizes were not verified.
- **Algorithms:**
  - SM-2 uses intervals of 1 day, 6 days, then previous interval × an ease factor (minimum 1.3), and a failure restarts the item (https://super-memory.com/english/ol/sm2.htm).
  - FSRS models difficulty, stability and retrievability. It schedules a review for when predicted recall falls to a target retention (70-97%) and claims 20-30% fewer reviews than SM-2 (https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS).
  - Both were built for large flashcard decks. A mistake log of roughly 50-200 worked problems is too small to fit FSRS parameters, and SM-2's ease factor is hard to explain.

### Recommended rule: a 5-box Leitner ladder for the mistake log
Each mistake-log item is one problem Connor got wrong. It stores the problem, the source of a correct answer, a photo of his work, and a cause tag (concept / setup / algebra-sign / units / careless).

1. **Ladder:** Box 1 = 1 day, Box 2 = 3 days, Box 3 = 7 days, Box 4 = 14 days, Box 5 = 28 days. A new mistake enters Box 1, so it is due tomorrow.
2. **A review means re-solving cold.** No notes and no peeking: this is retrieval, not rereading. Use a same-type variant with new numbers when one exists.
3. **Three outcomes:**
   - **Solid** (correct, unaided): move up one box.
   - **Shaky** (correct but needed a hint, or took more than twice the expected time): stay in the same box and reschedule with the same interval.
   - **Miss**: back to Box 1.
4. **Retire** an item after a Solid pass from Box 5, about 7-8 weeks after its last miss. Retired items return once in a pre-exam sweep.
5. **Interleave the daily queue.** Show due items oldest-due first, mixed across the three courses and across topics, never grouped by chapter.
6. **Respect the time budget.** Cap reviews at about 15-20 minutes per study day. Overflow rolls to the next day; overdue items are not punished and advance normally on a Solid.
7. **Pre-exam sweep.** 5-7 days before a target exam (a self-made practice exam in December, or the real Winter midterms and finals), pull every unretired item for that course plus its retired items.

Why this rule:
- It is a direct application of the two high-utility techniques: retrieval, plus expanding spacing whose top gaps (14-28 days) fall in the Cepeda range for a multi-month horizon.
- It needs no parameter fitting, and it can be explained in one sentence: "got it, go up; missed it, start over."
- The tradeoff: intervals are not tuned to each person. That is acceptable at this deck size, and the box intervals are easy to change later.

### Timed practice exams
- Evidence supports practice testing in general. Specific evidence on timing was not checked, so treat the following as a design choice.
- Mirror OSU conditions: 110-minute finals, and for MTH 254 roughly 80-minute evening group midterms.
- Suggested cadence: from early December, one timed set per course per week during the heavy phase.
- Every missed exam problem goes into the mistake log.

---

## 4. Claude API: AI feedback on handwritten work

Sources (docs.claude.com now redirects to platform.claude.com):
- Vision: https://platform.claude.com/docs/en/build-with-claude/vision
- PDF support: https://platform.claude.com/docs/en/build-with-claude/pdf-support
- Models: https://platform.claude.com/docs/en/about-claude/models/overview
- Files API (linked, not opened): https://platform.claude.com/docs/en/build-with-claude/files
- Pricing (linked, not opened): https://platform.claude.com/docs/en/about-claude/pricing and https://claude.com/pricing

Confidence: **high** for the limits.

### Image input
- **Formats:** JPEG, PNG, GIF and WebP. For GIFs only the first frame is used.
- **File size:** 10 MB per image (base64) on the direct API, 5 MB on Bedrock and Google Cloud. The whole request is capped at 32 MB.
- **Image count:** 100 per request for 200k-context models, 600 for others. All current models (claude-opus-5-5, claude-sonnet-5-5, claude-haiku-5-5, claude-fable-5-1) have 1M context and support vision.
- **Dimensions:** at most 8000×8000 px. If a request has **more than 20 images**, every image must be 2000 px or less on each side, or the request is rejected. Images from earlier turns that you resend count toward that 20.
- **Resolution and cost:** cost = ceil(w/28) × ceil(h/28) visual tokens. "Claude 4.7 and later" models are high-resolution: long edge up to 2576 px and up to 4784 visual tokens; anything larger is downscaled. Other models are limited to 1568 px and 1568 tokens.
  - Example: a 2000×1500 photo is about 3,888 tokens. At Opus 5.5's $4/MTok input price that is about $0.016 per photo (arithmetic from the docs' numbers).
- **Documented practice:**
  - Put images before the text prompt.
  - Label multiple images "Image 1:", "Image 2:".
  - Keep text legible and images upright; don't over-compress JPEGs.
  - Use the Files API (`file_id`) so multi-turn chats don't resend base64.
  - The docs warn of mistakes on low-quality, rotated or tiny (<200 px) images and say outputs should be verified.
- **No handwriting- or math-specific guidance** was found in the official docs.

### PDF input
- **Limits:** 32 MB per request and 600 pages (100 if the context window is under 1M). No encrypted or password-protected PDFs.
- **How a PDF is read:** each page becomes an image plus its extracted text, at roughly 1,500-3,000 text tokens per page plus image tokens. A scanned handwritten PDF has no real text layer, so it behaves like a set of page images.
- **Ways to send:** base64, URL or Files API.
- **Documented tips:** place PDFs before text, keep pages upright, split large PDFs, and use prompt caching for repeated analysis.

### App implications (recommendations, not from the docs)
- Resize phone photos so the long edge is 2000 px or less before upload. This keeps you under the many-image rule and close to the high-res limit.
- Send one problem per image, cropped to the page and upright.
- Ask for a transcription first, then feedback, and have the model flag anything illegible rather than guess.
- Show the transcription so Connor can correct it before trusting any grading.

---

## 5. Hosting options (laptop + phone, durable data, export)

Free tiers change; every figure below was checked on 2026-10-19 at the URL given.

| Option | Cost (2026-10-19) | Durability / backups | Phone access | Beginner complexity |
|---|---|---|---|---|
| **A. Run locally + Tailscale** (FastAPI/Flask + SQLite on the laptop) | $0. Tailscale Personal: non-commercial, up to 6 users, unlimited user devices, MagicDNS ([pricing](https://tailscale.com/pricing)) | Data is a file on his own disk. He must copy the SQLite file plus the photos folder to a cloud folder himself and use the app's export | Only while the laptop is on, awake and online. Reach `http://<laptop>:<port>` via MagicDNS, or `tailscale serve` for HTTPS within the tailnet ([Serve docs](https://tailscale.com/kb/1312/serve)) | **Lowest.** No deploy, no cloud database, nothing exposed publicly |
| **B. Fly.io** small VM + volume (SQLite on the volume) | **No free tier** for new orgs; the trial is 2 machine-hours or 7 days. shared-cpu-1x 256MB is $2.19/mo, volumes $0.15/GB-mo, so about $2-3/mo. Managed Postgres from $38/mo ([pricing](https://docs.fly.io/about/pricing)) | Daily volume snapshots with 5-day retention are on by default; first 10 GB of snapshot storage free | Always on, public HTTPS URL, so the app needs its own login | Medium: Dockerfile/`fly launch`, volumes, secrets |
| **C. Render free web service + Neon free Postgres** | $0. Render: spins down after 15 min idle with about a 1-minute cold start, 750 h/mo, **no persistent disk**, free Render Postgres **expires after 30 days** ([Render](https://render.com/docs/free)). Neon Free: 1 GB per project, scales to zero after 5 min, 100 CU-h/mo ([Neon](https://neon.com/pricing)) | Neon Free has a **6-hour** history window and no instant restore. Photos can't go on Render's disk and need separate storage | Public URL; the first load after idle is slow | Medium-high: two services, Postgres instead of SQLite, separate photo storage |
| **D. Cloudflare Workers + D1** | $0. D1 Free: 5M rows read and 100k rows written per day, 5 GB total, 500 MB per database ([pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/)) | D1 Time Travel keeps 7 days on Free | Public URL, global, no cold-start problem | High for a beginner: Python Workers went GA on 2026-09-21 and run on WebAssembly, so packages with native extensions need Wasm builds ([blog](https://blog.cloudflare.com/python-workers-ga/)); photos need R2 |
| (also checked) Supabase Free | $0: 500 MB database, 1 GB files, **pauses after 1 week inactive**, **no backups**; Pro from $25/mo ([pricing](https://supabase.com/pricing)) | Weak on the free tier | Public | Medium |
| (also checked) Railway | Free $0 with $1/mo credit and a 500 MB volume; Hobby $5/mo with $5 of usage included and a 5 GB volume ([pricing](https://railway.com/pricing)) | Backups not stated on the pricing page | Public | Medium |
| (also checked) PythonAnywhere Free | $0: 1 web app, 512 MB disk, 100 CPU-s/day, outbound allowlist (api.anthropic.com is on it, per https://www.pythonanywhere.com/whitelist/). Since Jan 2026, unused web apps expire after 1 month; one click reactivates them and files are kept ([pricing](https://www.pythonanywhere.com/pricing/), [blog](https://blog.pythonanywhere.com/221/)). Paid from $10/mo | No automatic backups mentioned | Public | Low-medium. Very beginner-friendly |

**Verdict: start with A (local + Tailscale).**
- It is free, the simplest to build, and keeps data, including private photos of his work, on his own disk.
- No free cloud tier tested gives durable storage with real backups: Render Postgres expires, Supabase pauses with no backups, and Neon keeps only 6 hours of history.
- Make durability the app's job: a one-click "Export all" (JSON plus the photos folder as a zip), and a nightly copy of the SQLite file into a synced cloud folder.
- If phone access with the laptop asleep becomes a real need, move the same SQLite app to **Fly.io (about $2-3/mo, daily snapshots)**, the closest thing to "durable for pocket change". PythonAnywhere is the easiest cheap alternative.
- Write the app against SQLite with a single data directory so either move is a copy, not a rewrite.

---

## Unverified / open questions
- **Presidents' Day 2027 (Feb 15):** neither OSU calendar lists it. Classes are probably held, but no official OSU page confirms it.
- **ECE 200 and ECE 201 Winter final slots:** they follow the meeting-time grid; not read.
- **ECE 200's introduction date:** inferred as Fall 2026 from class-search data; no announcement or catalog-change record was found.
- **Learning outcomes** for all three courses: not in the catalog; syllabi not found in this pass.
- **Prereq check for Connor:** ECE 201 requires MTH 251 **and MTH 252** (C or better), and MTH 254 requires MTH 252 (C-). ECE 200 is restricted to ECE majors (039) in the College of Engineering. He should confirm he will meet these by January, or plan an override with EECS advising (eecsundergrad.info@oregonstate.edu, from the class search contact field).
- **Study research details not confirmed on fetched pages:** Dunlosky's "moderate" rating for interleaving, Rohrer's interleaving effect sizes, and the Roediger & Karpicke details (search summaries only).
- **Whether Tailscale Serve/Funnel is on the free plan:** not stated on the fetched pages. Plain MagicDNS access works regardless.
- **Railway volume backup policy:** not stated on the pricing page.
- **Claude pricing and Files API pages:** linked from fetched docs pages but not opened.
- **Section times and instructors** in the Winter 2027 Schedule of Classes can change; recheck around Jan 1.

# Local AI in Homebase: plan

**Built 2026-10-19**, with two additions you asked for:
- **Check your final answer** (typed)
- **Snap my work** (opens the phone camera)

Changes from the plan, after the real trial:
- **Hints are checked before they're shown,** because the 9B gave answers away when pushed.
- **A tip that quotes the key is hidden** until you ask to see it.
- **Typed-answer checks run without thinking:** 6–15 s instead of about 80 s, with the same verdicts.

How to use it is in the README, under "Local AI". Mockup: `design/local-ai-mock.html`.

## What's on this laptop (checked 2026-10-19, read only)

- **Ollama 0.40.6**, running as your normal Ollama app at `127.0.0.1:11434`.
- **GPU:** RTX 5070 Ti, 12 GB.

| Model | Size | Can see images | Who uses it now |
|---|---|---|---|
| `qwen3.5:9b` (Q4_K_M) | 6.6 GB | yes, plus thinking | **Lecture Desk** (chat; it unloads right after each answer) |
| `qwen3-embedding:0.6b` | 0.6 GB | no (search embeddings) | **Lecture Desk** |
| `hf.co/HauhauCS/Qwen3.8-27B-…:IQ2_M` | 11 GB | yes | **OpenClaw** (its main model, with a 262k context) |
| `qwen9b-unc` / `Huihui-Qwen3.5-9B-abliterated:Q6_K` (same file) | 8.0 GB | yes | nothing I could find |

The Ollama log also shows a second problem. This morning one load had only 2.1 GB of GPU memory free, because another model was already loaded, so it put just 18 of its 66 layers on the GPU and ran slowly. With 12 GB, two of these models can't both live on the GPU. When a new one loads, Ollama pushes an idle one out. That's the real way apps "take" each other's models, and it's what Homebase must avoid.

## The rules Homebase follows, so other apps keep their models

1. **It only talks to Ollama, never manages it.** Homebase sends ordinary chat requests to the Ollama that's already running. It never starts, stops or restarts Ollama, and never changes its settings, environment variables or models folder. (Lecture Desk already does it this way.)
2. **It never touches the models themselves.** No pull, delete, copy, create or rename, and no custom model built on top of a shared name. It reads the model list and uses models by name, read only. Any settings (context size, temperature, thinking) go on each request, so nothing changes for the other apps.
3. **It waits its turn on the GPU.** Before each job Homebase asks Ollama what's loaded.
   - **Nothing loaded:** it runs now.
   - **Another app's model is loaded:** your request waits in line, and the page says so (mockup panel 2). It never pushes their model out. It checks again every few seconds.
   - **You can still choose "Run anyway"** if you know the other app is idle.
4. **It gives the GPU back quickly.** Homebase keeps the model loaded for 2 minutes while you're chatting, so follow-ups are instant. After a background check it unloads right away.
5. **One job at a time.** Homebase never sends two requests at once, and its queue lives in the Homebase database, so a restart doesn't lose a job.
6. **Small context.** 8k tokens for hints and 16k for feedback (OpenClaw uses 262k). That keeps memory low and leaves room on the GPU.

## Which model does what

- **Default: `qwen3.5:9b`**, the stock model Lecture Desk already uses. One model file is shared by both apps, and they take turns.
- **Not the uncensored 9B by default.** Removing the safety training can make a model less careful, and you don't need it to be uncensored to study circuits. It stays a choice in Settings.
- **Qwen 3.8 27B:** off by default. It's OpenClaw's model and it's squeezed to 2-bit, which costs it some accuracy. Using it would mean competing with OpenClaw for the GPU. It's a choice in Settings, for slow background checks only.
- **Claude** stays the reviewer you can always ask for, and stays the only one for timed exams.

## How it works and looks

**1. "Ask" on problem pages** (mockup panel 1; on a phone it's a bottom sheet, panel 4)
- Three preset keys (**Give me a hint**, **Check my final answer**, **Explain the solution step**) and a text box.
- It sees the problem crop. Hints also see the key, so they point the right way, but they're told never to state the answer.
- For generated problems Homebase knows the exact answer, so it blocks any reply that contains it.
- **Explain the solution step** only works after you've pressed Reveal.
- Replies stream in word by word, with thinking off, so they start in a couple of seconds.
- The chat is saved with the problem, so you can scroll back.

**2. Quick local check on submissions**
- When you upload a photo, Homebase queues a local check by default.
- Qwen transcribes what it reads, compares it with the official key and gives a verdict (correct / partly / incorrect / unclear) plus short comments. It uses thinking mode, since accuracy matters more than speed here.
- It reuses the review packet Homebase already builds for Claude (same rules, same "you are not the answer key" prompt) and the same structured answer format.
- The feedback card gets a **Qwen · local** label (Claude's stays plum), plus the note "Local model. It can misread handwriting; the key is the authority."
- Under it there are three keys: **Agree, log as …**, **It misread me** and **Ask Claude to review too**.
- **Timed exams:** no local grading. Qwen can transcribe your pages to make my review faster, but points come from Claude and you.

**3. Settings → Local AI** (mockup panel 3)
- Status: is Ollama running, and does the chosen model see images.
- A model picker that lists only the vision models Ollama already has.
- Two switches: "quick local check on every submission" and "wait for other apps" (on by default).
- A **Run a test question** key.
- If Ollama isn't running, Homebase says so and carries on without the AI. Nothing else breaks.

**4. Labels everywhere.** Every AI message shows which model wrote it ("Qwen · local" or "Claude"). The progress page and the MCP tools see local feedback as its own reviewer, `local:qwen3.5:9b`, so I can tell when I review your queue.

## Accuracy check before we trust it

You have no submissions yet. When you have 10–15, including a few with deliberate mistakes:
1. Run `scripts/eval_local.py`, which compares Qwen's verdict on each one with the key and with my review.
2. If it agrees at least about 85% of the time and never calls clearly wrong work correct, local verdicts can count toward your problem results.
3. Until then, local checks only add comments and never mark anything solid.

## Build steps (about 3–4 commits)

1. `app/local_ai.py`:
   - an Ollama client written with the Python standard library (no new package)
   - a "what's loaded" check
   - the job queue, a worker thread and the politeness rules
   - Tests run against a fake Ollama, so they never touch your real one or load a model.
2. Settings card and the quick local check on submissions.
3. The Ask panel on problem pages (desktop card, phone sheet), streaming and the answer-leak block.
4. The eval script and a README section.

## Questions (defaults in bold)

- Quick local check on every submission: **on**, or only when you press a key?
- Hints may see the key (better hints, told not to reveal it): **yes**, or problem only?
- Also add Ask to the video page (lecture title, chapters and your notes): **later**, or now?

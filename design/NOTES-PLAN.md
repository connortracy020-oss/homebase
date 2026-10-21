# Notes: plan (draft for your OK)

A **Notes** part of Homebase: one organized notebook per course. You can edit it, and Claude can add to it, for example when you hand Claude a screenshot of a YouTube lecture. Every piece goes to a predictable place, so formulas, definitions and examples never end up in a pile.

## 1. How a notebook is organized

Each course gets one notebook. The skeleton is built automatically from the course's 10 term weeks, so it matches the rest of Homebase:

```
ECE 201 notebook
├── Inbox                         ← things not sorted yet
├── 1 · Circuit basics: charge, V, I, power
│   ├── Key ideas                 (concepts, in your words)
│   ├── Definitions
│   ├── Formulas & equations
│   ├── Worked examples
│   └── Pitfalls & tips           (sign conventions, common mistakes)
├── 2 · Ohm's law, dependent sources, KCL
│   └── … same five parts
├── …
├── 10 · Inductors, RC/RL transients
└── Formula sheet                 ← built automatically, see below
```

- **Units** are the 10 term-week topics (ECE 201: "Circuit basics…", "Ohm's law, dependent sources, KCL", …). You can rename them, split them or add your own (for example "1b · Power examples").
- **Every unit has the same five parts.** That's what tells Claude where things go. A part can stay empty, and empty parts are hidden until you use them.
- **The formula sheet** is not a separate page you have to maintain. It collects every *Formulas & equations* block from all the units, in order, and you can star the ones you want on your exam sheet. A **print view** fits the starred ones on one page. ECE 201 practice exams allow "one page of your own handwritten formulas", so this is the draft you copy by hand.
- **The Inbox** holds anything that doesn't clearly belong somewhere, with a suggested home. One tap moves it.

## 2. What a note is made of

A note is a list of **blocks**. Each block has a kind, which matters for the formula sheet and for search:

| Kind | Looks like | Example |
|---|---|---|
| Text | paragraph, Markdown | "Power is absorbed when current enters the + terminal." |
| Formula | a highlighted card: equation, name, the variables, when to use it | \(p = vi\) (passive sign convention) |
| Definition | term in bold + meaning | **Node**: a point where 2+ elements meet |
| Example | problem → steps → answer, collapsible | Find the power absorbed by each element… |
| Tip | ochre side stripe | "Draw the current arrow *before* writing KVL." |
| Image | a screenshot or photo, with a caption | the slide from Lecture 3 at 14:05 |

Every block keeps:
- **Where it came from:** a link back to the video *at the timestamp* ("MIT 6.002 L3 · 14:05"), a reading and page, or a problem.
- **Who wrote it:** you, or Claude (a plum "by Claude" chip, like elsewhere in Homebase).
- **History:** every edit is saved, so you can see or undo what Claude added.

Math is written in LaTeX and shown with KaTeX, the same as the rest of the app.

## 3. The Notes pages (how it looks)

- **Nav:** a **Notes** tab on the laptop. On the phone it replaces nothing; it goes in the bottom bar's **More** sheet, or I can swap it for **Exams** if you'd use it more.
- **Laptop layout:** two columns.
  - **Left:** the notebook outline (units → parts), with counts and a search box. Course switcher at the top.
  - **Right:** the open unit, all five parts on one page, so you can read a unit straight through.
- **Editing:** click any block to edit it in place. The text is Markdown with a live math preview underneath. Add a block with a small **+** between blocks (pick the kind). Drag to reorder or move a block to another part. Changes save as you type.
- **Phone:** the outline becomes a drop-down at the top. Reading and quick edits work, but long editing is meant for the laptop.
- **Formula sheet view:** cards grouped by unit, each with ★ for "on my exam sheet", and a **Print** key.
- **Elsewhere in Homebase:**
  - The video page's timestamped notes get **Send to notebook**.
  - The week hub shows "3 notes in this unit" with a link.
  - Search covers notes too.

## 4. How Claude adds to it (the screenshot flow)

You, in Claude Code or Claude Desktop: *"Add this to my ECE 201 notes"* plus a screenshot of a YouTube frame, a slide or a page.

1. **Claude reads the screenshot.** It writes the content in its own words and equations, not a copy of the slide's text. If you give the video, the note links back to it at that time.
2. **Claude decides where it goes, using fixed rules:**
   - Course: whatever you said, else the video's course, else ask you.
   - Unit: the topic that matches (it gets the outline with each unit's topics); a video's unit is its term week.
   - Part: by kind. An equation → *Formulas & equations* (and starred if it's clearly a core formula). A term with its meaning → *Definitions*. A solved problem → *Worked examples*. A warning or trick → *Pitfalls & tips*. Explanation → *Key ideas*.
   - **No duplicates:** before adding a formula, Claude searches the notebook. If the formula is already there, it adds the new detail or a second source to the existing card instead.
   - **Not sure → Inbox,** with "suggested: Unit 4 · Formulas" so you decide.
3. **It saves through new Homebase MCP tools,** so it shows up instantly in the app labelled "by Claude":

   | Tool | What it does |
   |---|---|
   | `notes_outline(course)` | units, parts, block counts, and unit topics, so Claude knows where things go |
   | `notes_search(query, course?)` | finds existing blocks (formulas by name or LaTeX) |
   | `notes_add(course, unit, part, kind, body, source?, image_path?)` | adds a block; `image_path` copies a screenshot into Homebase |
   | `notes_update(block_id, body)` / `notes_move(block_id, unit, part)` | edits and moves a block |
   | `notes_add_unit(course, title, after?)` | a new unit when nothing fits |

4. **Claude replies with what it added and where.** For example: "Added 2 formulas to *Unit 2 · Formulas* (one merged with your KCL card), 1 tip to *Pitfalls*." Everything can be undone in the app.

**Screenshots** are stored in `data/notes/` (git-ignored, personal study only, never committed), the same rule as library PDFs.

## 5. Optional: screenshots straight into Homebase, with the local AI

The same flow from inside the app:
1. **Paste or drop** a screenshot onto a notebook, or use **Snap** on the phone.
2. **Qwen drafts the blocks and a suggested place.**
3. **You approve with one tap.**

Nothing is added until you approve, since a 9B model makes more mistakes than Claude. This reuses the local-AI queue that already exists, including waiting while other apps use the GPU.

## 6. Build steps (about 4–5 commits)

1. **Data + seeding:**
   - tables: `Notebook`, `NoteUnit`, `NoteBlock`, `NoteRevision`, `NoteAsset`
   - notebooks seeded from each course's term weeks
   - existing video notes left where they are
   - export includes notes
2. **Notes pages:** the outline, the unit page, in-place block editing with a math preview, add/move/reorder, the Inbox, search. Light, dark and phone layouts.
3. **Formula sheet:** the collected view, stars, and a one-page print layout.
4. **Claude tools:** the five MCP tools, the placement rules written into the MCP server's instructions, and tests (placement, no duplicates, undo).
5. **Hooks into the rest of Homebase:**
   - "Send to notebook" on video notes
   - note counts on the week hub
   - in-app paste with the Qwen draft (the step 5 above)

Tests for each step. The current suite must keep passing. Screenshots after step 2, so you can steer before the rest.

## 7. Questions (defaults in bold)

- Organize units by **term-week topic** (matches the rest of Homebase), or by textbook chapter?
- When Claude adds something: **straight into the notebook, labelled "by Claude", with undo**, or into the Inbox for your approval every time?
- Notes on the phone: in **More**, or a bottom-bar tab instead of Exams?
- The in-app Qwen paste flow (section 5): **build it in step 5**, or skip it?

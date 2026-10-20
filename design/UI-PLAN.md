# Homebase UI redesign plan (draft for your OK)

Live mockup: `design/style-tile.html`. Open it and toggle dark mode with the moon button; every key and checkbox presses in.

## What's wrong today (from screenshots of the current app)

- **It's flat and grey.** Everything is a thin-bordered cream box, and the buttons look like plain text links. Nothing invites a click.
- **The nav is 10 small text links in a row.** On a phone it wraps into two cluttered lines. There's no clear "home".
- **Today is a long checklist with tiny grey metadata.** Nothing says "do this next", and the timer is a small strip.
- **Hierarchy is weak.** The page title, card titles and body text are close in size and weight.
- **Progress is a dense table.** It doesn't read at a glance and doesn't feel rewarding.
- **There's no dark mode,** no icons, and no sense of motion or feedback when you do something.

## The direction: "warm tactile"

Same cream-and-charcoal vibe, but with physical depth: surfaces that sit on the page and keys that press.

**Palette.** Still cream and charcoal, plus toned-down accents.

| Role | Light | Dark | Used for |
|---|---|---|---|
| Background / card / ink | cream `#f2ece0` / `#fbf8f1` / charcoal `#26251f` | charcoal `#1a1916` / `#23221e` / cream `#efe7d6` | everything |
| ECE 201 | terracotta `#b06a4a` | `#c98466` | course color |
| MTH 254 | olive `#7a8456` | `#9aa36f` | course color |
| ECE 200 | slate `#5b7790` | `#7f9bb4` | course color |
| Solid / shaky / missed | moss / ochre / brick | lightened | ratings, results |
| Claude | plum `#8a6a86` | `#a888a4` | "done by Claude" |

**3D keycap buttons, kept quiet.** Each button has a thin lit top edge (the reflection), a 2 px darker "side" under it, and a soft drop shadow:
- **Hover** brightens it slightly. No jumping.
- **Press** sinks it 2 px and the side disappears, so it feels clicked without being loud.
- Sizes stay compact: 13 px text, about 32 px tall. On touch screens they grow to 36 px so they're easy to tap, with the same look.

There are five types:
- **Primary:** charcoal in light mode, cream in dark mode.
- **Secondary:** cream.
- **Course-colored:** "Start" on an ECE 201 task is terracotta.
- **Rating keys:** Solid, Shaky and Missed, in moss, ochre and brick.
- **Round keys:** play, timer and theme toggle.

Checkboxes are little keys too: they press down and turn moss green when done.

**Type.** Fraunces, a soft serif, for headings, and Inter for text. Both come from Google Fonts with a system-font fallback. The scale stays modest: body 14.5 px, page titles 22 px (19 px on a phone), small caps labels for sections. Hierarchy comes from weight and the serif, not from size.

**Calm by default.** Course colors appear as a thin stripe, a dot or a tinted chip, never as big blocks. Shadows are soft and close. Motion is short (under 0.15 s) and only on things you touch.

**Dark mode.** It follows your phone or laptop setting automatically. There's also a toggle in the top bar that remembers your choice. Every color is a token, so both themes stay consistent, and PDF crops and circuit drawings get a gentle frame in dark mode so white pages don't glare.

## Page by page

1. **Shell and navigation**
   - **Desktop:** a floating top bar with the logo and a segmented "tab key" nav (Today · Plan · Courses · Review · Exams · Progress), with counts as small badges. Feedback and Settings move into a menu.
   - **Phone:** a bottom tab bar with icons (Today, Courses, Review, Exams, More), like a real app, and a big tap area. This fixes the wrapping nav.
2. **Today: the screen you open every day**
   - A compact header with the date, prep week and this week's focus.
   - The next unfinished task gets a course-colored **Start** key; the rest get quiet cream keys.
   - A focus timer with a small progress ring for the week's planned minutes, and Start, Stop & log keys.
   - Small cards for reviews due and feedback waiting.
   - The checklist grouped by course, with key-style checkboxes.
3. **Courses and week hub**
   - Three course tiles with a thin colored left stripe and a slim progress bar.
   - On the week page:
     - **Watch:** video cards with YouTube thumbnails and a progress line.
     - **Read:** reading cards.
     - **Solve:** problem-set cards with a ring showing tried vs solid.
     - **Lab:** lab cards.
     - A sticky week switcher (← Week 3 · Week 4 · Week 5 →).
4. **Video page**
   - The player in a framed card.
   - Chapters as tappable chips with the current one highlighted.
   - A notes panel with an "add note at 12:34" key.
   - On a phone the video goes full width and the notes stack underneath.
5. **Problem page**
   - The problem on a "paper" card. PDF crops scale to the screen width on a phone.
   - A key badge.
   - Answer inputs with clear ✓ / ✗ feedback.
   - Solid / Shaky / Missed as three colored keys in a row.
   - The solution behind a "Reveal" key.
6. **Review**
   - A focused "flashcard" layout: one problem at a time, a count like "2 of 3 left", and the ladder (box 1 → 5) drawn as five little steps so you can see it climb.
7. **Exams**
   - **Exam mode:** a distraction-free view with a countdown pill that turns ochre in the last 5 minutes and brick at 0.
   - **Results:** a score ring and per-problem bars.
8. **Progress**
   - Replace the table with three course cards: hours ring, tasks bar and latest exam score.
   - A weekly bar chart, planned vs logged, in course colors, drawn in plain SVG with no chart library.
   - A small streak counter ("5 study days in a row").
9. **Small delights, all subtle**
   - A pressed-key click feel.
   - A soft checkmark pop when you finish a task.
   - Toast messages ("Logged 25 min of ECE 201").
   - Skeleton shimmer while PDF crops load.
   - "Reduce motion" respected.

## How I'll build it (no new framework)

- **One stylesheet with design tokens** (`--bg`, `--surface`, `--key`…) for light and dark. Shared components: `.btn` keys, `.card`, `.chip`, `.ring`, `.bar`, `.tabs`, `.tile`.
- **Templates updated page by page** to use them. The app logic doesn't change, so everything you've done (ticks, notes, minutes) stays.
- **A tiny inline SVG icon set**, drawn in the same line style, with no external icon font.
- **Phone first:** every page is checked at iPhone width. Nothing scrolls sideways, the bottom tab bar never covers content, and every tap target is at least 36 px.
- **Testing:** check every page in light and dark, at laptop and phone width, with screenshots. Contrast meets WCAG AA. The existing test suite must still pass.
- **Order:** shell, nav and dark mode, then Today, then the week hub and problem pages, then video and review, then exams, then progress and polish. I'll show you screenshots after the shell and Today step so you can steer before I do the rest.
- **About 3–5 commits.** Nothing about your data changes.

## Open choices (defaults in bold)

- **Heading font:** **Fraunces (soft serif)**, or keep a plain system font.
- **Phone nav:** **bottom tab bar**, or a top bar with a menu.
- **Default theme:** **follow the device setting**, or always start light.

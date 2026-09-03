# QuizArena

A real-time live quizzing platform (Kahoot/Quizizz style) built for a whole classroom on one PIN.

**Verified under load:** 200 concurrent students in a single room, 1,200 questions and 1,200 answers
delivered at **p50 1ms / p95 3ms**. A 150-student emoji tap-storm (6,964 taps) compressed to **6
frames** on the host. 22 engine self-tests pass. See [Testing](#testing).

---

## Project structure

```
quiz/
├── server/                          Node + Express + Socket.IO (authoritative game server)
│   ├── src/
│   │   ├── index.js                 HTTP + Socket.IO bootstrap, Redis adapter, shutdown
│   │   ├── config.js                Env-driven config
│   │   ├── routes/api.js            health, room lookup, import, generate, exports
│   │   ├── sockets/index.js         All socket handlers (host, student, integrity, reactions)
│   │   ├── state/roomStore.js       In-memory room registry + GC
│   │   ├── game/
│   │   │   ├── room.js              Room state machine: players, answers, scoring, analytics
│   │   │   ├── flow.js              Phase transitions, throttled host sync, reaction batching
│   │   │   ├── scoring.js           Points model + streak multiplier + ranking
│   │   │   ├── answerMatch.js       Short-answer normalisation, matching, grouping
│   │   │   ├── quizSchema.js        Input validation (types, image URLs, accepted answers)
│   │   │   ├── importQuiz.js        Spreadsheet (.xlsx/.csv) -> quiz
│   │   │   ├── generateQuiz.js      Topic -> quiz (Claude, with an offline scaffold fallback)
│   │   │   ├── exportCsv.js         Deep gradebook CSV builder
│   │   │   └── sampleQuiz.js        Demo content (all three question types)
│   │   └── utils/                   rng (seeded shuffle), pin, rateLimit (+ sanitisers)
│   └── scripts/
│       ├── selftest.js              Engine checks (scoring, matching, skip, exports, regressions)
│       └── loadtest.js              N-student end-to-end harness
│
└── client/                          Next.js 15 (App Router) + React 19 + Tailwind
    ├── app/
    │   ├── layout.tsx               Wraps everything in <SocketProvider>
    │   ├── host/page.tsx            Teacher orchestrator (create → lobby → live → analytics)
    │   └── join/page.tsx            Student orchestrator (join → wait → play → result)
    ├── components/
    │   ├── host/                    QuizCreator (workspace shell), QuestionList,
    │   │                            QuestionEditor, SettingsPanel, StartFromModal,
    │   │                            HostLobby, HostLive, HostAnalytics, ReactionOverlay
    │   ├── student/                 JoinScreen, WaitingRoom, StudentQuiz
    │   └── ui/                      AnswerGrid, ShortAnswer, Countdown, Leaderboard,
    │                                StreakMeter, EmojiBar, QuestionMedia,
    │                                SlideOver/Modal, Toggle/Segmented
    └── lib/
        ├── socket.tsx               Socket context + clock sync + useSocketEvent
        ├── serverUrl.ts             Resolves the API origin (env, or same-origin)
        ├── useCountdown.ts          Server-clock countdown
        ├── useProctoring.ts         Full-screen + Page Visibility monitoring
        └── types.ts                 Shared wire types

Deployment:
  Dockerfile (server/ and client/), docker-compose.yml, Caddyfile, render.yaml
  scripts/preview-prod.mjs           Single-origin production preview, no Docker needed
  DEPLOY.md                          Four deployment options, start to finish
```

## Running it

Two terminals.

```bash
cd server && npm install && cp .env.example .env && npm run dev
```

```bash
cd client && npm install && cp .env.local.example .env.local && npm run dev
```

Then open <http://localhost:3000/host> to build a quiz (**Load sample quiz** fills in one of each
question type), and <http://localhost:3000/join> on student devices.

### Running it somewhere other than your laptop

**[DEPLOY.md](DEPLOY.md)** covers four options in full. The short version:

| I want to… | Do this |
|---|---|
| Show someone in five minutes | `npm run preview:prod`, then `npx cloudflared tunnel --url http://localhost:8080` |
| Publish it for free | Client → **Netlify** (`netlify.toml` included), server → **Render** free web service (`render.yaml` included) |
| Run it for a school | A $5 VPS: `SITE_ADDRESS=quiz.yourschool.org docker compose up -d --build` |

The one hard constraint: **the server cannot run on serverless/edge** — Netlify Functions,
Vercel Functions, Cloudflare Workers. Rooms live in process memory and a quiz holds a
WebSocket open for twenty minutes, so it needs a real always-on process. The Next.js
client can go anywhere, which is why the free route is Netlify for the client and a free
always-on host for the server.

`npm run preview:prod` puts a production build of both halves behind **one origin** on
:8080, which is the same shape as the Docker deployment — use it to check a build before
you ship it.

## Testing

```bash
cd server && npm run selftest          # 22 engine checks, no server needed
cd server && npm run dev               # then, in another terminal:
cd server && PLAYERS=200 npm run loadtest
```

`selftest` covers scoring and the streak multiplier, short-answer matching, skip semantics, the
image-URL validator, CSV formula-injection escaping, the gradebook matrix, and three regression tests
for the bugs described below. `loadtest` plays a full quiz with N sockets and reports answer-ack
latency percentiles.

---

## Question types

| Type | Student sees | Graded by |
|---|---|---|
| `multiple` | 2–6 colour/shape tiles, order scrambled per student | option id |
| `truefalse` | Two tiles, never scrambled | option id |
| `short` | A text input | string match against a list of accepted answers |

**Short-answer matching** normalises Unicode (NFKC), collapses runs of whitespace, and lowercases
unless the question is marked case-sensitive. `"  tOkYo "` matches `Tokyo`. A question can accept
several spellings (`Tokyo | Tokio | Tōkyō`) because a student should not lose a mark to a macron
they cannot type on a school keyboard.

**Images** can be attached to a question and to each individual answer option, either **uploaded
from the device** or pasted as a URL.

Uploads need no database and no object store. The browser re-encodes the picture to ~1600px WebP
before it leaves the device — measured: a 3.7 MB photo became **117 KB**, a 32x reduction — and the
server keeps the bytes in a content-addressed in-memory store, serving them from
`/api/images/<hash>` with `immutable` caching. Because the id is a hash of the content, uploading
the same picture twice costs nothing and every student fetches it exactly once.

Doing the resize client-side is not an optimisation, it is the feature: the payload sent to students
carries a *URL*, not the bytes. Inlining a 40 KB image as base64 would multiply by 300 students into
a 12 MB burst per question and take the room down.

> **The honest limitation:** uploaded images live in RAM. They are lost on every server restart, and
> expire after 12 hours. On a free tier that sleeps when idle, an image uploaded before a coffee
> break may be gone when you come back — build the quiz and run it in one sitting, or use a
> non-sleeping instance. For permanent artwork, paste URLs, or wire the store to Cloudflare R2 /
> Supabase Storage (both have free tiers).

URLs are validated server-side and only absolute `http(s)` is allowed. **SVG is rejected outright**,
for uploads and URLs alike: it is a document format that can carry scripts, and serving one from our
own origin would hand an uploader a stored-XSS primitive. Upload types are detected from the file's
**magic bytes**, never from its name or its declared Content-Type — a text file renamed `.png` is
refused. A broken image link never eats the question; it just disappears.

## Scoring

```
correct  ->  base × (0.5 + 0.5 × timeRemainingRatio) × streakMultiplier
wrong / skipped / no answer  ->  0, and the streak resets
```

The streak multiplier steps **1× → 1.25× → 1.5× → 1.75× → 2×** and caps there. The student sees a
four-pip meter showing what their next correct answer is worth and what they stand to lose, and the
reveal shows the arithmetic (`400 base + 360 speed × 1.25 streak`) so the number never feels
arbitrary.

**Skip** ends a student's turn early: it scores nothing and breaks the streak, but it *counts as
answered*, so the room can move on instead of watching a dead timer in front of the class. Hosts can
turn it off per quiz.

---

## How the real-time layer works

The design goal was "one broadcast per state change", not "one broadcast per tick".

**The server owns the clock.** When a question opens, the server stamps `startAt` and `endAt` in
server time and sends them once. Every client renders its own countdown from those timestamps. A
30-second question with 100 players costs **1 broadcast, not 3,000**. It also means a student who
changes their device clock gains nothing.

**Clients measure their clock offset.** On connect, `lib/socket.tsx` fires a short burst of
`sync:time` round trips, keeps the sample with the lowest RTT, and stores
`offset = serverTime - clientMidpoint`. Countdowns run off `Date.now() + offset`.

**Host traffic is throttled and separated.** Players and the host sit in different Socket.IO rooms,
so host-only frames — live answer counts, correct answers, integrity alerts — are never serialised
out to 100 student sockets. Host aggregates are coalesced on a 250 ms leading-edge throttle.

**Reactions are batched harder still.** Emoji are buffered for 400 ms and sent as counts, so the
host renders `n` floaters from one small message. Measured: 6,964 taps from 150 students became 6
host frames.

**Answers are cheap.** `submitAnswer` is a Map insert plus a bounds check. Scoring happens once, at
question close, in a single pass. `perMessageDeflate` is off — answer payloads are tiny and
compression would add latency to the one message that has to be fast.

**Reconnects are first-class.** Players hold a `playerId` + `token` in `localStorage`; hosts hold a
`pin` + `hostToken` in `sessionStorage`. Both re-claim their seat on every reconnect. The token is
what stops someone reclaiming a classmate's score by typing their nickname.

**Nothing is unrecoverable.** `player:sync` returns the authoritative snapshot for the current
phase. The client calls it on reconnect, whenever the tab returns to the foreground, and on a slow
safety poll if 20 seconds pass with no server traffic. A missed broadcast is a hiccup, not a dead
end.

### Scaling beyond one process

Rooms live in process memory, which is what makes answer handling sub-millisecond. To run multiple
nodes: set `REDIS_URL` (the Redis adapter attaches automatically) and put **sticky sessions on the
PIN** at the load balancer. Persist `buildAnalytics()` output if you want history — do not put the
hot loop behind a database.

## Interface

The host side is built around **progressive disclosure**. An earlier version rendered every question
as a fully expanded card with the room settings permanently above them: 127 form controls over 6.6
screens of scroll for a six-question quiz. It now runs as a workspace — a rail listing every
question on the left, one editor on the right, and settings behind a slide-over. Same 1.2 screens,
same features, nothing removed.

- **Question rail** — each question is one row (number, type, time, points, a dot if it still needs
  work), so the whole quiz is legible at a glance and reorderable without hunting.
- **Settings slide-over** — the nine toggles are grouped into *Scoring*, *How the room runs* and
  *Integrity* rather than competing for attention on the main page.
- **Import / Generate** — one button opening a modal with a drag-and-drop target.
- **One panel at a time** — the live sidebar is a segmented Scores/Activity control instead of two
  stacked half-visible cards.
- **Type** — Outfit for display, Inter for body, both self-hosted via `next/font` so a school
  network never blocks a webfont request. Numeric UI (timers, scores, PINs) is tabular so digits
  do not jitter.
- **Colour** — one violet accent for everything interactive, near-black surfaces with soft
  elevation rather than visible borders. The Kahoot-style answer tiles stay deliberately vivid:
  they are the one thing a whole room looks at from a distance.
- **The result reveal** — the whole card floods green (or red) and a ring draws itself, then
  a tick lands a beat later. A drawn stroke reads as the app *responding* to what the student
  did, and colour-as-background means the verdict is legible from across a room before you
  have read a word of it. It also beats an emoji glyph, whose rendering varies by platform.

## Fixed in this round

**Students could silently drop out of the game forever.** Every per-player emit in `flow.js` was
gated on `player.connected`. The server only learns about a disconnect after a ping timeout, so a
backgrounded phone whose browser was perfectly alive could be marked disconnected and then *skipped
by `startQuestion`* — no question, no reveal, permanently, with no error shown. The gate is gone
(emitting to a dead socket id is a harmless no-op), and `player:sync` plus the visibility-change
resync above close the window from the client side. Regression test:
`selftest.js` → "a player the server thinks is disconnected still receives the question".

**The student view could render blank.** `phase === 'reveal'` with no per-player result — a late
joiner, or a reconnect mid-reveal — rendered nothing at all, which reads as a frozen app. Every
phase now has a fallback, and the server snapshot carries the reveal payload. Regression test:
"a snapshot during reveal carries the answer, so no phase renders blank".

**The host showed the wrong question during the lead-in.** For the three seconds before each
question, the dashboard kept displaying the *previous* question's text, options and answer count.
It now shows only what is true: "Coming up — Question 3 of 6", with the counter zeroed.

**Advancing during the lead-in scored a question nobody had seen.** Pressing the primary button in
the three-second countdown called `endQuestion`, recording every player as "no answer" and breaking
their streaks over a question that was never on screen. During the lead-in the button now reads
"Start now" and opens the question immediately, restarting the clock so nobody loses the skipped
seconds. Regression test: "advancing during the lead-in opens the question instead of scoring it".

---

## Getting a quiz in without typing it

**Spreadsheet import** — `POST /api/import` (multipart, `.xlsx` / `.xls` / `.csv`, 2 MB cap,
parsed in memory so nothing touches disk). Columns are matched case- and punctuation-insensitively,
so `Question Text`, `question_text` and `QUESTIONTEXT` are the same column:

| Column | Notes |
|---|---|
| Question Text | required |
| Question Type | `multiple` / `truefalse` / `short` — inferred from the row shape if absent |
| Option 1–5 | multiple choice |
| Correct Answer | a letter (`A`–`E`), an index (`1`–`5`), `TRUE`/`FALSE`, or the answer text itself. For short answers, alternatives separated by `\|` |
| Time Limit | seconds, default 20 |
| Points | default 1000 |
| Image Link | absolute http(s) URL |
| Option 1 Image… | optional per-option images |

Unusable rows are skipped with a per-row reason rather than failing the whole file, and the result
is run through the same validator the live editor uses. `GET /api/import/template.csv` returns a
filled-in template.

**Topic generation** — `POST /api/generate` with `{ topic, count, difficulty, gradeLevel }`. With
`ANTHROPIC_API_KEY` set it calls Claude (`claude-opus-5`) with a JSON schema constraining the output
shape, so the result is guaranteed to parse. Without a key it returns a **deterministic scaffold**:
real, editable question rows with the topic filled in and the answers left obviously blank.

> The scaffold never invents plausible-looking answers, and that is deliberate. A teacher
> skim-reading generated content has no way to tell a real fact from a fabricated one, so the
> offline path produces obvious placeholders instead of confident-sounding guesses. Generated
> content lands in the editor as a draft with a review warning — never straight into a live room.

## Exports

| Endpoint | Contents |
|---|---|
| Summary CSV (client-side) | One row per student: score, correct, skipped, accuracy, avg time, streak, integrity counts |
| `GET /api/rooms/:pin/export.csv` | **Deep gradebook** — see below |
| `GET /api/rooms/:pin/export.json` | The same data as JSON, for wiring into a gradebook |

The deep export is a **student × question matrix**: one row per student, four columns per question
(result, points, time, what they actually typed or picked), followed by a per-question summary
block, an answer-level breakdown, and the integrity log. A teacher can read a row across to see one
child's pattern or a column down to see where the class fell over. The same matrix is browsable in
the **Matrix** tab of the analytics screen, with a sticky name column.

Both server exports require the host token (`?hostToken=…` or an `x-host-token` header) — a whole
class's results are not something a student who knows the PIN should be able to download. Every
cell is escaped and formula-injection-neutralised: a nickname of `=cmd|'/c calc'!A0` is a live
formula when a teacher opens the file in Excel.

## Socket event reference

| Direction | Event | Purpose |
|---|---|---|
| C→S | `sync:time` | Clock offset sampling |
| C→S | `host:create` / `host:rejoin` | Open a room / re-claim it after a drop |
| C→S | `host:start` / `host:next` / `host:skipTimer` / `host:end` | Drive the session |
| C→S | `host:kick` / `host:clearStrikes` | Moderation |
| C→S | `player:join` | Join or rejoin (playerId + token) |
| C→S | `player:sync` | Authoritative state resync — the recovery path |
| C→S | `player:answer` | `{ optionId }`, `{ text }`, or `{ skipped: true }` |
| C→S | `player:reaction` | Emoji from the allowlist |
| C→S | `player:integrity` | Tab switch / full-screen exit |
| S→C | `game:leadIn` → `game:question` → `game:reveal` → `game:leaderboard` → `game:over` | Phase flow |
| S→C | `host:sync` | Throttled roster + live answer counts (host only) |
| S→C | `reaction:burst` | Batched emoji counts (host only) |
| S→C | `integrity:alert` | Live integrity feed (host only) |
| S→C | `player:kicked` / `player:strikesCleared` / `host:disconnected` / `host:reconnected` | Notices |

`host:next` is context-aware: it closes a live question, then shows the leaderboard, then advances —
so the whole session is drivable from one button.

---

## What 300 players actually costs

Measured on one Node process, a full 6-question quiz with **300 concurrent students**
(`PLAYERS=300 npm run loadtest`):

| | |
|---|---|
| Server CPU | **2.2 seconds total — 5.2% of one core** for the whole quiz |
| Memory | 93 MB RSS |
| Answer latency | p50 1ms, p95 1ms, max 6ms |
| Upload from server | 5.2 MB total, **0.97 Mbps average** |
| Biggest burst | **756 KB**, when a question opens and every student is sent their own scrambled copy |

The design is why the numbers are small: the server sends one frame per state change
rather than per tick, and clients run their own countdown against a synced clock.

**What this means for hosting:**

- A **$7/mo Render Starter (0.5 CPU)** has roughly 10x the headroom needed. This is the
  right answer for 300 people.
- **Render free (0.1 CPU)** is ~52% used on average, which sounds fine but leaves nothing
  for the spikes when a question opens, and Render's terms allow them to suspend a free
  service generating "uncommonly high volume of traffic". Fine for 30 students, a gamble
  at 300.
- **A laptop** is far more capable than either — 5.2% of one core is under 1% of a modern
  laptop. See below.

## Hosting it from a laptop

Viable, and CPU is not the constraint — upload bandwidth and reliability are.

```bash
cd server && npm start
cd client && npm run build && npm start
node scripts/preview-prod.mjs                      # one origin on :8080
npx cloudflared tunnel --url http://localhost:8080 # public HTTPS URL
```

**Bandwidth needed for 300 players:** about **1 Mbps sustained upload**, with **756 KB
bursts** each time a question opens. On a 10 Mbps upload that burst clears in ~0.6s; on a
2 Mbps ADSL uplink it takes ~3s, and students on the slow end lose a slice of their
answering time, because the deadline is fixed in server time. Check your *upload* speed,
not download — they are very different numbers on most home connections.

**Latency across a country is not the problem it sounds like.** The countdown is computed
locally from a synced server clock, so a student 2,000 km away sees the same timer as one
in the next room. Distance only shifts when their answer arrives, and a 50ms difference on
a 20-second question is 0.25% of the speed component — well inside the noise of human
reaction time.

**What will actually bite you:**

- The laptop sleeping, or Wi-Fi dropping, ends every room instantly.
- Cloudflare *quick* tunnels are throttled and get a new URL each run. For 300 people use
  a named tunnel on your own domain (still free) rather than the throwaway one.
- Use ethernet and mains power, and disable sleep.
- The same laptop is usually also driving the projector, so give it the headroom.

Good for a one-off event you control. For anything recurring, $7/mo of hosting removes an
entire category of risk.

## Anti-cheating

**Randomised answer order.** Each student's option order comes from a seeded Fisher–Yates shuffle on
`playerId:questionId`. Because it is deterministic, the server can reproduce any student's order on
a reconnect without storing a permutation per player per question.

**Full-screen enforcement.** The student must tap to enter full-screen (browsers only grant it from
a user gesture). Leaving it mid-question drops a blocking overlay, logs the event, and counts a
strike; at the limit the student is frozen until the teacher clicks **unpause**.

**Page Visibility tracking.** `visibilitychange` catches tab switches and minimising, with the
hidden duration reported on return. `blur` additionally catches an alt-tab to another application —
logged but deliberately *not* strike-counted, since it is noisy.

Strikes are only counted **during a live question**. Leaving the tab in the lobby or while reading
the leaderboard is not cheating.

**What actually protects the scores** is server-side: the server owns the clock and the scoring,
validates every option id, refuses duplicate and late answers, never sends `acceptedAnswers` or
`correct` flags to a player, and never reveals an outcome in the answer ack — so the ack cannot be
used to brute-force an option.

> **Be honest with students about the limits.** None of the client-side signals are a security
> boundary. Devtools, a second device, or a phone camera defeat all of them. They make casual
> cheating awkward and visible, and give the teacher a log to *ask about*. The analytics screen says
> this in as many words, because a notification, a dropped call or a screen reader can all trip
> these signals and a false accusation costs more than a copied answer.

## Other things built in

- **Live emoji reactions** — students tap between questions; emoji float across the host's screen.
  Fixed allowlist (enforced server-side), per-socket rate limit, and a hard cap on simultaneous
  floaters, because this feeds a projector in front of a whole class.
- **Nickname sanitising** — control characters, zero-width joiners and bidi overrides are stripped;
  they are invisible in a leaderboard and perfect for impersonating a classmate.
- **Early close** — when every connected player has answered (or skipped), the question closes.
- **Colour + shape on every answer tile.** Roughly 1 in 12 boys is red-green colourblind; "the red
  one" is not a usable instruction.
- **"Worth re-teaching"** panel surfacing the three lowest-accuracy questions.
- **PIN pre-flight** over plain HTTP before a socket is opened, so a mistyped PIN fails before the
  student types a nickname.
- `inputMode="numeric"` on the PIN field; autocorrect/autocapitalise off on short answers, where a
  phone keyboard "helpfully" capitalising is a real source of wrong marks.
- `prefers-reduced-motion` respected throughout, including the reaction overlay.

## Suggested next steps

1. **Persistence.** Quizzes are built in-session and rooms are ephemeral. A small Postgres/SQLite
   layer for saved quizzes, teacher accounts and historical results is the obvious next step — keep
   it out of the live loop, write analytics at `game:over`.
2. **Authentication for hosts.** Anyone can currently open a room.
3. **Image uploads** rather than URLs — teachers rarely have a hosted URL to hand.
4. **Fuzzy short-answer matching** (Levenshtein distance ≤ 1) as an opt-in per question, plus a
   host-side "mark this response correct" button on the reveal screen for near-misses the accepted
   list did not anticipate. Right now a typo is simply wrong.
5. **Team mode** and a per-student "review your answers" screen after the quiz.
6. **Accessibility audit with a real screen reader**, including an option to extend time limits for
   students with accommodations — currently missing and more important than most of this list.

## Known dependency note

`npm audit` reports advisories against the **postcss version bundled inside Next.js**. They are
build-time only (postcss processes this project's own CSS, which is not attacker-controlled) and are
only fixable by upgrading to Next 16. The server tree has **0 vulnerabilities**.

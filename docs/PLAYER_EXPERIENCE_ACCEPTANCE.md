# Threadbound Player-Experience Acceptance Checklist

This document is the repeatable pre-merge UX/gameplay acceptance gate for Threadbound. It combines principles from the most relevant references for this project with automated proxy players in Playwright.

The goal is **not** to claim that automation can prove a game is fun. It can catch friction, broken expectations, lost progress, unclear choices, weak feedback, mobile problems, unsafe retries, and failed cooperative continuity before a real player sees them. Emotional delight, long-term retention, social chemistry, balance meta, and novelty still require human playtesting.

## Reference lenses

- **Celia Hodent — _The Gamer's Brain_ / Game UX work.** Primary lens for perception, attention, memory, onboarding, usability, engageability, learning, motivation, and avoiding unintended cognitive friction. Her 2026 second edition explicitly includes a game-UX framework and detailed checklist: https://www.routledge.com/The-Gamers-Brain-How-Neuroscience-and-UX-Can-Impact-Video-Game-Design/Hodent/p/book/9780367638184
- **Steve Krug — _Don't Make Me Think, Revisited_ and _Rocket Surgery Made Easy_.** Primary lens for obvious next actions, scanability, low-friction choices, concise interfaces, and frequent lightweight usability testing. Krug explicitly applies these principles beyond websites to mobile and desktop applications: https://sensible.com/dont-make-me-think/ and https://sensible.com/rocket-surgery-made-easy/
- **Steve Swink — _Game Feel_.** Primary lens for input, response, context, polish, metaphor, rules, predictable results, and immediate sensory acknowledgement of player actions: https://www.taylorfrancis.com/chapters/mono/10.1201/9781482267334-25/principles-game-feel-steve-swink
- **Jesse Schell — _The Art of Game Design: A Book of Lenses_.** Primary lens for evaluating the player's emotional state, meaningful choices, challenge, rewards, flow, goals, and repeated-loop appeal: https://schellgames.com/art-of-game-design
- **Threadbound architecture/reliability rules.** Fowler-style domain/service/repository boundaries, server-authoritative progression, optimistic run versions, transactional completion rewards, Threaded-owned Honey, and generated-content validation remain non-negotiable implementation constraints.

## Status vocabulary

- **GREEN — automated gate:** behavior is objective enough to assert in Playwright/Node and must pass CI.
- **GREEN — inspected proxy:** screenshots/journey state can be reviewed by a human judge after Playwright drives the flow.
- **HUMAN:** automation can only provide a proxy; requires real-player evidence later.
- **PRODUCTION GATE:** intentionally not required for today's local/manual-testing milestone but must be resolved before multi-instance production.

## A. First-time comprehension — Hodent + Krug

- [x] **PX-01 GREEN:** A new player sees the primary next action without reading unrelated account/debug information.
- [x] **PX-02 GREEN:** The first objective explains the short-term loop: encounters → run choice → boss → relic.
- [x] **PX-03 GREEN:** New mechanics are explained near the moment of use instead of front-loading a tutorial wall.
- [x] **PX-04 GREEN:** Primary controls use player-facing language rather than implementation terms.
- [x] **PX-05 GREEN:** Important combat state is readable with redundant visual/text cues such as HP numbers + bars.
- [x] **PX-06 GREEN:** Mobile primary controls meet the project's minimum touch-target size.

Automated proxies: `first-run-feel.spec.js`, `mobile.spec.js`.

## B. Action feedback and game feel — Swink

- [x] **PX-10 GREEN:** Strike produces an immediate visible response and authoritative damage feedback.
- [x] **PX-11 GREEN:** Enemy retaliation is visibly attributable to the action that caused it.
- [x] **PX-12 GREEN:** Guard has an understandable consequence and visible guarding state.
- [x] **PX-13 GREEN:** Mend/Revive appear only when context makes them meaningful.
- [x] **PX-14 GREEN:** Buttons have pressed/loading/disabled states; repeated impatient tapping cannot issue multiple browser actions from one control activation.
- [ ] **PX-15 HUMAN:** Repeated basic combat remains satisfying after novelty, story, and rewards are mentally stripped away. Playwright can verify feedback timing/state, but only humans can judge tactile satisfaction.

Automated proxies: `first-run-feel.spec.js`, `local-auth.spec.js`, `player-experience.spec.js`.

## C. Choice, challenge, reward, and replay pull — Schell

- [x] **PX-20 GREEN:** Run upgrades communicate their consequence before selection.
- [x] **PX-21 GREEN:** Temporary run power and permanent equipment power are clearly distinguished.
- [x] **PX-22 GREEN:** Dungeon completion produces a dedicated reward reveal rather than silently changing inventory.
- [x] **PX-23 GREEN:** Equipping the reward exposes the before → after permanent power change.
- [x] **PX-24 GREEN:** Completion presents one obvious continuation path back into the core loop.
- [x] **PX-25 GREEN:** A returning player keeps previously earned equipment/progression and can immediately start another run.
- [ ] **PX-26 HUMAN:** Upgrade choices remain interesting after many runs instead of collapsing into one dominant answer.
- [ ] **PX-27 HUMAN:** The player voluntarily wants another run when no test script is telling them to press the button.

Automated proxies: `first-run-feel.spec.js`, `threadbound.spec.js`, `player-experience.spec.js`.

## D. Cooperative experience

- [x] **PX-30 GREEN:** Party creation/join/readiness is understandable and leader ownership is explicit.
- [x] **PX-31 GREEN:** A shared run snapshots participants and cannot be altered by party membership changes mid-run.
- [x] **PX-32 GREEN:** Two players see the same authoritative run state after refresh/reload.
- [x] **PX-33 GREEN:** Support actions create non-DPS cooperative value: Guard, Mend, Revive.
- [x] **PX-34 GREEN:** A downed player cannot act while a living ally can continue.
- [x] **PX-35 GREEN:** Shared completion grants per-player rewards but advances shared world progress only once.
- [x] **PX-36 GREEN:** If one partner temporarily disconnects, the surviving partner can continue and the disconnected partner can reconnect to the same shared run.
- [ ] **PX-37 HUMAN:** Cooperation feels socially valuable rather than merely mathematically easier.

Automated proxies: `threadbound.spec.js`, `local-auth.spec.js`, `player-experience.spec.js`.

## E. Interruption, abandonment, and recovery

A roguelite run is player state, not disposable browser state. Temporary connection/browser interruptions must not punish the player with unexplained loss.

- [x] **PX-40 GREEN:** Browser refresh during a dungeon restores the same active run.
- [x] **PX-41 GREEN:** Closing the game tab mid-dungeon and reopening it in the same authenticated browser session restores the active run.
- [x] **PX-42 GREEN:** Going offline **between confirmed actions** does not advance or erase the authoritative run.
- [x] **PX-43 GREEN:** Returning online and reloading/restoring the game returns the player to the last authoritative run state.
- [x] **PX-44 GREEN:** Refreshing during the run-upgrade decision preserves the unchosen decision rather than auto-selecting or losing it.
- [x] **PX-45 GREEN:** A disconnected co-op member can return to the snapshotted party run; the leader is not forced to abandon it.
- [x] **PX-46 GREEN:** Run completion rewards are transactionally exactly-once even if completion processing is revisited.
- [x] **PX-47 GREEN:** Optimistic run versions reject stale simultaneous persistence writes rather than silently losing one player's state.
- [x] **PX-48 GREEN:** Mutating run commands use durable player-scoped idempotency keys. If an HTTP response is lost after a committed command, retrying the identical keyed request replays the stored response without advancing authoritative run state; mismatched key reuse and unresolved attempts fail closed.
- [x] **PX-49 GREEN:** Authenticated HTTP sessions use a durable SQLite-backed `express-session` Store. A signed `threadbound.sid` continues to resolve after application/database restart, expired rows are rejected/pruned, and multiple Node processes sharing the same authoritative SQLite file read the same session state instead of relying on process memory.
- [ ] **PX-50 PRODUCTION GATE:** Define explicit run expiry/abandon semantics: grace duration, manual abandon/forfeit, party-leader transfer if desired, and cleanup of indefinitely unfinished runs.

Automated proxies: `player-experience.spec.js`, `run-command-idempotency.spec.js`, `durable-session.test.js`, `support-combat.test.js`, `run-command-idempotency.test.js`, existing completion/idempotency tests.

## F. Mobile, accessibility, and cognitive load — Hodent + Krug

- [x] **PX-60 GREEN:** No horizontal overflow at the supported mobile test viewport.
- [x] **PX-61 GREEN:** Primary mobile navigation remains reachable and touch-friendly.
- [x] **PX-62 GREEN:** Debug/version/scaling metrics do not dominate the player-facing hierarchy.
- [x] **PX-63 GREEN:** Reduced-motion preference preserves understandable state without requiring animation.
- [x] **PX-64 GREEN:** Loading/error/status feedback is exposed through live status semantics.
- [ ] **PX-65 HUMAN:** Text size, contrast, terminology, and density remain comfortable across a wider device/access-needs matrix.

Automated proxies: `mobile.spec.js`, `first-run-feel.spec.js` plus screenshot review artifacts.

## G. Progression, economy, and generated-content integrity

- [x] **PX-70 GREEN:** Server/domain state, not browser state, owns combat/progression results.
- [x] **PX-71 GREEN:** Threaded remains authoritative for Honey; local Threadbound mode cannot mint/spend it.
- [x] **PX-72 GREEN:** Honey purchase retries are idempotent and do not double-grant.
- [x] **PX-73 GREEN:** Generated item mechanics use constrained validated effect vocabularies rather than arbitrary executable content.
- [x] **PX-74 GREEN:** Published Arc Manifest content is validated/versioned and active runs snapshot their dungeon definition.
- [x] **PX-75 GREEN:** The living Codex grows from authoritative/generated world state instead of relying on manually maintained duplicate documentation.

Automated proxies: contract/unit tests, `threadbound.spec.js`, `local-auth.spec.js`, `arc-workshop.spec.js`.

## Playwright proxy players

| Proxy player | Behavior we simulate | Main question |
| --- | --- | --- |
| **The New Weaver** | Logs in on a phone-sized viewport with no prior knowledge. | Is the first useful decision obvious and learnable? |
| **The Impatient Tapper** | Acts and immediately expects feedback/loading protection. | Does input reliably produce one understandable response? |
| **The Cautious Strategist** | Uses Guard and compares consequences instead of only attacking. | Are non-damage choices legible and meaningful? |
| **The Returning Grinder** | Completes/equips, leaves the immediate completion state, then starts again stronger. | Does permanent progression create a coherent replay loop? |
| **The Tab Closer** | Leaves an unfinished run by closing the page and later opens `/game` again. | Is a run owned by the server rather than the tab? |
| **The Commuter** | Loses network mid-dungeon between actions, attempts an action offline, reconnects, and resumes. | Is confirmed progress safe during ordinary connectivity loss? |
| **The Interrupted Decision Maker** | Reaches the run-upgrade choice and refreshes before choosing. | Is a meaningful unresolved decision preserved? |
| **The Flaky Co-op Partner** | Joins a party, starts a shared run, goes offline while the leader continues, then reconnects. | Does one player's connection problem destroy the party experience? |
| **The Economy Retrier** | Repeats the same Honey purchase command. | Are external-currency mutations exactly-once? |
| **The Response-Loss Retrier** | Reissues the exact same run mutation after treating the first successful response as lost. | Does the server replay the original result without applying the command twice? |
| **The Restarted Browser Session** | Reuses its signed session cookie after the app and DB connection are recreated. | Does authentication continuity depend on durable server state rather than one Node process? |

## Judge protocol

For every substantial player-facing change:

1. Run Node/unit/contract gates.
2. Run all Playwright suites, including the proxy-player acceptance journeys.
3. Save representative mobile screenshots for first objective, combat feedback, choice, reward, and any newly changed state.
4. Judge screenshots/journeys against this checklist. A DOM assertion can be green while hierarchy still feels wrong; visual inspection is a separate gate.
5. Fix objective GREEN failures before merge.
6. Record HUMAN items as questions for future real-player sessions; never convert a scripted click into evidence of genuine motivation.
7. Do not call the build production-ready while any PRODUCTION GATE item is unresolved.

## Two-reviewer guide — PV2-K01–K05

Use this run sheet to collect human evidence for the five Phase K gates in `THREADBOUND_MASTER_PLAN.md`. Allow about 2½ hours, plus setup. Automated Playwright runs prepare the build but do not count as human sign-off.

### What Playwright can and cannot review

Playwright can repeat objective checks: whether a successful Area Travel or Town Talk closes `YOUR VIEW`, whether the resulting receipt is visible at the bottom of the Adventure Stream without manual scrolling, and whether the same actions work at a mobile viewport. The React-local suite already covers those Area and NPC interactions. Run it with `npm run test:e2e:react-local` after installing Chromium with `npx playwright install chromium` if needed.

Those results do not count as either human review. Two people still need to judge whether the first hour makes sense without coaching, whether Hunt receipts and play remain satisfying, whether chat cards feel easier to use than separate pages, whether co-op choices feel meaningful, and whether mobile and desktop feel coherent. Record their observations separately; do not infer those judgments from scripted clicks.

### Host quick start

1. Pick a local-only database filename that does not already exist, so the session starts with fresh characters and does not disturb another local save. Set `THREADBOUND_DB_PATH` to that file in `.env` along with `PORT=3001`, a long random `SESSION_SECRET`, and `THREADBOUND_AUTH_MODE=local`. Follow the local setup in `README.md`; do not use production accounts or a Threaded wallet.
2. Start the app with `npm start`, then open `http://127.0.0.1:3001` in two separate browser sessions. Use a normal window and a private window (or two browsers), and have each reviewer choose a different Local Weaver profile. Join both to the same party for the co-op section.
3. Set one session to **390×844** and the other to **1440×960**. A real phone is fine for the mobile session. Swap sizes during the review so each person tries both layouts.
4. Give each reviewer their own blank worksheet from this guide. Ask them to keep answers independent until the debrief; one person's explanation must not teach the other.
5. Read the opening script, let them play without a task list for the first hour, and only then read the progression task card below. Do not explain controls or commands. Record any hint or workaround as help.
6. After the session, compare both worksheets with the gate criteria. Keep any **No** or **Mixed** result open, capture the concrete friction, fix it, and repeat the affected task with human reviewers before proposing Phase K as green.

For the reported Area-card obstruction, specifically ask each reviewer to open `/area` and use **Talk** on a Town NPC. If they have an unlocked later Area, also ask them to use **Travel**. After each successful action, the `YOUR VIEW` card should close and the new Town or Area receipt should be visible at the bottom of the Adventure Stream without scrolling up or down to find it. Reopening `/area` should bring the card back when they want it. Note any failure to dismiss, stale card, or hidden receipt as a concrete PV2-K03 issue; Playwright coverage checks the repeatable behavior, while the reviewers judge whether the result is obvious and keeps the flow comfortable.

### People and materials

- **Host:** prepares the test environment, reads the task cards, and takes observation notes. The host does not explain game controls or strategy during play.
- **Reviewer A and Reviewer B:** people who have not read developer documentation or been coached through Threadbound. Record each person's familiarity with RPGs and chat games before starting.
- Two separate local-auth browser sessions on a fresh local database. Join the reviewers to the same party for the shared part of the review. Do not use production accounts or a Threaded wallet.
- Two browser windows set to **390×844** and **1440×960**. Start one reviewer on each size, then swap so both use both layouts.
- A copy of the worksheet below for each reviewer. Do not show the progression task card until the free-play hour is over.

### Invite and opening script

Send this before the session:

> Could you spend about 2½ hours trying Threadbound with one other person? It is a chat-first RPG. You do not need to prepare or know how to play. I’m checking whether the game explains itself, so I’ll observe and take notes instead of teaching. You can stop or take a break whenever you need to.

At the start, say:

> Please play as you normally would and say what you are looking for or expecting. I can fix a technical problem, but I will not explain game choices during the first part. If you get stuck, tell me what you expected to happen.

### Run of show

| Time | Activity | Host instructions |
| --- | --- | --- |
| 0–10 min | Welcome and setup | Confirm both sessions are separate players in the same party. Set the two viewport sizes. Ask each reviewer about RPG and chat-game familiarity. Do not tour the interface. |
| 10–70 min | Unprompted first hour | Let them play together from the fresh starting state. Do not provide a task list or hint. At natural pauses, ask only “What are you trying to do next?” and “What did you expect to happen?” Record who acted, who helped, dead ends, pauses, and the exact words used. |
| 70–115 min | Connected progression tasks | Before showing the task card, have each reviewer privately write their current goal and next step. Keep those answers separate. Then read the card below. Give goals only; do not name buttons, commands, or where to find them. Let both reviewers take actions. Record each step they finish, any hint or workaround, and which viewport they used. After Area Travel or Town Talk, note whether the `YOUR VIEW` card closes and the new receipt is visible without manual scrolling. |
| 115–130 min | Viewport swap | Swap the 390×844 and 1440×960 layouts. Have each person repeat one Inventory action and one active game action. Note discovery, clipping, text density, and any layout difference that changes meaning. |
| 130–150 min | Separate debrief and notes | Ask each reviewer the questions below one at a time. They complete their worksheets independently before comparing answers. |

Take breaks as needed. If the connected route takes longer, record the last completed step and the blocker rather than rushing or coaching them through it. If a technical/accessibility problem requires intervention, fix it and record exactly what happened; do not count a taught step as independent success.

### Progression task card

Read this only after the unprompted hour:

> Together, improve your readiness using the starting Area. Find a useful non-weapon piece of equipment and equip it. Make progress on a Quest and speak with someone in Town. Then take on a multi-enemy Dungeon as a party. Decide whether and when the shared Heal is worth using, and continue toward the boss. If you earn access to another Area, travel there, try a Hunt, look at the local Quest and Town help, and challenge a Guild Hall rival to a Duel.

Do not tell reviewers how to complete a step. The route is evidence gathering, not a race. If an earlier misunderstanding prevents later steps, record it and move on only when the host needs to gather evidence for another gate.

### Debrief questions

Ask both people separately, without suggesting an answer:

1. “In your own words, what were you trying to accomplish? What would you do next if you had five minutes?”
2. “Pick a recent Hunt. What changed for your character, and what could you do after seeing the result?”
3. “Where did you expect Inventory, Shop, Quest, Area, and Town actions to happen? Was anything awkward to find?”
4. “In your own words, who could Heal, when was it available, who spent the party Heal, and what did Continue do? What made the risk of the next fight clear or unclear?”
5. “What changed when you switched screen sizes? Did you lose an action, detail, or sense of where you were?”
6. “What was the most satisfying moment? What was the most confusing moment? What would you change first?”

### Reviewer worksheet

Complete one copy per person before comparing notes. Use **Yes**, **Mixed**, or **No** and include a concrete example; do not score from memory alone.

**Reviewer:** A / B · **Date/build:** · **RPG familiarity:** · **Chat-game familiarity:** · **Starting viewport:**

| Gate | Verdict | Step, viewport, and observed behavior | Exact quote or question asked | Host/partner help? |
| --- | --- | --- | --- | --- |
| **PV2-K01** First-hour comprehension |  |  |  |  |
| **PV2-K02** Hunt and long-session receipts |  |  |  |  |
| **PV2-K03** Rich cards in chat |  |  |  |  |
| **PV2-K04** Co-op and Dungeon |  |  |  |  |
| **PV2-K05** Mobile/desktop coherence |  |  |  |  |

**Most satisfying moment:**

**Most confusing moment or dead end:**

**What would you do next without a hint?**

### Assessing the gates

| Gate | Count it as a “Yes” only when… |
| --- | --- |
| **PV2-K01** | Both reviewers can describe their goal and choose a useful next step after free play without developer docs or a host hint. Record partner help separately so it is clear whether the game, the partner, or both supplied the missing context. |
| **PV2-K02** | Both can scan a Hunt receipt and identify the outcome, HP change, rewards/progression, and a sensible next action. Record whether they wanted to continue Hunts and why. |
| **PV2-K03** | Both complete the observed Inventory, Shop, Quest, Area, and NPC tasks in context and can find the next action without expressing a need to leave chat. After Area Travel or Town Talk, the `YOUR VIEW` card closes and the new receipt is visible without manual scrolling. Note any exception by task. |
| **PV2-K04** | Both can explain the shared Heal opportunity and Continue choice in their own words, understand the Dungeon risk, and describe a meaningful contribution they made. |
| **PV2-K05** | Both use both viewport sizes and can find the same important state/actions without clipping, unreadable density, or layout changes that alter their understanding. |

Use **Mixed** if one person succeeds and the other struggles, or a hint/workaround is needed. Use **No** if both misunderstand or cannot complete the criterion. A single reviewer’s issue must stay visible; do not average it away. Capture any screen or device in question, then assess the evidence together after both worksheets are complete. A “No” or “Mixed” is useful evidence: fix the friction and repeat the affected task with reviewers before proposing that gate as green.

Keep the Phase K boxes open until both people's evidence has been reviewed against every gate. Do not infer one person's experience from the other's notes, and do not convert a scripted click or automated assertion into human sign-off.

## Current release interpretation

For the current manual-testing milestone, **all objective local/single-process player-experience gates must be green**. PX-48 ambiguous response-loss replay and PX-49 durable authenticated sessions are now resolved. PX-50 explicit long-lived run expiry/abandon policy is the remaining production gate; it does not block local manual playtesting, but it must be resolved before production.

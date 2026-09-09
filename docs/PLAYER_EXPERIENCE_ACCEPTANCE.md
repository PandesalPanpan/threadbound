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
- [ ] **PX-49 PRODUCTION GATE:** Replace the in-memory Express session store so reconnect/re-auth survives process restart and multi-instance deployment.
- [ ] **PX-50 PRODUCTION GATE:** Define explicit run expiry/abandon semantics: grace duration, manual abandon/forfeit, party-leader transfer if desired, and cleanup of indefinitely unfinished runs.

Automated proxies: `player-experience.spec.js`, `run-command-idempotency.spec.js`, `support-combat.test.js`, `run-command-idempotency.test.js`, existing completion/idempotency tests.

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

## Judge protocol

For every substantial player-facing change:

1. Run Node/unit/contract gates.
2. Run all Playwright suites, including the proxy-player acceptance journeys.
3. Save representative mobile screenshots for first objective, combat feedback, choice, reward, and any newly changed state.
4. Judge screenshots/journeys against this checklist. A DOM assertion can be green while hierarchy still feels wrong; visual inspection is a separate gate.
5. Fix objective GREEN failures before merge.
6. Record HUMAN items as questions for future real-player sessions; never convert a scripted click into evidence of genuine motivation.
7. Do not call the build production-ready while any PRODUCTION GATE item is unresolved.

## Current release interpretation

For the current manual-testing milestone, **all objective local/single-process player-experience gates must be green**. PX-48 ambiguous response-loss replay is now resolved; the two remaining production gates are durable distributed sessions (PX-49) and explicit long-lived run expiry/abandon policy (PX-50). They do not block local manual playtesting, but both must be resolved before multi-instance production.

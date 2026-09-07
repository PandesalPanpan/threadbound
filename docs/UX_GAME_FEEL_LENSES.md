# Threadbound UX + Game Feel Lenses

This slice uses a compact design canon as practical review lenses.

## Krug — clarity without explanation

A first-time player should be able to answer, without reading a manual:

- What am I supposed to do next?
- What is the primary action?
- What changed after I acted?
- Where do I go for gear, party, world, and Codex?

Acceptance checks:

- The first objective is visible before the first run without a modal tutorial wall.
- Combat teaches Strike and Guard contextually at the moment they become relevant.
- Secondary systems do not compete visually with the current combat decision.
- Primary calls to action use concrete verbs.

## Hodent — game UX, cognition, usability, engageability

The interface should respect limited attention and working memory while keeping feedback, learning, and motivation visible.

Acceptance checks:

- First-run guidance is short, contextual, and progressively disclosed.
- Important state changes are visually salient and redundant with text.
- The UI never requires remembering hidden combat rules to make the next decision.
- Mobile controls preserve large touch targets and avoid horizontal overflow.
- Motion is non-essential and respects reduced-motion preferences.

## Swink — input must feel consequential

Every combat action should visibly acknowledge the input and communicate its result.

Acceptance checks:

- Strike produces immediate pressed-state feedback plus visible damage feedback.
- Retaliation is surfaced separately from outgoing damage.
- Guard communicates protection, not merely a hidden state change.
- Enemy and player health changes animate without preventing rapid play.
- No sound autoplays; feedback sounds only occur after a direct player action.

## Schell — decisions, rewards, and the next desire

The player should understand why a choice matters and what they gained from completing the loop.

Acceptance checks:

- Upgrade choices explain their mechanical consequence before selection.
- Dungeon completion has an explicit reward reveal.
- The reward can be equipped directly from the reveal.
- The player can immediately choose to run again.
- Persistent improvement is made visible after equipping a better reward.

## Verification approach

Automated browser checks cover objective properties such as first-run hierarchy, mobile overflow, touch target size, action feedback, upgrade choice clarity, reward reveal, equipping, and run-again flow. Automated checks cannot prove subjective fun. The final review therefore separates:

1. structural usability that CI can verify,
2. interaction/game-feel qualities that can be inspected in-browser,
3. subjective retention/fun hypotheses that still require fresh human playtests.

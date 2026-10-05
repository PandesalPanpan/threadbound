const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const RECOVERY = Object.freeze({ player: 0.22, enemy: 0.24 });

export function impactHitStopMs(feedback, normalMs = 70) {
  if (feedback?.grade === 'PERFECT_GUARD' || (feedback?.grade === 'PERFECT' && feedback?.action === 'SKILL')) {
    return Math.min(105, normalMs + 30);
  }
  if (feedback?.grade === 'PERFECT' || feedback?.grade === 'GOOD') return Math.min(82, normalMs + 12);
  if (feedback?.grade === 'MISS' || feedback?.grade === 'POOR') return Math.max(36, normalMs - 18);
  return normalMs;
}

function isStrongFeedback(feedback) {
  if (feedback?.grade === 'MISS' || feedback?.grade === 'POOR') return false;
  return feedback?.grade === 'PERFECT' || feedback?.grade === 'PERFECT_GUARD' || feedback?.grade === 'GOOD' || feedback?.action === 'SKILL';
}

export function createActiveTimingChoreography({ root, gsap, reducedMotion = false }) {
  const arena = root?.querySelector('.active-timing-arena');
  const scene = root?.querySelector('.active-timing-scene');
  const fxLayer = root?.querySelector('.active-timing-fx');
  const player = root?.querySelector('.active-timing-unit--player');
  const enemy = root?.querySelector('.active-timing-unit--enemy');
  const playerImage = player?.querySelector('img');
  const enemyImage = enemy?.querySelector('img');
  const playerShadow = root?.querySelector('.active-timing-unit__shadow--player');
  const enemyShadow = root?.querySelector('.active-timing-unit__shadow--enemy');
  const playerHalo = player?.querySelector('.active-timing-unit__halo');
  const enemyHalo = enemy?.querySelector('.active-timing-unit__halo');

  const timelines = new Set();
  const unitTimelines = new Map();
  const idleTimelines = new Map();
  const effectElements = new Set();
  let effectSequence = 0;
  let destroyed = false;

  const allUnits = [player, enemy].filter(Boolean);
  const shadowFor = new Map([[player, playerShadow], [enemy, enemyShadow]]);
  const imageFor = new Map([[player, playerImage], [enemy, enemyImage]]);

  function forgetTimeline(timeline) {
    timelines.delete(timeline);
    for (const [unit, current] of unitTimelines) {
      if (current === timeline) unitTimelines.delete(unit);
    }
    for (const [unit, current] of idleTimelines) {
      if (current === timeline) idleTimelines.delete(unit);
    }
  }

  function killTimeline(timeline) {
    if (!timeline) return;
    timeline.kill();
    forgetTimeline(timeline);
  }

  function makeTimeline({ units = [], idle = false, repeat = 0, yoyo = false, onComplete } = {}) {
    let timeline;
    timeline = gsap.timeline({
      repeat,
      yoyo,
      onComplete: () => {
        forgetTimeline(timeline);
        onComplete?.();
      },
    });
    timelines.add(timeline);
    for (const unit of units) {
      const previous = unitTimelines.get(unit);
      if (previous && previous !== timeline) killTimeline(previous);
      unitTimelines.set(unit, timeline);
      if (idle) idleTimelines.set(unit, timeline);
    }
    return timeline;
  }

  function stopUnit(unit) {
    if (!unit) return;
    killTimeline(unitTimelines.get(unit));
    const idle = idleTimelines.get(unit);
    if (idle) killTimeline(idle);
  }

  function clearFxElement(element) {
    if (!element) return;
    effectElements.delete(element);
    element.remove();
  }

  function scopedCenter(element) {
    const bounds = element?.getBoundingClientRect();
    const stage = fxLayer?.getBoundingClientRect();
    if (!bounds || !stage) return { x: stage?.width ? stage.width / 2 : 0, y: stage?.height ? stage.height / 2 : 0 };
    return {
      x: bounds.left - stage.left + bounds.width / 2,
      y: bounds.top - stage.top + bounds.height / 2,
    };
  }

  function effectNode(className, position, content = '') {
    if (!fxLayer || destroyed) return null;
    const element = document.createElement('span');
    element.className = className;
    element.setAttribute('aria-hidden', 'true');
    if (content) element.textContent = content;
    fxLayer.append(element);
    effectElements.add(element);
    gsap.set(element, {
      x: position.x,
      y: position.y,
      xPercent: -50,
      yPercent: -50,
      transformOrigin: '50% 50%',
    });
    return element;
  }

  function animateEffect(nodes, build) {
    const liveNodes = nodes.filter(Boolean);
    if (!liveNodes.length) return;
    const timeline = makeTimeline({ onComplete: () => liveNodes.forEach(clearFxElement) });
    build(timeline);
  }

  function spawnImpactBurst(targetUnit, { strong = false, perfect = false, incoming = false, slash = true } = {}) {
    if (!fxLayer || !targetUnit) return;
    const target = scopedCenter(targetUnit);
    const source = scopedCenter(incoming ? enemy : player);
    const tone = incoming ? 'is-incoming' : perfect ? 'is-perfect' : 'is-impact';
    const ring = effectNode(`active-timing-fx__ring ${tone}`, target);
    const slashFx = slash && !incoming ? effectNode('active-timing-fx__slash', {
      x: source.x + (target.x - source.x) * 0.62,
      y: source.y + (target.y - source.y) * 0.62,
    }) : null;
    const count = reducedMotion ? 2 : strong ? 8 : 5;
    const motes = [];
    const seed = ++effectSequence;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index / count) + seed * 0.31;
      const radius = (strong ? 24 : 16) + (index % 3) * 4;
      const mote = effectNode(`active-timing-fx__spark ${tone}`, {
        x: target.x + Math.cos(angle) * 5,
        y: target.y + Math.sin(angle) * 5,
      });
      if (mote) motes.push({ element: mote, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
    animateEffect([ring, slashFx, ...motes.map((mote) => mote.element)], (timeline) => {
      if (ring) timeline.fromTo(ring, { scale: 0.25, autoAlpha: 0.92 }, {
        scale: reducedMotion ? 1.35 : strong ? 2.35 : 1.95,
        autoAlpha: 0,
        duration: reducedMotion ? 0.12 : strong ? 0.27 : 0.22,
        ease: 'power2.out',
      }, 0);
      if (slashFx) timeline.fromTo(slashFx, { scaleX: 0.15, autoAlpha: 0.95, rotation: -22 }, {
        scaleX: strong ? 1.2 : 0.92,
        rotation: -11,
        autoAlpha: 0,
        duration: 0.16,
        ease: 'power3.out',
      }, 0);
      for (const { element, x, y } of motes) {
        timeline.fromTo(element, { scale: 1, autoAlpha: 1 }, {
          x: `+=${x}`,
          y: `+=${y}`,
          scale: 0.12,
          autoAlpha: 0,
          duration: reducedMotion ? 0.12 : 0.24,
          ease: 'power2.out',
        }, 0);
      }
    });
  }

  function spawnHealEffect() {
    if (!fxLayer || !player) return;
    const center = scopedCenter(player);
    const nodes = [];
    const count = reducedMotion ? 2 : 5;
    for (let index = 0; index < count; index += 1) {
      const node = effectNode('active-timing-fx__mote is-heal', {
        x: center.x + (index - (count - 1) / 2) * 10,
        y: center.y + 20,
      }, index % 2 === 0 ? '+' : '·');
      if (node) nodes.push(node);
    }
    animateEffect(nodes, (timeline) => nodes.forEach((node, index) => {
      timeline.fromTo(node, { y: '+=7', scale: 0.55, autoAlpha: 0 }, {
        y: '-=34',
        scale: 1.12,
        autoAlpha: 0.95,
        duration: reducedMotion ? 0.14 : 0.36,
        delay: index * 0.025,
        ease: 'power2.out',
      }, 0);
      timeline.to(node, { autoAlpha: 0, duration: 0.11, ease: 'power1.in' }, reducedMotion ? 0.12 : 0.27);
    }));
  }

  function spawnGuardRing(unit, perfect = false) {
    if (!fxLayer || !unit) return;
    const ring = effectNode(`active-timing-fx__ring ${perfect ? 'is-perfect is-guard' : 'is-guard'}`, scopedCenter(unit));
    animateEffect([ring], (timeline) => timeline.fromTo(ring, { scale: 0.6, autoAlpha: 0.85 }, {
      scale: reducedMotion ? 1.25 : perfect ? 2.2 : 1.75,
      autoAlpha: 0,
      duration: reducedMotion ? 0.14 : perfect ? 0.31 : 0.24,
      ease: 'power2.out',
    }, 0));
  }

  function flashUnit(unit, color = 'white') {
    const flash = unit?.querySelector('.active-timing-unit__flash');
    if (!flash) return;
    flash.dataset.tone = color;
    gsap.fromTo(flash, { autoAlpha: reducedMotion ? 0.36 : 0.88, scaleX: 0.82, scaleY: 0.82 }, {
      autoAlpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: reducedMotion ? 0.1 : 0.16,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }

  function popFeedback() {
    const feedback = root?.querySelector('.active-timing-hit');
    if (!feedback) return;
    const strong = feedback.classList.contains('is-perfect') || feedback.classList.contains('is-strong');
    const timeline = makeTimeline();
    timeline.fromTo(feedback, { y: 9, scale: 0.72, autoAlpha: 0 }, {
      y: -5,
      scale: strong ? 1.13 : 1.04,
      autoAlpha: 1,
      duration: reducedMotion ? 0.1 : 0.17,
      ease: 'back.out(1.65)',
    }, 0);
    timeline.to(feedback, { y: -24, scale: 0.96, autoAlpha: 0, duration: reducedMotion ? 0.12 : 0.24, ease: 'power2.in' }, reducedMotion ? 0.1 : 0.2);
  }

  function screenKick(strength = 1) {
    if (!arena || reducedMotion || destroyed) return;
    const amount = clamp(strength, 0.75, 1.85);
    const timeline = makeTimeline();
    timeline.to(arena, { x: amount, rotation: 0.12 * amount, duration: 0.027, ease: 'power1.out' })
      .to(arena, { x: -amount * 0.72, rotation: -0.08 * amount, duration: 0.035, ease: 'power1.inOut' })
      .to(arena, { x: amount * 0.28, rotation: 0.035 * amount, duration: 0.032, ease: 'power1.inOut' })
      .to(arena, { x: 0, rotation: 0, duration: 0.06, ease: 'power2.out' });
  }

  function travelToward(side) {
    const actor = side === 'player' ? playerImage : enemyImage;
    const target = side === 'player' ? enemyImage : playerImage;
    if (!actor || !target || !scene) return reducedMotion ? 9 : 48;
    const actorBox = actor.getBoundingClientRect();
    const targetBox = target.getBoundingClientRect();
    const sceneBox = scene.getBoundingClientRect();
    const direction = side === 'player' ? 1 : -1;
    const gap = direction > 0 ? targetBox.left - actorBox.right : actorBox.left - targetBox.right;
    const room = direction > 0 ? sceneBox.right - actorBox.right - 6 : actorBox.left - sceneBox.left - 6;
    const responsiveDistance = clamp(Math.max(0, gap) * 0.55 + 12, 30, 108);
    const distance = Math.max(8, Math.min(responsiveDistance, Math.max(8, room)));
    return direction * (reducedMotion ? Math.min(11, distance * 0.16) : distance);
  }

  function startIdle(unit, phaseDelay = 0) {
    if (!unit || reducedMotion || destroyed || idleTimelines.has(unit)) return;
    const shadow = shadowFor.get(unit);
    const tilt = unit === player ? -0.35 : 0.4;
    const timeline = makeTimeline({ units: [unit], idle: true, repeat: -1, yoyo: true });
    timeline.to(unit, { y: -2, scaleX: 1.004, scaleY: 0.996, rotation: tilt, duration: 1.18, ease: 'sine.inOut' }, 0);
    if (shadow) timeline.to(shadow, { scaleX: 0.96, opacity: 0.65, duration: 1.18, ease: 'sine.inOut' }, 0);
    if (phaseDelay) timeline.delay(phaseDelay);
  }

  function playIdle() {
    allUnits.forEach((unit, index) => startIdle(unit, index === 0 ? 0 : 0.44));
  }

  function recover(units, duration = 0.24, { idle = true, includeOpacity = false } = {}) {
    if (destroyed) return;
    const activeUnits = units.filter(Boolean);
    const shadows = activeUnits.map((unit) => shadowFor.get(unit)).filter(Boolean);
    activeUnits.forEach(stopUnit);
    const timeline = makeTimeline({ units: activeUnits, onComplete: () => {
      if (idle) activeUnits.forEach((unit, index) => startIdle(unit, index ? 0.38 : 0));
    } });
    const settleDuration = reducedMotion ? 0.08 : duration;
    if (activeUnits.length) timeline.to(activeUnits, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      ...(includeOpacity ? { autoAlpha: 1 } : {}),
      duration: settleDuration,
      ease: reducedMotion ? 'power1.out' : 'back.out(1.35)',
      overwrite: 'auto',
    }, 0);
    if (shadows.length) timeline.to(shadows, { scaleX: 1, scaleY: 1, opacity: 0.72, duration: settleDuration, ease: 'power2.out', overwrite: 'auto' }, 0);
  }

  function playAttack({ timing }) {
    if (destroyed || !player) return;
    stopUnit(player);
    const distance = travelToward('player') * (reducedMotion ? 1 : 0.48);
    const targetTime = Math.max(0.28, Number(timing?.targetMs || 800) / 1000);
    const commitAt = Math.max(0.18, targetTime - 0.2);
    const timeline = makeTimeline({ units: [player] });
    timeline.addLabel('anticipation', 0)
      .to(player, { x: reducedMotion ? -2 : -8, y: reducedMotion ? 0 : 2, scaleX: 1.025, scaleY: 0.965, rotation: -2.2, duration: reducedMotion ? 0.06 : 0.12, ease: 'power2.in' }, 'anticipation')
      .to(player, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: reducedMotion ? 0.08 : 0.18, ease: 'power2.out' }, '>')
      .to(player, { x: distance, y: reducedMotion ? 0 : -2, scaleX: 1.035, scaleY: 0.975, rotation: 1.4, duration: reducedMotion ? 0.08 : 0.16, ease: 'power2.in' }, commitAt);
    if (playerHalo) timeline.to(playerHalo, { scale: reducedMotion ? 1.04 : 1.18, opacity: 0.82, duration: reducedMotion ? 0.08 : 0.18, ease: 'power1.out' }, commitAt);
  }

  function playHeavyAttack({ timing, startedAt }) {
    if (destroyed || !player) return;
    stopUnit(player);
    if (startedAt == null) {
      const ready = makeTimeline({ units: [player] });
      ready.to(player, { y: reducedMotion ? -1 : -3, scaleX: 0.985, scaleY: 1.025, rotation: -0.8, duration: reducedMotion ? 0.08 : 0.15, ease: 'power2.out' }, 0);
      if (playerHalo) ready.to(playerHalo, { scale: 1.18, opacity: 0.74, duration: reducedMotion ? 0.08 : 0.15, ease: 'power2.out' }, 0);
      return;
    }
    const targetTime = Math.max(0.22, Number(timing?.targetMs || 1000) / 1000);
    const timeline = makeTimeline({ units: [player] });
    timeline.to(player, { y: reducedMotion ? -3 : -11, scaleX: 0.975, scaleY: 1.035, rotation: -1.4, duration: targetTime, ease: 'power1.in' }, 0);
    if (playerShadow) timeline.to(playerShadow, { scaleX: reducedMotion ? 0.96 : 0.82, opacity: reducedMotion ? 0.65 : 0.46, duration: targetTime, ease: 'power1.in' }, 0);
    if (playerHalo) timeline.to(playerHalo, { scale: reducedMotion ? 1.12 : 1.38, opacity: 0.98, duration: targetTime, ease: 'sine.inOut' }, 0);
  }

  function playTelegraph(pattern) {
    if (destroyed || !enemy) return;
    stopUnit(enemy);
    const duration = Math.max(0.34, Number(pattern?.telegraphMs || 520) / 1000);
    const pullback = reducedMotion ? 2 : 8;
    const timeline = makeTimeline({ units: [enemy] });
    timeline.addLabel('tell', 0)
      .to(enemy, { x: pullback, y: reducedMotion ? 0 : 6, scaleX: 1.035, scaleY: 0.91, rotation: -2.1, duration: reducedMotion ? 0.08 : 0.18, ease: 'power2.in' }, 'tell')
      .to(enemy, { x: pullback * 0.34, y: 0, scaleX: 1, scaleY: 0.98, rotation: 0, duration: reducedMotion ? 0.12 : 0.2, ease: 'power2.out' }, '>')
      .to(enemy, { x: pullback * 0.4, duration: Math.max(0.04, duration - (reducedMotion ? 0.2 : 0.38)), ease: 'none' }, '>');
    if (enemyHalo) timeline.to(enemyHalo, { scale: reducedMotion ? 1.05 : 1.15, opacity: 0.92, duration: reducedMotion ? 0.12 : 0.26, ease: 'sine.inOut' }, 0);
  }

  function playDefenseTiming({ timing }) {
    if (destroyed || !enemy) return;
    stopUnit(enemy);
    const distance = travelToward('enemy') * 0.72;
    const targetTime = Math.max(0.25, Number(timing?.targetMs || 560) / 1000);
    const launchAt = Math.max(0.12, targetTime - 0.19);
    const timeline = makeTimeline({ units: [enemy] });
    timeline.to(enemy, { x: reducedMotion ? 2 : 7, y: reducedMotion ? 0 : 4, scaleX: 1.035, scaleY: 0.93, rotation: 1.8, duration: reducedMotion ? 0.07 : 0.14, ease: 'power2.in' }, 0)
      .to(enemy, { x: -distance, y: reducedMotion ? 0 : -2, scaleX: 1.045, scaleY: 0.97, rotation: -1.4, duration: reducedMotion ? 0.08 : 0.16, ease: 'power3.in' }, launchAt);
    if (enemyHalo) timeline.to(enemyHalo, { scale: 1.14, opacity: 0.96, duration: 0.17, ease: 'power1.out' }, launchAt);
  }

  function playPlayerImpact(feedback, { hitStopMs = 56, defeated = false } = {}) {
    if (destroyed || !player || !enemy) return;
    stopUnit(player);
    stopUnit(enemy);
    const strong = isStrongFeedback(feedback);
    const perfect = feedback?.grade === 'PERFECT' || (feedback?.action === 'SKILL' && feedback?.grade === 'GOOD');
    const travel = travelToward('player');
    const reach = travel * (feedback?.grade === 'MISS' || feedback?.grade === 'POOR' ? 0.5 : feedback?.action === 'SKILL' ? 1.08 : 1);

    gsap.set(player, { scaleX: strong ? 1.045 : 1.025, scaleY: strong ? 0.945 : 0.97, rotation: 1.5 });
    gsap.set(enemy, { scaleX: perfect ? 0.78 : 0.84, scaleY: perfect ? 1.105 : 1.075, rotation: perfect ? 4.4 : 2.6 });
    if (enemyShadow) gsap.set(enemyShadow, { scaleX: perfect ? 1.14 : 1.08, opacity: 0.84 });

    spawnImpactBurst(enemy, { strong, perfect, slash: feedback?.grade !== 'MISS' && feedback?.grade !== 'POOR' });
    flashUnit(enemy, perfect ? 'gold' : 'white');
    popFeedback();

    const timeline = makeTimeline({ units: [player, enemy], onComplete: () => {
      if (defeated) return;
      startIdle(player);
      startIdle(enemy, 0.44);
    } });
    timeline.addLabel('hit-stop', 0)
      .to({}, { duration: Math.max(0.036, hitStopMs / 1000) }, 'hit-stop')
      .addLabel('follow-through', '>')
      .call(() => screenKick(perfect ? 1.75 : strong ? 1.35 : 0.85), [], 'follow-through')
      .to(player, { x: reach * 1.06, y: reducedMotion ? 0 : -3, scaleX: strong ? 1.075 : 1.045, scaleY: 0.955, rotation: 3.2, duration: reducedMotion ? 0.07 : 0.1, ease: 'power2.out' }, 'follow-through')
      .to(enemy, {
        x: defeated ? travel * 0.2 : travel * 0.13,
        y: defeated || reducedMotion ? 0 : -1,
        scaleX: defeated ? 0.9 : 0.93,
        scaleY: defeated ? 0.96 : 1.015,
        rotation: defeated ? 24 : 1.2,
        autoAlpha: defeated ? 0.72 : 1,
        duration: reducedMotion ? 0.08 : 0.11,
        ease: 'power2.out',
      }, 'follow-through')
      .to(player, { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: reducedMotion ? 0.09 : RECOVERY.player, ease: 'back.out(1.4)' }, '>')
      .to(enemy, {
        x: defeated ? travel * 0.2 : 0,
        y: defeated ? 7 : 0,
        scaleX: defeated ? 0.9 : 1,
        scaleY: defeated ? 0.96 : 1,
        rotation: defeated ? 24 : 0,
        autoAlpha: defeated ? 0.72 : 1,
        duration: reducedMotion ? 0.09 : RECOVERY.enemy,
        ease: defeated ? 'power2.in' : 'back.out(1.55)',
      }, '<');
    if (playerShadow) timeline.to(playerShadow, { scaleX: 1, opacity: 0.72, duration: reducedMotion ? 0.09 : RECOVERY.player, ease: 'power2.out' }, 'follow-through');
    if (enemyShadow && !defeated) timeline.to(enemyShadow, { scaleX: 1, opacity: 0.72, duration: reducedMotion ? 0.09 : RECOVERY.enemy, ease: 'power2.out' }, 'follow-through');
    return timeline;
  }

  function playEnemyImpact(feedback, { hitStopMs = 56, defeated = false } = {}) {
    if (destroyed || !player || !enemy) return;
    stopUnit(player);
    stopUnit(enemy);
    const perfect = feedback?.grade === 'PERFECT_GUARD';
    const blocked = perfect || feedback?.grade === 'GUARD';
    const travel = travelToward('enemy');

    if (perfect) {
      gsap.set(player, { scaleX: 0.94, scaleY: 1.06, rotation: -1 });
      gsap.set(enemy, { x: -travel * 0.76, scaleX: 0.88, scaleY: 1.08, rotation: -3 });
      spawnGuardRing(player, true);
      spawnImpactBurst(enemy, { strong: true, perfect: true, incoming: false, slash: true });
      flashUnit(enemy, 'gold');
    } else if (blocked) {
      gsap.set(player, { scaleX: 0.96, scaleY: 1.04, rotation: -0.5 });
      gsap.set(enemy, { x: -travel * 0.66, scaleX: 0.9, scaleY: 1.06, rotation: -2 });
      spawnGuardRing(player, false);
      spawnImpactBurst(player, { strong: false, incoming: true, slash: false });
      flashUnit(player, 'white');
    } else {
      gsap.set(player, { x: -10, scaleX: 0.78, scaleY: 1.08, rotation: -5 });
      gsap.set(enemy, { x: -travel * 0.9, scaleX: 1.03, scaleY: 0.96, rotation: -1.5 });
      if (playerShadow) gsap.set(playerShadow, { scaleX: 1.2, opacity: 0.9 });
      spawnImpactBurst(player, { strong: false, incoming: true, slash: false });
      flashUnit(player, 'red');
      screenKick(1.15);
    }
    popFeedback();

    const timeline = makeTimeline({ units: [player, enemy], onComplete: () => {
      if (defeated) return;
      startIdle(player);
      startIdle(enemy, 0.44);
    } });
    timeline.addLabel('hit-stop', 0)
      .to({}, { duration: Math.max(0.036, hitStopMs / 1000) }, 'hit-stop')
      .addLabel('recovery', '>');
    if (perfect || blocked) {
      timeline.to(enemy, { x: travel * (perfect ? 0.18 : 0.1), scaleX: 0.91, scaleY: 1.03, rotation: 3, duration: reducedMotion ? 0.08 : 0.11, ease: 'power3.out' }, 'recovery')
        .to(player, { x: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: reducedMotion ? 0.08 : 0.18, ease: 'back.out(1.25)' }, 'recovery')
        .to(enemy, {
          x: defeated ? travel * 0.18 : 0,
          y: defeated ? 6 : 0,
          scaleX: defeated ? 0.9 : 1,
          scaleY: defeated ? 0.98 : 1,
          rotation: defeated ? 24 : 0,
          autoAlpha: defeated ? 0.72 : 1,
          duration: reducedMotion ? 0.09 : RECOVERY.enemy,
          ease: defeated ? 'power2.in' : 'back.out(1.4)',
        }, '>');
      if (playerShadow) timeline.to(playerShadow, { scaleX: 1, opacity: 0.72, duration: reducedMotion ? 0.08 : 0.18, ease: 'power2.out' }, 'recovery');
      if (enemyShadow && !defeated) timeline.to(enemyShadow, { scaleX: 1, opacity: 0.72, duration: reducedMotion ? 0.09 : RECOVERY.enemy, ease: 'power2.out' }, 'recovery');
    } else {
      timeline.to(enemy, { x: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: reducedMotion ? 0.08 : 0.12, ease: 'power2.out' }, 'recovery')
        .to(player, {
          x: -travel * 0.18,
          y: reducedMotion ? 0 : 3,
          scaleX: 0.94,
          scaleY: 1.045,
          rotation: -2,
          duration: reducedMotion ? 0.08 : 0.1,
          ease: 'power2.out',
        }, 'recovery')
        .to(player, {
          x: defeated ? -travel * 0.18 : 0,
          y: defeated ? 9 : 0,
          scaleX: defeated ? 0.92 : 1,
          scaleY: defeated ? 0.98 : 1,
          rotation: defeated ? -58 : 0,
          autoAlpha: defeated ? 0.55 : 1,
          duration: reducedMotion ? 0.1 : RECOVERY.player,
          ease: defeated ? 'power2.in' : 'back.out(1.35)',
        }, '>');
      if (playerShadow) timeline.to(playerShadow, { scaleX: defeated ? 0.82 : 1, opacity: defeated ? 0.48 : 0.72, duration: reducedMotion ? 0.1 : RECOVERY.player, ease: 'power2.out' }, '<');
    }
    return timeline;
  }

  function playBlock() {
    if (destroyed || !player) return;
    stopUnit(player);
    spawnGuardRing(player, false);
    const timeline = makeTimeline({ units: [player] });
    timeline.to(player, { y: reducedMotion ? 0 : 2, scaleX: 0.98, scaleY: 1.035, rotation: -0.6, duration: reducedMotion ? 0.08 : 0.13, ease: 'power2.out' }, 0)
      .to(player, { y: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: reducedMotion ? 0.09 : 0.18, ease: 'back.out(1.4)' }, '>');
  }

  function playPerfectBlock({ hitStopMs = 100, defeated = false } = {}) {
    return playEnemyImpact({ grade: 'PERFECT_GUARD' }, { hitStopMs, defeated });
  }

  function playHeal() {
    if (destroyed || !player) return;
    stopUnit(player);
    spawnHealEffect();
    const timeline = makeTimeline({ units: [player], onComplete: () => startIdle(player) });
    timeline.to(player, { y: reducedMotion ? -2 : -9, scaleX: 0.96, scaleY: 1.06, duration: reducedMotion ? 0.08 : 0.16, ease: 'power2.out' }, 0)
      .to(player, { y: 0, scaleX: 1, scaleY: 1, duration: reducedMotion ? 0.1 : 0.22, ease: 'back.out(1.7)' }, '>');
    if (playerShadow) timeline.to(playerShadow, { scaleX: reducedMotion ? 0.96 : 0.84, opacity: 0.52, duration: reducedMotion ? 0.08 : 0.16, ease: 'power1.out' }, 0)
      .to(playerShadow, { scaleX: 1, opacity: 0.72, duration: reducedMotion ? 0.1 : 0.22, ease: 'power2.out' }, '>');
  }

  function playDodge() {
    if (destroyed || !player) return;
    stopUnit(player);
    const timeline = makeTimeline({ units: [player], onComplete: () => startIdle(player) });
    timeline.to(player, { x: reducedMotion ? -3 : -18, y: reducedMotion ? 0 : -8, rotation: -4, scaleY: 1.04, duration: reducedMotion ? 0.08 : 0.12, ease: 'power2.out' }, 0)
      .to(player, { x: 0, y: 0, rotation: 0, scaleY: 1, duration: reducedMotion ? 0.1 : 0.21, ease: 'back.out(1.5)' }, '>');
  }

  function playDeath() {
    if (destroyed || !player) return;
    stopUnit(player);
    const timeline = makeTimeline({ units: [player] });
    timeline.to(player, { x: -10, y: 8, scaleX: 0.9, scaleY: 0.98, rotation: -62, autoAlpha: 0.52, duration: reducedMotion ? 0.12 : 0.28, ease: 'power2.in' }, 0);
    if (playerShadow) timeline.to(playerShadow, { scaleX: 0.8, opacity: 0.46, duration: reducedMotion ? 0.12 : 0.28, ease: 'power2.in' }, 0);
  }

  function playVictory() {
    if (destroyed || !player) return;
    stopUnit(player);
    const result = root?.querySelector('.active-timing-result__banner');
    spawnGuardRing(player, true);
    const timeline = makeTimeline({ units: [player] });
    timeline.addLabel('victory', 0)
      .to(player, { y: reducedMotion ? -3 : -15, scaleX: 0.91, scaleY: 1.12, rotation: -1.2, duration: reducedMotion ? 0.1 : 0.17, ease: 'power2.out' }, 'victory')
      .to(player, { y: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: reducedMotion ? 0.12 : 0.27, ease: 'back.out(1.8)' }, '>');
    if (playerShadow) timeline.to(playerShadow, { scaleX: reducedMotion ? 0.94 : 0.78, opacity: 0.44, duration: reducedMotion ? 0.1 : 0.17, ease: 'power1.out' }, 0)
      .to(playerShadow, { scaleX: 1, opacity: 0.72, duration: reducedMotion ? 0.12 : 0.27, ease: 'power2.out' }, '>');
    if (result) timeline.fromTo(result, { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: reducedMotion ? 0.1 : 0.2, ease: 'power2.out' }, 0.04);
  }

  function playDefeat() {
    if (destroyed) return;
    playDeath();
    const result = root?.querySelector('.active-timing-result__banner');
    if (result) gsap.fromTo(result, { y: -5, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: reducedMotion ? 0.1 : 0.22, ease: 'power2.out' });
  }

  function resetForReplay() {
    if (destroyed) return;
    for (const timeline of [...timelines]) killTimeline(timeline);
    for (const element of [...effectElements]) clearFxElement(element);
    for (const unit of allUnits) gsap.set(unit, { clearProps: 'transform,opacity,visibility' });
    for (const shadow of [playerShadow, enemyShadow].filter(Boolean)) gsap.set(shadow, { clearProps: 'transform,opacity,visibility' });
    for (const flash of root?.querySelectorAll('.active-timing-unit__flash') || []) gsap.set(flash, { clearProps: 'all' });
    if (arena) gsap.set(arena, { clearProps: 'transform' });
    playIdle();
  }

  function transition(previous, next, timing, baseHitStopMs = 70) {
    if (destroyed || !previous || !next) return;
    if (previous.phase === 'RESULT' && next.phase === 'PLAYER_CHOICE') {
      resetForReplay();
      return;
    }
    if (previous.phase === 'READY' && next.phase === 'PLAYER_CHOICE') playIdle();

    if (next.phase === 'PLAYER_TIMING' && next.action === 'ATTACK' && previous.phase !== 'PLAYER_TIMING') {
      playAttack({ timing });
    } else if (next.phase === 'PLAYER_TIMING' && next.action === 'SKILL') {
      if (previous.phase !== 'PLAYER_TIMING') playHeavyAttack({ timing, startedAt: null });
      else if (previous.timingStartedAt == null && next.timingStartedAt != null) playHeavyAttack({ timing, startedAt: next.timingStartedAt });
    }

    if (next.phase === 'PLAYER_IMPACT' && previous.phase !== 'PLAYER_IMPACT') {
      const feedback = next.feedback || {};
      const hitStopMs = impactHitStopMs(feedback, baseHitStopMs);
      playPlayerImpact(feedback, { hitStopMs, defeated: next.enemy.hp <= 0 });
    }

    if (next.phase === 'ENEMY_TELEGRAPH' && previous.phase !== 'ENEMY_TELEGRAPH') {
      if (next.feedback?.kind === 'item') playHeal();
      else if (next.feedback?.kind === 'guard') playBlock();
      playTelegraph(next.currentPattern);
    }

    if (next.phase === 'ENEMY_TIMING' && (previous.phase !== 'ENEMY_TIMING' || previous.defenseIndex !== next.defenseIndex)) {
      playDefenseTiming({ timing });
    }

    if (next.phase === 'ENEMY_IMPACT' && previous.phase !== 'ENEMY_IMPACT') {
      const feedback = next.feedback || {};
      const hitStopMs = impactHitStopMs(feedback, baseHitStopMs);
      if (feedback.grade === 'PERFECT_GUARD') playPerfectBlock({ hitStopMs, defeated: next.player.hp <= 0 });
      else playEnemyImpact(feedback, { hitStopMs, defeated: next.player.hp <= 0 });
    }

    if (next.phase === 'NEXT_TURN' && previous.phase !== 'NEXT_TURN') recover(allUnits, 0.2);
    if (next.phase === 'RESULT' && previous.phase !== 'RESULT') {
      if (next.outcome === 'VICTORY') playVictory();
      else playDefeat();
    }
  }

  function playMiss(feedback, hitStopMs, defeated) {
    return playPlayerImpact(feedback, { hitStopMs, defeated });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const timeline of [...timelines]) killTimeline(timeline);
    for (const element of [...effectElements]) clearFxElement(element);
    if (arena) gsap.set(arena, { clearProps: 'transform' });
  }

  return {
    playIdle,
    playAttack,
    playHeavyAttack,
    playHit: (feedback, hitStopMs, defeated) => playPlayerImpact(feedback, { hitStopMs, defeated }),
    playCriticalHit: (feedback, hitStopMs, defeated) => playPlayerImpact(feedback, { hitStopMs, defeated }),
    playMiss,
    playBlock,
    playPerfectBlock,
    playDodge,
    playHeal,
    playDeath,
    playVictory,
    playEnemyImpact,
    playTelegraph,
    playDefenseTiming,
    transition,
    destroy,
  };
}

# Threadbound Glossary

## Functional module

A part of Threadbound responsible for a capability such as Items, Combat, Quests, Economy, or Chat. A module can contain its own presentation, application operations, domain rules, and persistence code.

## Application service

Code that coordinates a player operation by loading state, invoking domain rules, and arranging persistence and result publication.

## Domain policy

A rule for valid gameplay or its outcomes, independent of browser rendering and database access.

## Repository

The persistence boundary that reads and saves authoritative state and implements transactional storage operations.

## Module contract

The operations and data a functional module exposes for another module to use without depending on its internal implementation.

## Arena combat

Automatic spatial combat where units choose targets, move, attack, and use role-specific abilities on an overhead battlefield. In cooperative encounters, the participating party members form the player team.

## Arena combat prototype

An experimental battle where the player arranges a team before combat, then units automatically choose targets, move, attack, and use skills on an arena battlefield.

## Arena formation

The player-chosen starting positions of participating characters on their team's deployment tiles.

## Combat loadout

The equipped items and abilities that determine a character's combat role and capabilities. Roles come from the loadout rather than a permanent character class.

## Healer

A loadout-based combat role whose ordinary actions restore injured allies' or its own HP and whose Mana skill provides stronger support. A healer attacks when healing is not needed and remains capable of solo combat.

## Arena repositioning

Autonomous movement during combat to reach targets, maintain distance, or support allies. It is distinct from choosing a starting formation.

## Overhead arena

A battlefield viewed from above, with upright character art anchored to ground positions by shadows. Characters retain their existing front-facing appearance while moving in two dimensions.

## Arena attack speed

The number of attacks or support casts a unit can perform per second when in range and stationary.

## Arena movement speed

The number of battlefield tiles a unit travels per second. It is independent of attack speed.

## Arc Manifest

A portable, untrusted content contract that may define narrative, encounters, rewards, and exact allowlisted visual asset references. Publication is explicit and validation remains authoritative.

## Source sheet

A project-owned AI-generated PNG containing multiple pieces of source art. Source sheets are retained as editable masters and are not fetched by gameplay UI.

## Visual asset

A presentation resource identified by a stable, canon-neutral `visualAssetId`. A visual asset describes what an image depicts; it does not define gameplay behavior or canonical identity.

## Visual asset catalog

The versioned allowlist of visual assets, including their kind, neutral label, description, tags, runtime URL, dimensions, and provenance.

## Runtime asset

A tightly cropped, lossless WebP derived deterministically from a source sheet. Runtime filenames contain a content hash and may be cached immutably.

## Canonical visual mapping

A presentation-layer association between a Threadbound entity ID and a `visualAssetId`. It is separate from the domain model so canon and art can evolve independently.

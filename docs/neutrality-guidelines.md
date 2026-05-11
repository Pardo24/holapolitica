# Neutrality guidelines

This document explains **why** the project does not implement features that other civic tech projects often add. It is meant to be referenced when discussing new features.

## Core principle: mirror, not megaphone

Monitor Parlamentari is **civic infrastructure**, not an opinion platform. Its authority — the thing that makes it citable by serious journalists and defensible before institutional funders — comes from being neutral, not from being loud.

Mirrors show reality as it is. Megaphones amplify opinions. There is room for both in the world, but they are different products with different value propositions and different paths to impact. We are building a mirror.

## What this means in practice

We do **not** implement:

### User reactions, likes, votes or polls

Even when innocently framed, features like "what would you have voted?" or thumbs-up/down on initiatives produce **aggregate output that reads as public opinion** but is actually a self-selected, unweighted, easily brigaded sample. This is the mechanism by which open polls have repeatedly produced misleading data over the last decade. Any aggregate published from our domain becomes the citation, not the actual parliamentary votes.

### User comments

Comment sections on political content are notoriously difficult to moderate. Beyond the time cost, they create legal exposure (defamation, GDPR responsibilities under the Digital Services Act). They also dilute the editorial purity of the data. There are plenty of places online to discuss politics — we don't need to add another.

### Editorial value judgements

We never label a vote, law or representative as "good" or "bad". We never use words like "voted against the people" or "courageously defended". The system reports what happened: who voted what on what initiative, with what result. Interpretation is left to journalists and citizens.

### Asymmetric rankings

When we publish comparative metrics (which groups vote together most often, which representatives have the lowest attendance), we publish them as **complete matrices** or **paired rankings** (lowest + highest), never one-sided. Otherwise we'd be choosing a narrative.

## Why we hold this line

1. **Authority.** Civio, AOC and serious journalists won't cite a project that mixes data with opinion. Neutrality is the prerequisite for being useful in civic discourse.
2. **Legal safety.** Aggregating public data for transparency is solidly within Spanish and European law. Editorialising introduces defamation and potentially DSA-flagged content moderation duties.
3. **Sustainability.** Engagement-driven sites must constantly feed the engagement loop. Infrastructure-driven sites build trust over years and become permanent fixtures.
4. **Resistance to capture.** A neutral platform can't easily be co-opted by either side of the political spectrum. An opinionated one will be called out the moment its bias becomes visible.

## What we do instead — alternative ways to channel the same energy

When users want to participate, comment or react, we channel that into:

- **Sharing** social cards via Twitter/Bluesky/Instagram. The opinion lives on those platforms, not ours.
- **Newsletter** subscriptions where users receive curated facts.
- **Topic and person alerts** so users feel "tracked in" without contributing content.
- **Embed widgets** that media outlets use, multiplying reach via journalism.
- **Aggregated metrics** where users discover patterns themselves.

## Exceptions and edge cases

- **Spelling/data corrections** from users are welcome. We treat these as bug reports, not "comments".
- **Methodology feedback** is welcome via dedicated channels (issue tracker, email). It does not appear publicly.
- **Experimental microsites** with different rules are allowed — but they must use a different brand and domain. They do not contaminate the main project.

## When this document conflicts with a feature request

The document wins. If a feature request requires bending these guidelines, the feature is wrong, not the guidelines. The exception is if Daniel and the project's institutional partners explicitly decide to update this document — but that should be a deliberate, communicated decision, not a quiet drift.

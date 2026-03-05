---
name: solana-mobile
description: Guide Solana Mobile development and publishing work using the official Solana Mobile documentation set. Use when Codex needs to integrate Mobile Wallet Adapter in React Native, Kotlin, Flutter, Unity, Unreal, or web apps; detect Seeker users; work with Solana Mobile sample apps and recipes; prepare and sign Android APKs; publish or update apps in the Solana dApp Store; or answer policy and compliance questions about the Solana Mobile Developer Agreement, Publisher Policy, Privacy Policy, and Terms of Use.
---

# Solana Mobile

## Overview

Use this skill to route Solana Mobile requests to the right official documentation quickly and to keep answers grounded in the Solana Mobile docs set.

This skill is intentionally lean. It stores a curated doc map, workflow guidance, and dated policy references based on the source list provided by the user. For exact commands, policy text, or submission requirements, open the linked official page before giving final instructions.

## Choose the right lane

Classify the request before loading references:

1. Use [`references/publishing.md`](references/publishing.md) for dApp Store publishing, APK signing, App NFT or Release NFT steps, new submissions, updates, Google Play migration, and publisher portal work.
2. Use [`references/development.md`](references/development.md) for setup and platform integration questions covering React Native, Kotlin, Flutter, web, Unity, Unreal, and Mobile Wallet Adapter.
3. Use [`references/recipes-and-samples.md`](references/recipes-and-samples.md) for Seeker detection, authorization caching, Wallet Standard migration, Anchor integration, device testing, or sample app discovery.
4. Use [`references/policies.md`](references/policies.md) for agreement, publisher policy, privacy, and terms questions. Treat these as time-sensitive and cite exact dates.
5. Use [`references/doc-map.md`](references/doc-map.md) when the request is broad, ambiguous, or starts as "what docs should I read?"

## Workflow

1. Inspect the local repo first. Identify the stack before suggesting implementation steps.
2. Pick the minimum reference file needed for the task. Load more only if the request crosses lanes.
3. Prefer official Solana Mobile pages as primary sources. Do not invent unpublished CLI flags, policy requirements, or SDK behavior.
4. Separate stable guidance from dated guidance. SDK setup patterns are usually durable; policies and store rules are not.
5. When a request involves publishing, explicitly identify whether it is:
   - a new app submission
   - an update to an existing app
   - a migration from Google Play
   - a web app wrapped as a PWA APK
6. When a request involves wallet support, explicitly identify whether it is:
   - React Native or Expo with Mobile Wallet Adapter
   - Kotlin Android with the Kotlin MWA client
   - web with Mobile Wallet Standard or MWA
   - direct MWA session handling
7. When the user asks for the "latest" policy or terms, verify against the official Solana Mobile docs before quoting or making compliance claims.

## Answering guidance

- Cite doc titles, not just raw URLs, so the user can follow the reasoning.
- Mention exact effective dates for policy pages when relevant.
- If the provided source list does not include the detailed answer, say that clearly and point to the exact official page that should be opened next.
- For implementation work, translate the docs into the user's stack and repo structure instead of repeating generic platform setup.
- For publishing work, call out prerequisites early: signed APK, App NFT, Release NFT, portal or CLI path, and review submission path.

## Common triggers

This skill should trigger for requests like:

- "Integrate Solana Mobile wallet support into this React Native app."
- "How do I publish this Android app to the Solana dApp Store?"
- "What is required to mint an App NFT or Release NFT?"
- "Which Solana Mobile docs cover Seeker detection?"
- "How do I migrate a Google Play app to the Solana dApp Store?"
- "What changed in the Solana Mobile dApp Store agreement?"

## Reference inventory

- [`references/doc-map.md`](references/doc-map.md): Full categorized document map.
- [`references/development.md`](references/development.md): Setup and SDK docs by platform.
- [`references/publishing.md`](references/publishing.md): Submission, signing, NFTs, and store workflows.
- [`references/recipes-and-samples.md`](references/recipes-and-samples.md): Practical recipes and sample app links.
- [`references/policies.md`](references/policies.md): Dated legal and policy references.

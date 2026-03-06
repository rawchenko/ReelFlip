---
name: mobile-design
description: Design and critique mobile product experiences across Android, iOS, and cross-platform apps. Use when Codex needs to create or refine mobile UI concepts, user flows, wireframes, high-fidelity mockups, navigation patterns, design systems, interaction details, accessibility improvements, dark mode themes, motion guidance, or developer handoff specs for phones and tablets.
---

# Mobile Design

## Overview

Use this skill to turn vague mobile design requests into concrete, buildable product direction. Favor practical outputs such as screen specs, user flows, component rules, copy guidance, motion notes, and handoff-ready implementation details.

## Choose the right lane

Load only the reference file needed for the request:

1. Use [`references/fundamentals.md`](references/fundamentals.md) for visual hierarchy, color, typography, spacing, accessibility, or critique of an existing screen.
2. Use [`references/mobile-patterns.md`](references/mobile-patterns.md) for Android-first layouts, navigation, responsive behavior, touch ergonomics, dark mode, theming, or platform guidance.
3. Use [`references/ux-and-prototyping.md`](references/ux-and-prototyping.md) for user research, journeys, information architecture, wireframes, prototypes, usability testing, or iteration plans.
4. Use [`references/design-systems-and-handoff.md`](references/design-systems-and-handoff.md) for component libraries, motion, interaction feedback, developer collaboration, or design-system scaling.

## Workflow

1. Inspect the product context first. Identify the platform, audience, main task, existing design language, and technical constraints before proposing UI changes.
2. Decide the fidelity level. Clarify whether the user needs a critique, low-fidelity wireframe, polished screen concept, interaction spec, or developer handoff.
3. Anchor the design around one primary user goal per screen. Remove secondary actions or demote them when they compete with the main job.
4. Prefer mobile-native patterns over desktop habits. Design for one-handed use, short attention spans, and constrained viewport height.
5. Preserve platform expectations unless the product has a strong existing system. Respect Material-style structure on Android and note when iOS-specific treatment may differ.
6. Treat accessibility as a design constraint, not a polish pass. Check contrast, type scaling, touch target size, reading order, motion sensitivity, and state clarity.
7. When the user asks for Figma output, provide a Figma-ready spec: frame list, component inventory, token suggestions, spacing rules, and interaction notes. When the user asks for paper, simplify into fast low-fidelity sketches and call out what to test.

## Output shapes

Match the response to the work:

- For critiques, list the highest-impact issues first, then propose concrete changes and explain the expected UX gain.
- For new screens, provide screen purpose, hierarchy, layout regions, interaction states, and component behavior.
- For user flows, provide entry point, step sequence, branch conditions, empty states, failure states, and success states.
- For design systems, provide reusable components, variants, tokens, usage rules, and anti-patterns.
- For handoff, provide dimensions only when they matter; prioritize spacing logic, alignment rules, states, and implementation intent.

## Design rules

- Start with content and task flow before decoration.
- Use typography and spacing to create hierarchy before adding more color or chrome.
- Keep navigation stable across adjacent screens.
- Avoid hidden gestures unless there is a visible backup path.
- Make destructive actions explicit and reversible when possible.
- Use motion to explain state changes, not to entertain.
- Mention performance tradeoffs when suggesting blur, video, large shadows, or heavy animation.

## Common triggers

This skill should trigger for requests like:

- "Design a better Android home screen for this app."
- "Critique this mobile UI for accessibility and hierarchy issues."
- "Turn this feature idea into a wireframe and user flow."
- "Create a design system direction for our React Native app."
- "Define dark mode behavior and component tokens."
- "Write a developer handoff spec for this mobile redesign."

## Reference inventory

- [`references/fundamentals.md`](references/fundamentals.md): Core visual and accessibility principles.
- [`references/mobile-patterns.md`](references/mobile-patterns.md): Mobile layout, navigation, theming, and platform guidance.
- [`references/ux-and-prototyping.md`](references/ux-and-prototyping.md): Research, journeys, IA, wireframing, testing, and iteration.
- [`references/design-systems-and-handoff.md`](references/design-systems-and-handoff.md): Components, motion, collaboration, and implementation handoff.

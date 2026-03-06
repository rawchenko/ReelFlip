# Mobile Patterns

## Table of contents

1. Platform direction
2. Responsive and adaptive layout
3. Navigation patterns
4. Touch-first interaction
5. Dark mode and theming
6. Performance-aware design

## Platform direction

- Start by asking whether the product should feel Android-native, iOS-native, or intentionally cross-platform.
- On Android-first work, favor clear app bars, predictable navigation, strong list structure, and Material-influenced feedback patterns.
- Note platform differences when they matter, but avoid designing two separate apps unless the requirement is explicit.

## Responsive and adaptive layout

- Design for common phone widths first, then describe how the layout stretches to large phones, foldables, or tablets.
- Let content reflow rather than scale down until it becomes illegible.
- Promote secondary panels or richer side-by-side layouts only when the screen size actually supports them.
- Define safe behavior for compact height situations such as keyboards, split-screen, or devices with tall system UI.

## Navigation patterns

- Use bottom navigation for a small set of peer destinations.
- Use top tabs for closely related views inside a section.
- Use progressive disclosure when a flow is deep or decision-heavy.
- Keep the back path obvious. Do not trap users in modal layers without a clear exit.
- Avoid changing navigation models between adjacent parts of the product unless the context changes sharply.

## Touch-first interaction

- Make primary actions easy to reach and easy to understand.
- Avoid tiny icons without labels for important actions.
- Provide visible pressed, drag, loading, and completion feedback.
- Do not hide core actions behind swipe-only interactions unless the screen also exposes them explicitly.
- Use confirmation or undo for destructive actions.

## Dark mode and theming

- Treat dark mode as a full theme, not a simple inversion.
- Preserve hierarchy through surface elevation, contrast, and restrained accent color usage.
- Test illustrations, charts, and status colors in both light and dark contexts.
- Define semantic tokens for surfaces, text, borders, focus, success, warning, and error.

## Performance-aware design

- Prefer crisp structure over heavy decoration when performance is uncertain.
- Use blur, gradients, shadows, and motion intentionally; call out lower-cost fallbacks when needed.
- Consider network and device constraints when proposing autoplay video, dense image grids, or live visual effects.

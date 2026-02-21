# ReelFlip — Design System

## Design Philosophy

ReelFlip is a **dark-first, gesture-driven** mobile trading app. The aesthetic draws from TikTok's vertical feed UX crossed with Bloomberg-style financial data density. Every interaction should feel instant and satisfying.

### Design Principles

1. **Thumb-first** — All primary actions reachable by one thumb
2. **Glanceable** — Key data (price, change %) visible in < 1 second
3. **Addictive** — Smooth transitions, haptic feedback, pull-to-refresh
4. **Trust through clarity** — Clear trade confirmations, no hidden actions

---

## Color Palette

### Core

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0A0A0F` | App background |
| `--bg-card` | `#14141F` | Card / surface background |
| `--bg-elevated` | `#1E1E2E` | Modal, bottom sheet |
| `--border` | `#2A2A3A` | Subtle dividers |

### Brand

| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#7C5CFC` | Primary actions, active states |
| `--accent-hover` | `#9B7FFF` | Button hover / press state |

### Semantic

| Token | Hex | Usage |
|-------|-----|-------|
| `--green` | `#00E676` | Positive price change, buy |
| `--red` | `#FF5252` | Negative price change, sell |
| `--yellow` | `#FFD740` | Warnings, caution |
| `--text-primary` | `#F0F0F5` | Primary text |
| `--text-secondary` | `#8888A0` | Labels, captions |
| `--text-muted` | `#555570` | Disabled text |

---

## Typography

Use system fonts for performance (no custom font loading).

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| Display | 32px | Bold (700) | Token symbol on card |
| Title | 24px | SemiBold (600) | Section headers |
| Headline | 20px | SemiBold (600) | Card title, price |
| Body | 16px | Regular (400) | General content |
| Caption | 13px | Regular (400) | Labels, timestamps |
| Mono | 14px | Medium (500) | Addresses, amounts (use monospace) |

---

## Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight inline spacing |
| `sm` | 8px | Between related elements |
| `md` | 16px | Standard padding / gaps |
| `lg` | 24px | Section separation |
| `xl` | 32px | Large section gaps |
| `card-radius` | 16px | Card border radius |
| `button-radius` | 12px | Button border radius |

---

## Component Patterns

### Token Feed Card (Full-screen)

```
┌─────────────────────────────────┐
│  [Token Icon]  SOL/USDC   ▲12% │  ← header
│                                 │
│  ┌─────────────────────────┐    │
│  │                         │    │
│  │      Price Chart        │    │  ← sparkline / candlestick
│  │      (60% height)       │    │
│  │                         │    │
│  └─────────────────────────┘    │
│                                 │
│  $142.58        Vol: $2.1B      │  ← stats row
│  MCap: $65B     24h: +4.2%     │
│                                 │
│  ┌──────────┐  ┌──────────┐    │
│  │   BUY    │  │   SELL   │    │  ← action buttons
│  │  (green) │  │  (red)   │    │
│  └──────────┘  └──────────┘    │
└─────────────────────────────────┘
```

- Card fills viewport (minus safe areas)
- Swipe up → next token
- Swipe down → previous token
- Tap chart → expand to full detail

### Bottom Tab Bar

```
┌────────┬────────┬────────┐
│  Feed  │ Portf. │ Wallet │
│  (🔥)  │  (📊) │  (👛) │
└────────┴────────┴────────┘
```

- 3 tabs maximum for simplicity
- Active state: `--accent` icon + label
- Inactive: `--text-muted`

### Trade Confirmation (Bottom Sheet)

```
┌─────────────────────────────────┐
│        Buy 0.5 SOL              │
│                                 │
│  Price:          $142.58        │
│  Amount:         0.5 SOL        │
│  Total:          $71.29         │
│  Slippage:       0.5%           │
│                                 │
│  ┌─────────────────────────┐    │
│  │     CONFIRM (slide)     │────│  ← slide-to-confirm
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

- Uses slide-to-confirm to prevent accidental trades
- Haptic feedback on confirm

---

## Animation Guidelines

| Animation | Duration | Easing | Library |
|-----------|----------|--------|---------|
| Card swipe | 300ms | `Easing.bezier(0.25, 0.1, 0.25, 1)` | `react-native-reanimated` |
| Bottom sheet | 250ms | spring (damping: 15) | `react-native-reanimated` |
| Price flash | 200ms | linear | `react-native-reanimated` |
| Button press | 100ms | ease-out | `react-native-reanimated` |
| Haptic | — | — | `expo-haptics` |

### Gesture Map

| Gesture | Action |
|---------|--------|
| Swipe up | Next token in feed |
| Swipe down | Previous token |
| Tap card | Open token detail |
| Long press card | Quick-add to watchlist |
| Double tap | Quick buy (if enabled in settings) |
| Pull down (at top) | Refresh feed |

---

## Icon Strategy

Use `@expo/vector-icons` (MaterialCommunityIcons, Ionicons) for all icons. No external icon packages needed.

Common icons:
- Trending up/down: `trending-up` / `trending-down`
- Buy: `cart-plus` or `arrow-up-circle`
- Sell: `cart-minus` or `arrow-down-circle`
- Wallet: `wallet`
- Settings: `cog`
- Refresh: `refresh`
- Chart: `chart-line`

---

## Existing Styles (from `app-styles.ts`)

Already defined and should be extended (not replaced):

```ts
appStyles.card    // White bg, border, rounded, padding 4
appStyles.screen  // flex: 1, gap 16, horizontal padding 8
appStyles.stack   // gap 8
appStyles.title   // 20px bold
```

> **Note**: Current styles are light-mode defaults from the template. They need to be overridden with the dark theme above when building the actual UI.

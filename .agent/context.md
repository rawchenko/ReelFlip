# ReelFlip — Project Context

## Hackathon: Monolith (Solana Mobile Hackathon #2)

- **Organizers**: Solana Mobile & Radiants
- **Dates**: Feb 2 – March 9, 2026
- **Results**: Early April 2026
- **Submission deadline**: **March 9, 2026**

### Prizes ($125,000+ total)

| Tier | Amount | Count |
|------|--------|-------|
| Winner | $10,000 USD | 10 |
| Honorable Mention | $5,000 USD | 5 |
| SKR Bonus Track | $10,000 in SKR | 1 |

Additional: Featured dApp Store placement (100K+ eyeballs) + marketing/launch support.

### Submission Requirements

All submissions **must** include:

1. **Functional Android APK**
2. **GitHub repository** with source code
3. **Demo video** showcasing functionality
4. **Pitch deck** or brief presentation

### Judging Criteria (25% each)

1. **Stickiness & PMF** — Resonance with Seeker community, daily engagement
2. **User Experience** — Polished, intuitive mobile-first design
3. **Innovation / X-Factor** — Novelty and creativity
4. **Presentation & Demo Quality** — Clarity of vision, demo quality

Technical evaluation also considers: GitHub commit depth, mobile-specific features, Solana network interaction.

### Rules

- Projects must have started within 3 months of hackathon launch
- No outside capital
- Must be mobile-optimized Android app (not just a PWA wrapper)
- Existing projects allowed only with significant new mobile development during hackathon
- **Winners must publish on Solana dApp Store** to claim prizes
- Must be 18+ to participate

---

## App Concept: ReelFlip

**TikTok-style crypto trading on Solana.**

Vertical-swipe feed of tokens and memecoins. Users scroll through cards showing live price charts, sentiment, and volume — then buy or sell with one tap. The core loop is: **Discover → Evaluate → Trade → Scroll**.

### Target User

- Degen traders on Solana mobile (Seeker device owners)
- Users who want quick, high-frequency memecoin trading on the go
- TikTok-native generation comfortable with vertical scroll UX

### Key Differentiators (Hackathon Fit)

- **Stickiness**: Addictive scroll mechanic creates daily engagement
- **UX**: Native mobile-first, gesture-driven — not a web port
- **Innovation**: Merges social-feed UX with DeFi trading
- **Mobile**: Built for Solana Seeker, uses MWA natively

---

## Platform: Solana Mobile

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Expo SDK 54 + React Native 0.81 |
| Routing | expo-router (file-based) |
| Wallet | Mobile Wallet Adapter via `@wallet-ui/react-native-kit` |
| Solana SDK | `@solana/kit` v5 |
| State | `@tanstack/react-query` v5 |
| Crypto | `react-native-quick-crypto` |
| Animations | `react-native-reanimated` v4 |
| Gestures | `react-native-gesture-handler` |

### Key Solana Mobile Docs

- [Development Setup](https://docs.solanamobile.com/get-started/development-setup.md)
- [Create a Project](https://docs.solanamobile.com/get-started/react-native/create-solana-mobile-app.md)
- [MWA Setup](https://docs.solanamobile.com/get-started/react-native/setup.md)
- [MWA Quickstart](https://docs.solanamobile.com/get-started/react-native/quickstart.md)
- [Build & Sign APK](https://docs.solanamobile.com/dapp-store/build-and-sign-an-apk.md)
- [Submit to dApp Store](https://docs.solanamobile.com/dapp-store/submit-new-app.md)
- [Detect Seeker Users](https://docs.solanamobile.com/recipes/general/detecting-seeker-users.md)

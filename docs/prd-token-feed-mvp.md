# PRD (MVP) - ReelFlip Token Feed

Date: February 24, 2026  
Status: Draft  
Product: ReelFlip

## 1. Overview

Concept: an infinite, TikTok-style vertical feed where each post is a token launch/trading card. Users swipe to discover tokens and can buy/sell in 1-2 taps via wallet. No video in MVP; token cards are the content.

Primary chain (MVP assumption): Solana (can be abstracted later).

## 2. Goals and Non-Goals

### Goals (MVP)

- Make token discovery as fast and addictive as short-form video: swipe -> understand -> act.
- Enable low-friction trading directly from the feed (buy/sell, presets, clear transaction status).
- Provide basic trust and safety to reduce obvious scams and abusive metadata.
- Ship a stable launchpad/trading loop that supports:
- Token creation (launch)
- Bonding-curve trading
- Graduation state (migration can be Phase 2 if needed)

### Non-Goals (MVP)

- Video uploads, livestreams, creator video pitches.
- Advanced social graph (DMs, group chats).
- Complex recommendation ML models (rules-based ranking only).
- Full KYC/fiat on-ramps (wallet-only).

## 3. Target Users and Core Use Cases

### User types

1. Traders (degens): scroll, spot momentum, buy quickly, watchlist, share.
2. Creators/Deployers: launch a token quickly, track progress, share it.
3. Scouts/Observers: browse trends, follow categories, avoid risky tokens.

### Top use cases

- UC1: User opens app -> swipes feed -> buys a token using preset amounts.
- UC2: User discovers a token -> watchlists it -> gets notified if it nears graduation (optional in MVP).
- UC3: Creator launches token -> it appears in New feed -> trading starts immediately.

## 4. Success Metrics (MVP)

### Activation

- Percentage of users who connect wallet in first session.
- Percentage of users who watchlist or trade within first 10 swipes.

### Engagement

- Swipes/session, sessions/day.
- Token-card dwell time (median).
- Hide/Not interested rate (quality signal).

### Trading

- View-to-trade conversion rate.
- Trade success rate (confirmed transaction / initiated transaction).
- Volume/day, fees/day.
- Failed transaction reasons distribution (slippage, RPC, user reject).

### Trust and Safety

- Report rate per 1,000 views.
- Percentage of tokens flagged/removed.
- Repeat-offender creator rate.

## 5. MVP Scope (Features)

### 5.1 Feed (TikTok UX)

Feeds:

- For You (MVP rules-based): mixed ranking of hot + new + near-graduation with personalization signals.
- New: chronological launches.
- Hot: momentum-ranked.
- Near Graduation: tokens close to threshold.
- Following/Curated: Phase 2 (optional).

Core interactions:

- Vertical swipe navigation (one token per screen).
- Preload next 2-3 cards for snappy UX.
- Quick actions: Like (optional), Watchlist, Share, Report, Hide.

Acceptance criteria:

- Time-to-first-card < 1.5s on average network.
- Swipe latency feels instant (no spinners between cards in normal conditions).
- Offline/poor network gracefully degrades (cached cards, retry state).

### 5.2 Token Card (Full-screen post)

Displayed data (MVP):

- Token name, ticker, image, short description.
- Price, market cap (estimated), 24h volume (or since-launch volume), transaction count.
- Graduation progress bar (bonding-curve progress).
- Mini tape of last N buys/sells (size, time ago) or simple sparkline (optional).

Risk label (MVP, rules-based):

- High Risk default for all; additional flags if certain on-chain checks fail (see Trust and Safety).

Acceptance criteria:

- Data refreshes within 3-10 seconds of on-chain events (best effort).
- Clear what-is-this-token info in < 2 seconds of reading.

### 5.3 Trading (1-2 tap buy/sell)

Wallet:

- Connect Solana wallet (popular providers).
- Show balance, estimated fees.

Buy/Sell flow:

- Presets: 0.1 / 0.5 / 1 / 2 SOL (configurable).
- Custom amount input.
- Slippage control (Low/Med/High presets + advanced input).
- Clear transaction states: pending -> confirmed/failed.
- Retry UX on failure.

Safety UX:

- You may lose everything warning on first trade + settings toggle afterward.
- Show expected output range (min received) and fee estimate.

Acceptance criteria:

- Initiate trade from token card in <= 2 taps after wallet connected.
- Show pending state within 300ms after user confirms in wallet.
- Confirmed/failed state updates without manual refresh.

### 5.4 Launch Token (Post creation)

Launch flow:

- Name, ticker, image upload, description.
- Terms checkbox + risk disclosure.
- Fixed template parameters for bonding curve (MVP): no custom curve.
- Launch fee (configurable), displayed upfront.

Post-launch:

- Redirect to token page/card.
- Share link (deeplink).

Acceptance criteria:

- Create token in < 2 minutes end-to-end (excluding wallet confirmations).
- Immediate appearance in New feed after confirmed creation.

### 5.5 Graduation (State + UI)

MVP supports the state and UI indicator; actual migration can be:

- Option A (preferred): automatic migration to a DEX pool once threshold hit.
- Option B (MVP-lite): mark Graduated and show external DEX link; migration ops handled by backend/admin in Phase 2.

Acceptance criteria:

- Graduation progress accurate and not easily spoofable.
- Clear badge: Graduated + what it means.

### 5.6 Trust and Safety (Minimum viable)

User actions:

- Report token (reasons: scam, abusive content, impersonation, illegal, spam).
- Hide token / Not interested.
- Block creator (Phase 2 if creator identity exists).

Automated checks (MVP):

- Metadata moderation: basic text blacklist + image hash checks.
- Rate limiting token creation per wallet/device/IP.
- Basic manipulation flags (heuristics):
- Excessive self-trading indicators.
- Repeated launches by same wallet in short time.

Admin tools (internal):

- Token list with flags/reports and quick actions: hide from feeds, mark unsafe, delist metadata, ban creator wallet (policy-defined).

Acceptance criteria:

- Report submitted in <= 2 taps.
- Admin can delist/hide a token from feeds within minutes.
- Logs retained for moderation decisions.

## 6. Recommendation and Ranking (Rules-based MVP)

Candidate pools:

- New launches (time-decay).
- Hot (momentum).
- Near graduation.
- Personalized boosts based on watchlist, buys/sells, dwell time, and hide/not interested.

Scoring (illustrative):

- Score = w1 * momentum + w2 * conversion + w3 * completion(dwell) - w4 * reports - w5 * instant-skip + diversity penalty.

Constraints:

- Diversity: limit same creator/wallet frequency.
- Safety: down-rank flagged tokens.
- Exploration: guarantee X% of New items in For You.

## 7. User Journeys (MVP)

### J1: First-time user

1. Open -> sees feed (no login required).
2. Prompt: Connect wallet to trade (skip allowed).
3. Swipes 10-20 tokens.
4. Watchlists one token.
5. Connects wallet -> buys with preset.

### J2: Trader loop

1. Open For You -> swipe until signal.
2. Tap Buy preset -> confirm wallet.
3. Sees pending -> confirmed.
4. Adds to watchlist or shares.

### J3: Creator launch

1. Tap Create -> fill fields -> confirm.
2. Token appears in New feed.
3. Shares link externally.

## 8. Requirements

### 8.1 Functional

- Feed endpoints: list tokens with ranking + pagination.
- Token detail endpoint: metrics + last trades + risk flags.
- Trading: client constructs transaction or requests from backend (depending on design).
- Launch: create token instructions + metadata upload.
- Reporting: submit report + moderation workflow.

### 8.2 Non-Functional

- Performance: feed response p95 < 300ms (cached), < 800ms (uncached).
- Reliability: degrade gracefully if indexer lags.
- Security: protect treasury, rate limit, audit smart contracts.
- Observability: logs + metrics + alerts for transaction failure spikes, indexer lag, abuse.

## 9. Data and Analytics (Event Tracking)

Feed:

- `app_open`, `feed_view`, `card_impression` (token_id, rank_position).
- `swipe_next` (token_id_from -> token_id_to).
- `card_dwell_time` (token_id, ms).
- `hide_token`, `report_token`.

Trading:

- `wallet_connect_start` / `wallet_connect_success` / `wallet_connect_fail`.
- `trade_click` (buy/sell, preset/custom).
- `trade_submit` (amount, slippage).
- `trade_confirmed` / `trade_failed` (reason).

Launch:

- `launch_start`, `launch_submit`, `launch_success` / `launch_fail`.

## 10. Technical Architecture (High-level)

On-chain:

- Program for:
- Token creation + bonding curve state.
- Buy/sell execution + fees.
- Graduation threshold state (migration optional MVP).

Off-chain:

- Indexer:
- Listens to on-chain events (launch/buy/sell/graduation).
- Updates aggregates in DB.
- API service:
- Feed ranking.
- Token details.
- Reports/moderation.
- Storage:
- Metadata/images on object storage + CDN.
- Admin:
- Moderation dashboard.

## 11. Risks and Mitigations

Scams and abusive content:

- Mitigation: default high-risk warnings, rapid delist tooling, metadata moderation, rate limits.

Bots and manipulation:

- Mitigation: heuristics + down-ranking, creation limits, trade anomaly detection.

Indexer lag / incorrect metrics:

- Mitigation: show data delayed indicator, fallback to on-chain reads for critical values, monitoring.

Legal/regulatory:

- Mitigation: clear disclaimers, geo restrictions where needed, no promises of profit, documented policies.

## 12. Rollout Plan

1. Closed alpha (invite-only): validate feed UX + trading success rates.
2. Soft launch (limited geo/community): iterate on ranking and trust and safety.
3. Public beta: expand, add creator tools and more safety controls.
4. Phase 2: limited video pitches (opt-in, strict moderation), following feed, curated lists.

## 13. Out of Scope (Phase 2+)

- Video/streaming pitches.
- Creator monetization / revenue share (or only after anti-wash trading).
- Advanced ML recommendations.
- Cross-chain support.
- In-app fiat on-ramp.

## 14. Alignment with Current ReelFlip App (February 24, 2026)

Overall status: partially aligned.

What is aligned now:

- Solana + Mobile Wallet Adapter foundation is in place in app providers and account features.
- Vertical swipe feed UX exists (`FlatList` with paging, one token card per screen).
- Backend feed API exists (`GET /v1/feed`) with ranking, cursor pagination, cache layer, and fallback seed feed.
- Token cards already show core market stats and a risk tier badge.

What is only partially aligned:

- Feed taxonomy differs: current categories are `trending`, `gainer`, `new`, `memecoin`; PRD expects For You/Hot/New/Near Graduation.
- Risk labeling exists, but current heuristic is market-data based and not yet tied to moderation/reporting workflows.
- Discover and Portfolio tabs exist but are placeholders.

What is not aligned yet (major gaps):

- No in-feed buy/sell flow, quote, trade build/submit, slippage controls, or transaction state UI in shipped code.
- No token launch/create flow in app or backend.
- No graduation threshold state or UI indicator in current runtime.
- No reporting endpoint, hide/not-interested action persistence, or moderation dashboard.
- No event analytics instrumentation for the PRD event schema.
- No indexer pipeline for launch/buy/sell/graduation lifecycle; current live source is DexScreener API + static fallback.

Conclusion:

- Directionally aligned with ReelFlip vision and `docs/system-design.md`, but implementation is currently Phase 1 feed-only. The PRD is a valid target-state MVP, not a reflection of fully implemented behavior today.

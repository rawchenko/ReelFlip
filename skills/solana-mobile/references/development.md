# Development References

Use this file for implementation questions, SDK selection, or platform-specific setup.

## Start here

- [Developer Documentation](https://docs.solanamobile.com/get-started/overview.md): Main entry point for development docs.
- [Development Setup](https://docs.solanamobile.com/get-started/development-setup.md): Environment and local setup.
- [FAQ](https://docs.solanamobile.com/get-started/faq.md): Good first stop for common setup questions.
- [Development community](https://docs.solanamobile.com/get-started/community.md): Official community and support paths.

## Mobile Wallet Adapter foundations

- [Mobile Wallet Adapter](https://docs.solanamobile.com/get-started/mobile-wallet-adapter.md): High-level protocol overview.

Use this before answering any wallet-connect, signing, or session lifecycle question.

## React Native and Expo

- [Create a Project](https://docs.solanamobile.com/get-started/react-native/create-solana-mobile-app.md): Template-based starting point.
- [Installation](https://docs.solanamobile.com/get-started/react-native/installation.md): Install `@wallet-ui/react-native-web3js`.
- [Setup](https://docs.solanamobile.com/get-started/react-native/setup.md): Configure `MobileWalletProvider` and hooks.
- [Quickstart](https://docs.solanamobile.com/get-started/react-native/quickstart.md): Connect, sign messages, and send transactions.
- [Invoke MWA Sessions Directly](https://docs.solanamobile.com/get-started/react-native/invoke-mwa-sessions-directly.md): Lower-level control when the higher-level hooks are not enough.
- [Mobile Wallet Adapter Typescript Reference](https://docs.solanamobile.com/get-started/react-native/mobile-wallet-adapter.md): API reference for TypeScript usage.

## Kotlin Android

- [Installation](https://docs.solanamobile.com/get-started/kotlin/installation.md): Add the Solana Kotlin libraries.
- [Setup](https://docs.solanamobile.com/get-started/kotlin/setup.md): Configure the Kotlin MWA client.
- [Quickstart](https://docs.solanamobile.com/get-started/kotlin/quickstart.md): Connect wallets and sign or send transactions.

## Web

- [MWA for Web Apps](https://docs.solanamobile.com/get-started/web/apps.md): Web-specific MWA guidance.
- [Installing Mobile Wallet Standard](https://docs.solanamobile.com/get-started/web/installation.md): Register MWA as a wallet option in web apps.
- [Mobile Wallet Adapter UX Guidelines](https://docs.solanamobile.com/get-started/web/ux-guidelines.md): UX and product guidance for wallet flows.

## Other platforms

- [Flutter](https://docs.solanamobile.com/get-started/flutter/overview.md)
- [Unity SDK](https://docs.solanamobile.com/get-started/unity/overview.md)
- [Unreal Engine SDK](https://docs.solanamobile.com/get-started/unreal/overview.md)

## API schema

- [openapi](https://docs.solanamobile.com/api-reference/openapi.json): OpenAPI spec when the task needs schema-aware tooling or generated clients.

## Usage notes

- Inspect the app stack before choosing docs. React Native, native Android, and web flows are different.
- Prefer the highest-level integration doc first, then drop down to direct MWA session docs only when needed.
- When the user wants code changes, map the official guidance onto the repo's existing architecture instead of copying example code blindly.

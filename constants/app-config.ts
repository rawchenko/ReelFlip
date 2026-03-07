import { AppIdentity, createSolanaDevnet, createSolanaMainnet, createSolanaTestnet, SolanaCluster } from '@wallet-ui/react-native-kit'

export class AppConfig {
  static identity: AppIdentity = {
    name: 'ReelFlip',
    uri: 'https://reelflip.app',
  }
  static networks: SolanaCluster[] = [
    createSolanaMainnet({ url: 'https://api.mainnet-beta.solana.com' }),
    createSolanaDevnet({ url: 'https://api.devnet.solana.com' }),
    createSolanaTestnet({ url: 'https://api.testnet.solana.com' }),
  ]
}

import { AppIdentity, createSolanaDevnet, createSolanaTestnet, SolanaCluster } from '@wallet-ui/react-native-kit'

export class AppConfig {
  static identity: AppIdentity = {
    name: 'ReelFlip',
    uri: 'https://reelflip.app',
  }
  static networks: SolanaCluster[] = [
    createSolanaDevnet({ url: 'https://api.devnet.solana.com' }),
    createSolanaTestnet({ url: 'https://api.testnet.solana.com' }),
  ]
}

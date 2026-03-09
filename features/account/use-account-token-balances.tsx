import { useQuery } from '@tanstack/react-query'
import { Address } from '@solana/kit'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as Address

type OwnedAmountByMint = Record<string, bigint>

interface ParsedTokenBalanceInfo {
  mint?: string
  tokenAmount?: {
    amount?: string
  }
}

interface ParsedTokenBalanceEntry {
  account?: {
    data?: {
      parsed?: {
        info?: ParsedTokenBalanceInfo
      }
    }
  }
}

interface TokenAccountsResponse {
  value?: readonly ParsedTokenBalanceEntry[]
}

interface BalanceResponse {
  value?: bigint | number | string | null
}

function addMintBalances(response: TokenAccountsResponse | null | undefined, balances: OwnedAmountByMint): void {
  const entries = Array.isArray(response?.value) ? response.value : []

  for (const entry of entries) {
    const info = entry.account?.data?.parsed?.info
    const mint = typeof info?.mint === 'string' ? info.mint : null
    const amountRaw = typeof info?.tokenAmount?.amount === 'string' ? info.tokenAmount.amount : '0'
    if (!mint) {
      continue
    }

    let amount = 0n
    try {
      amount = BigInt(amountRaw)
    } catch {
      amount = 0n
    }

    if (amount <= 0n) {
      continue
    }

    balances[mint] = (balances[mint] ?? 0n) + amount
  }
}

function normalizeLamports(value: BalanceResponse['value']): bigint {
  if (typeof value === 'bigint') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'string') {
    try {
      return BigInt(value)
    } catch {
      return 0n
    }
  }

  return 0n
}

export function useAccountTokenBalances() {
  const { chain, client, account } = useMobileWallet()
  const address = account?.address

  return useQuery({
    enabled: Boolean(address),
    queryKey: ['token-balances-by-mint', chain, address],
    queryFn: async (): Promise<OwnedAmountByMint> => {
      if (!address) {
        return {}
      }

      const [tokenAccounts, token2022Accounts, solBalance] = await Promise.all([
        client.rpc
          .getTokenAccountsByOwner(address, { programId: TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' })
          .send() as unknown as Promise<TokenAccountsResponse>,
        client.rpc
          .getTokenAccountsByOwner(address, { programId: TOKEN_2022_PROGRAM_ID }, { encoding: 'jsonParsed' })
          .send()
          .catch(() => ({ value: [] })) as unknown as Promise<TokenAccountsResponse>,
        client.rpc.getBalance(address).send() as unknown as Promise<BalanceResponse>,
      ])

      const balances: OwnedAmountByMint = {}
      addMintBalances(tokenAccounts, balances)
      addMintBalances(token2022Accounts, balances)

      const lamports = normalizeLamports(solBalance?.value)
      if (lamports > 0n) {
        balances[SOL_MINT] = (balances[SOL_MINT] ?? 0n) + lamports
      }

      return balances
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

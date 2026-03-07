import assert from 'node:assert/strict'
import test from 'node:test'
import { TradeAssetRegistry } from './trade.assets.js'

test('TradeAssetRegistry enables SOL and USDC by default and gates SKR on config', () => {
  const registry = new TradeAssetRegistry()
  assert.equal(registry.isEnabled('SOL'), true)
  assert.equal(registry.isEnabled('USDC'), true)
  assert.equal(registry.isEnabled('SKR'), false)
})

test('TradeAssetRegistry exposes configured SKR mint', () => {
  const registry = new TradeAssetRegistry({
    skrMint: 'skrMint11111111111111111111111111111111111',
  })

  assert.equal(registry.isEnabled('SKR'), true)
  assert.equal(registry.getMint('SKR'), 'skrMint11111111111111111111111111111111111')
})

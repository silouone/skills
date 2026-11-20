export type TurnReceiptReceipt = string

declare module 'claude-code' {
  interface PluginState {
    'turn-receipt': { receipts: readonly TurnReceiptReceipt[] }
  }
}

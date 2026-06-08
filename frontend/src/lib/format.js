// Display helpers. Currency defaults to Malaysian Ringgit (RM).
export const rm = (n) =>
  `RM ${(Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const pct = (n) => `${((Number(n) || 0) * 100).toFixed(1)}%`

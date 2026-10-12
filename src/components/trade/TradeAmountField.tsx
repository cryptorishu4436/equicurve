"use client";

import { formatAtoms, formatAtomsExact } from "@/lib/amounts";
import { SOL_SWAP_FEE_RENT_BUFFER_ATOMS } from "@/lib/trade/validation";

type Props = {
  amount: string;
  symbol: string;
  decimals: number | null;
  balanceAtoms: bigint | null;
  nativeSol: boolean;
  onAmount: (value: string) => void;
};

function portion(balance: bigint, percent: number, leaveFeeBuffer: boolean): bigint {
  if (leaveFeeBuffer) {
    return balance > SOL_SWAP_FEE_RENT_BUFFER_ATOMS ? balance - SOL_SWAP_FEE_RENT_BUFFER_ATOMS : 0n;
  }
  return (balance * BigInt(percent)) / 100n;
}

export function TradeAmountField({ amount, symbol, decimals, balanceAtoms, nativeSol, onAmount }: Props) {
  const balanceText = balanceAtoms == null || decimals == null
    ? "Balance unavailable"
    : `Balance ${formatAtoms(balanceAtoms, decimals, 6)} ${symbol}`;

  function apply(percent: number, leaveFeeBuffer: boolean) {
    if (balanceAtoms == null || decimals == null) return;
    const atoms = portion(balanceAtoms, percent, leaveFeeBuffer);
    onAmount(atoms > 0n ? formatAtomsExact(atoms, decimals) : "");
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="ec-label">Amount ({symbol})</span>
        <span className="text-xs text-fg-muted">{balanceText}</span>
      </div>
      <input
        value={amount}
        autoComplete="off"
        onChange={(event) => onAmount(event.target.value)}
        inputMode="decimal"
        className="ec-input w-full py-5 text-2xl tabular-nums"
      />
      <div className="mt-2 flex gap-2" role="group" aria-label="Amount presets">
        {[25, 50, 100].map((percent) => (
          <button
            key={percent}
            type="button"
            className="ec-btn-secondary flex-1 text-xs"
            disabled={balanceAtoms == null}
            onClick={() => apply(percent, false)}
          >
            {percent}%
          </button>
        ))}
        <button
          type="button"
          className="ec-btn-secondary flex-1 text-xs"
          disabled={balanceAtoms == null}
          onClick={() => apply(100, nativeSol)}
        >
          Max
        </button>
      </div>
      {nativeSol && (
        <p className="mt-1 text-[11px] text-fg-muted">Max leaves 0.01 SOL for fees and rent.</p>
      )}
    </div>
  );
}

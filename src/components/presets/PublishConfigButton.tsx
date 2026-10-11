"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { toast } from "sonner";
import { WSOL_MINT } from "@/lib/constants";
import { toUserMessage } from "@/lib/errors";
import { signAndSendTransaction } from "@/lib/send";

/** The issuer signs a config. EquiCurve does not submit it on their behalf. */
export function PublishConfigButton() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [quoteMint, setQuoteMint] = useState(WSOL_MINT.toBase58());
  const [decimals, setDecimals] = useState<6 | 7 | 8 | 9>(9);
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function publish() {
    if (!wallet.publicKey) return;
    setBusy(true);
    try {
      const { buildPublishedConfigTransaction } = await import("@/lib/presets/publishConfig");
      const built = await buildPublishedConfigTransaction({
        connection,
        payer: wallet.publicKey,
        quoteMint: new PublicKey(quoteMint),
        quoteDecimals: decimals,
      });
      built.transaction.partialSign(built.config);
      const sig = await signAndSendTransaction({ connection, wallet, tx: built.transaction });
      setCreated(built.config.publicKey.toBase58());
      toast.success(`Config created. Signature ${sig.slice(0, 8)}…`);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <input className="ec-input font-mono text-xs" value={quoteMint} onChange={(e) => setQuoteMint(e.target.value.trim())} aria-label="Quote mint" />
        <select className="ec-input" value={decimals} onChange={(e) => setDecimals(Number(e.target.value) as 6 | 7 | 8 | 9)} aria-label="Quote decimals">
          {[6, 7, 8, 9].map((value) => <option key={value} value={value}>{value} decimals</option>)}
        </select>
      </div>
      <button type="button" className="ec-btn-secondary" disabled={busy || !wallet.publicKey} onClick={() => void publish()}>
        {busy ? "Creating config…" : "Sign the published equity config"}
      </button>
      {created ? (
        <p className="break-all font-mono text-xs text-fg-secondary">
          Config {created}. Set NEXT_PUBLIC_POOL_CONFIG_KEY to this address so Create and Explore use it. Pools deployed against it pay the partner fee claimer.
        </p>
      ) : (
        <p className="text-xs text-fg-muted">This creates a Meteora config account. It does not launch a token and it does not create a share.</p>
      )}
    </div>
  );
}

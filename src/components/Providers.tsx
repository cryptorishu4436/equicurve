"use client";

import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useEffect, useMemo, useState } from "react";
import { Connection } from "@solana/web3.js";
import { getCluster, getDevnetRpcReadUrls, getRpcUrl } from "@/lib/constants";
import { EXPECTED_CLUSTER_GENESIS_HASH } from "@/lib/connection";
import {
  AndroidShellPhantomAdapter,
  AndroidShellSolflareAdapter,
  isEquiCurveAndroidShell,
} from "@/lib/wallet/androidShell";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const candidates = useMemo(
    () => (getCluster() === "devnet" ? getDevnetRpcReadUrls() : [getRpcUrl()]),
    [],
  );
  const [endpoint, setEndpoint] = useState(candidates[0] ?? getRpcUrl());

  useEffect(() => {
    if (getCluster() !== "devnet" || candidates.length < 2) return;
    let cancelled = false;
    (async () => {
      for (const url of candidates) {
        try {
          const connection = new Connection(url, "confirmed");
          const hash = await Promise.race([
            connection.getGenesisHash(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error("timeout")), 2500);
            }),
          ]);
          if (hash !== EXPECTED_CLUSTER_GENESIS_HASH.devnet) continue;
          if (!cancelled) setEndpoint(url);
          return;
        } catch {
          // Try the next public devnet endpoint.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [candidates]);
  const network = useMemo(() => {
    const c = getCluster();
    if (c === "mainnet-beta") return WalletAdapterNetwork.Mainnet;
    if (c === "testnet") return WalletAdapterNetwork.Testnet;
    return WalletAdapterNetwork.Devnet;
  }, []);

  const wallets = useMemo(
    () =>
      isEquiCurveAndroidShell()
        ? [new AndroidShellPhantomAdapter(), new AndroidShellSolflareAdapter({ network })]
        : [new PhantomWalletAdapter(), new SolflareWalletAdapter({ network })],
    [network],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

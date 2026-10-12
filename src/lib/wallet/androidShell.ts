import { WalletReadyState, type WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";

/** Sent by the EquiCurve Android shell. Chrome on Android does not send this. */
export const ANDROID_SHELL_UA_TOKEN = "EquiCurveAndroid";

type InjectedWindow = Window & {
  phantom?: { solana?: { isPhantom?: boolean } };
  solana?: { isPhantom?: boolean };
  solflare?: { isSolflare?: boolean };
};

export function isEquiCurveAndroidShell(userAgent?: string): boolean {
  const ua = userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  return ua.includes(ANDROID_SHELL_UA_TOKEN);
}

/** Universal link that opens this page inside Phantom or Solflare's Android browser. */
export function walletBrowseUrl(wallet: "phantom" | "solflare", pageUrl: string): string {
  const current = encodeURIComponent(pageUrl);
  const ref = encodeURIComponent(new URL(pageUrl).origin);
  if (wallet === "phantom") return `https://phantom.app/ul/browse/${current}?ref=${ref}`;
  return `https://solflare.com/ul/v1/browse/${current}?ref=${ref}`;
}

function injected(wallet: "phantom" | "solflare"): boolean {
  if (typeof window === "undefined") return false;
  const host = window as InjectedWindow;
  if (wallet === "phantom") return Boolean(host.phantom?.solana?.isPhantom || host.solana?.isPhantom);
  return Boolean(host.solflare?.isSolflare);
}

function handoff(wallet: "phantom" | "solflare"): boolean {
  return isEquiCurveAndroidShell() && !injected(wallet);
}

/**
 * The stock adapters only redirect iPhone Safari into a wallet browser.
 * Inside the Android shell, Connect opens the same browse link and the shell
 * hands it to the installed wallet app.
 */
export class AndroidShellPhantomAdapter extends PhantomWalletAdapter {
  get readyState() {
    if (handoff("phantom")) return WalletReadyState.Loadable;
    return super.readyState;
  }

  async autoConnect(): Promise<void> {
    if (handoff("phantom")) return;
    await super.autoConnect();
  }

  async connect(): Promise<void> {
    if (handoff("phantom")) {
      window.location.href = walletBrowseUrl("phantom", window.location.href);
      return;
    }
    await super.connect();
  }
}

export class AndroidShellSolflareAdapter extends SolflareWalletAdapter {
  constructor(config?: { network?: WalletAdapterNetwork }) {
    super(config);
  }

  get readyState() {
    if (handoff("solflare")) return WalletReadyState.Loadable;
    return super.readyState;
  }

  async autoConnect(): Promise<void> {
    if (handoff("solflare")) return;
    await super.autoConnect();
  }

  async connect(): Promise<void> {
    if (handoff("solflare")) {
      window.location.href = walletBrowseUrl("solflare", window.location.href);
      return;
    }
    await super.connect();
  }
}

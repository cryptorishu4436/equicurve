import { describe, expect, it } from "vitest";
import { isEquiCurveAndroidShell, walletBrowseUrl } from "@/lib/wallet/androidShell";

describe("android shell wallet handoff", () => {
  it("recognizes only the EquiCurve Android user agent", () => {
    expect(isEquiCurveAndroidShell("Mozilla/5.0 EquiCurveAndroid/0.3.5")).toBe(true);
    expect(isEquiCurveAndroidShell("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(false);
    expect(isEquiCurveAndroidShell("")).toBe(false);
  });

  it("builds Phantom and Solflare browse links for the current page", () => {
    const page = "https://equicurve.vercel.app/o/pool?tab=overview";
    expect(walletBrowseUrl("phantom", page)).toBe(
      "https://phantom.app/ul/browse/https%3A%2F%2Fequicurve.vercel.app%2Fo%2Fpool%3Ftab%3Doverview?ref=https%3A%2F%2Fequicurve.vercel.app",
    );
    expect(walletBrowseUrl("solflare", page)).toBe(
      "https://solflare.com/ul/v1/browse/https%3A%2F%2Fequicurve.vercel.app%2Fo%2Fpool%3Ftab%3Doverview?ref=https%3A%2F%2Fequicurve.vercel.app",
    );
  });
});

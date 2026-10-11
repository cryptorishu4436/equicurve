"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TerminalIndexPage() {
  const router = useRouter();
  const [pool, setPool] = useState("");
  return (
    <div className="space-y-4">
      <header>
        <p className="ec-eyebrow">Terminal</p>
        <h1 className="ec-page-title">Read a pool.</h1>
        <p className="mt-2 max-w-3xl text-sm text-fg-secondary">
          Enter a DBC pool address. The panel shows the live lifecycle and whether a recorded design still matches the chain.
        </p>
      </header>
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const next = pool.trim();
          if (next) router.push(`/terminal/${next}`);
        }}
      >
        <input className="ec-input font-mono text-xs" value={pool} onChange={(e) => setPool(e.target.value)} placeholder="Pool address" aria-label="Pool address" />
        <button type="submit" className="ec-btn-primary">Open</button>
      </form>
    </div>
  );
}

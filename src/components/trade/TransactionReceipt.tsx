export function TransactionReceipt({
  purpose,
  signature,
  explorerUrl,
}: {
  purpose: string;
  signature: string;
  explorerUrl: string;
}) {
  return (
    <p className="text-xs leading-relaxed text-fg-secondary">
      {purpose}.{" "}
      <a
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="break-all font-mono text-accent hover:underline"
      >
        {signature}
      </a>
    </p>
  );
}

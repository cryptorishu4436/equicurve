import { TerminalPanel } from "@/components/terminal/TerminalPanel";

export default async function TerminalPoolPage({ params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;
  return <TerminalPanel pool={pool} />;
}

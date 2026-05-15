import type { StoryKind } from "@/lib/types";
import { KIND_LABELS } from "@/lib/view";

const cssVar: Record<StoryKind, string> = {
  anecdote: "var(--kind-anecdote)",
  experiment: "var(--kind-experiment)",
  fun_fact: "var(--kind-fun_fact)",
  history: "var(--kind-history)",
  quote: "var(--kind-quote)",
  surprise: "var(--kind-surprise)",
  claim: "var(--kind-claim)",
};

export function KindBadge({ kind }: { kind: StoryKind | null }) {
  if (!kind) return null;
  const label = KIND_LABELS[kind];
  return (
    <span
      className="kind-badge"
      style={{ ["--kind-color" as string]: cssVar[kind] }}
    >
      {label}
    </span>
  );
}

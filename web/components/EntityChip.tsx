import Link from "next/link";
import type { Entity } from "@/lib/types";

interface Props {
  entity: Pick<Entity, "name" | "slug" | "kind">;
  role?: string | null;
}

export default function EntityChip({ entity, role }: Props) {
  const base =
    entity.kind === "person"
      ? `/person/${entity.slug ?? ""}`
      : `/topic/${entity.slug ?? ""}`;
  const disabled = !entity.slug;
  const className =
    "inline-flex items-center gap-1 rounded-full border border-current/15 bg-current/5 px-2.5 py-0.5 text-xs hover:bg-current/10 transition";
  const content = (
    <>
      <span className="font-medium">{entity.name}</span>
      {role ? <span className="opacity-60">· {role}</span> : null}
    </>
  );
  if (disabled) {
    return <span className={className}>{content}</span>;
  }
  return (
    <Link href={base} className={className}>
      {content}
    </Link>
  );
}

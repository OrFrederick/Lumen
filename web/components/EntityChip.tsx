"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useHover, type HoverEntity } from "./HoverCard";
import type { EntityView } from "@/lib/view";

export function EntityChip({
  entity,
  surface,
  variant = "inline",
  children,
}: {
  entity: EntityView;
  surface?: string;
  variant?: "inline" | "pill";
  children?: ReactNode;
}) {
  const { show, hide } = useHover();
  const router = useRouter();

  const hoverEntity: HoverEntity = {
    kind: entity.kind,
    name: entity.name,
    description: entity.description,
    birth_year: entity.birth_year,
    death_year: entity.death_year,
    occupation: entity.occupation,
    slug: entity.slug,
  };

  const isPerson = entity.kind === "person";
  const handleClick = (e: MouseEvent) => {
    if (!isPerson) {
      e.preventDefault();
      return;
    }
    router.push(`/person/${entity.slug}`);
  };

  const handleMove = (e: MouseEvent) => show(hoverEntity, e.clientX, e.clientY);

  if (variant === "pill") {
    return (
      <span
        className="echip-pill"
        role={isPerson ? "link" : undefined}
        tabIndex={isPerson ? 0 : -1}
        onMouseEnter={handleMove}
        onMouseMove={handleMove}
        onMouseLeave={hide}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (isPerson && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            router.push(`/person/${entity.slug}`);
          }
        }}
      >
        <span className="epn">{entity.name}</span>
        {isPerson && (entity.birth_year || entity.death_year) && (
          <span className="epd">
            {entity.birth_year ?? "?"}–{entity.death_year ?? "?"}
          </span>
        )}
      </span>
    );
  }

  const label = surface ?? (isPerson ? entity.short : entity.name);
  return (
    <span
      className="echip"
      data-kind={entity.kind}
      onMouseEnter={handleMove}
      onMouseMove={handleMove}
      onMouseLeave={hide}
      onClick={handleClick}
    >
      {children ?? label}
    </span>
  );
}

export function EntityLink({ entity }: { entity: EntityView }) {
  const { show, hide } = useHover();
  if (entity.kind !== "person") return <EntityChip entity={entity} variant="pill" />;
  return (
    <Link
      href={`/person/${entity.slug}`}
      className="echip-pill"
      onMouseEnter={(e) =>
        show(
          {
            kind: entity.kind,
            name: entity.name,
            description: entity.description,
            birth_year: entity.birth_year,
            death_year: entity.death_year,
            occupation: entity.occupation,
            slug: entity.slug,
          },
          e.clientX,
          e.clientY,
        )
      }
      onMouseLeave={hide}
    >
      <span className="epn">{entity.name}</span>
      {(entity.birth_year || entity.death_year) && (
        <span className="epd">
          {entity.birth_year ?? "?"}–{entity.death_year ?? "?"}
        </span>
      )}
    </Link>
  );
}

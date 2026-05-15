"use client";

import { Fragment, type ReactNode } from "react";
import { EntityChip } from "./EntityChip";
import type { EntityView } from "@/lib/view";

interface Matcher {
  surface: string;
  entity: EntityView;
}

const BOUNDARY = /[\s.,;:!?"'(){}\[\]–—-]/;

/**
 * Auto-linking body renderer.
 *
 * Walks the body text greedily (longest surface form first) and wraps the
 * first occurrence of each entity surface form in an inline EntityChip.
 * Subsequent occurrences of the same form fall through as plain text so the
 * paragraph isn't littered with chrome.
 */
export function Body({ text, entities }: { text: string; entities: EntityView[] }) {
  if (!text) return null;
  if (!entities.length) return <>{text}</>;

  const matchers: Matcher[] = [];
  for (const e of entities) {
    const forms = new Set<string>();
    forms.add(e.name);
    if (e.short !== e.name) forms.add(e.short);
    for (const surface of forms) {
      if (surface.length >= 2) matchers.push({ surface, entity: e });
    }
  }
  // Longest first so "Albert Einstein" beats "Einstein".
  matchers.sort((a, b) => b.surface.length - a.surface.length);

  const out: ReactNode[] = [];
  const used = new Set<string>();
  let i = 0;
  let key = 0;
  let plainStart = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) out.push(<Fragment key={`t-${key++}`}>{text.slice(plainStart, end)}</Fragment>);
  };

  while (i < text.length) {
    let hit: Matcher | null = null;
    for (const m of matchers) {
      const cand = text.substring(i, i + m.surface.length);
      if (cand !== m.surface) continue;
      const before = i === 0 ? " " : text[i - 1];
      const after = text[i + m.surface.length] ?? " ";
      if (!BOUNDARY.test(before)) continue;
      if (!BOUNDARY.test(after)) continue;
      const tag = `${m.entity.slug}@${m.surface}`;
      if (used.has(tag)) continue;
      hit = m;
      break;
    }
    if (hit) {
      flushPlain(i);
      const tag = `${hit.entity.slug}@${hit.surface}`;
      used.add(tag);
      out.push(
        <EntityChip key={`c-${key++}`} entity={hit.entity} surface={hit.surface}>
          {hit.surface}
        </EntityChip>,
      );
      i += hit.surface.length;
      plainStart = i;
    } else {
      i += 1;
    }
  }
  flushPlain(text.length);
  return <>{out}</>;
}

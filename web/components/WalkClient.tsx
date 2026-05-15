"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Entity, EntityMention, StoryWithVideo } from "@/lib/types";
import EntityChip from "./EntityChip";

export type WalkStory = {
  story: StoryWithVideo;
  entities: Array<Entity & EntityMention>;
};

type Phase = "entering" | "idle" | "leaving";

interface Props {
  stories: WalkStory[];
  initialIndex: number;
}

const KIND_COLOR: Record<string, string> = {
  anecdote: "#3b82f6",
  experiment: "#10b981",
  fun_fact: "#a855f7",
  history: "#f59e0b",
  quote: "#6b7280",
  surprise: "#ec4899",
  claim: "#ef4444",
};

function KindBadge({ kind }: { kind: string | null }) {
  if (!kind) return null;
  const color = KIND_COLOR[kind] ?? "#8A7E6E";
  return (
    <span className="walk-kind-badge">
      <span className="walk-kind-square" style={{ background: color }} />
      <span className="walk-kind-label">{kind.replace(/_/g, " ")}</span>
    </span>
  );
}

// Inline body renderer: walks the text once, greedily wrapping the first
// occurrence of each entity surface form in an EntityChip. A given form is
// matched at most once per body. Falls back to a plain string when no
// entities match.
function Body({
  text,
  entities,
}: {
  text: string;
  entities: Array<Entity & EntityMention>;
}) {
  // Build a unique list of surface forms, longest first.
  const forms = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{ form: string; entity: Entity & EntityMention }> = [];
    for (const e of entities) {
      const name = e.name?.trim();
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        items.push({ form: name, entity: e });
      }
    }
    items.sort((a, b) => b.form.length - a.form.length);
    return items;
  }, [entities]);

  if (!text) return null;
  if (forms.length === 0) return <>{text}</>;

  const used = new Set<string>();
  const out: Array<string | React.ReactNode> = [];
  let cursor = 0;

  // Single linear scan; at each position, try to match the longest form.
  while (cursor < text.length) {
    let matched: { form: string; entity: Entity & EntityMention } | null = null;
    for (const f of forms) {
      if (used.has(f.form.toLowerCase())) continue;
      const slice = text.substr(cursor, f.form.length);
      if (slice.toLowerCase() !== f.form.toLowerCase()) continue;
      const before = cursor === 0 ? "" : text[cursor - 1] ?? "";
      const after = text[cursor + f.form.length] ?? "";
      if (/[a-zA-Z0-9]/.test(before)) continue;
      if (/[a-zA-Z0-9]/.test(after)) continue;
      matched = f;
      break;
    }
    if (matched) {
      used.add(matched.form.toLowerCase());
      out.push(
        <EntityChip
          key={`${matched.entity.id}-${cursor}`}
          entity={matched.entity}
          role={matched.entity.role ?? undefined}
        />,
      );
      cursor += matched.form.length;
    } else {
      const last = out[out.length - 1];
      if (typeof last === "string") {
        out[out.length - 1] = last + text[cursor];
      } else {
        out.push(text[cursor] ?? "");
      }
      cursor += 1;
    }
  }
  return <>{out}</>;
}

export default function WalkClient({ stories, initialIndex }: Props) {
  const total = stories.length;
  const [i, setI] = useState(initialIndex);
  const [phase, setPhase] = useState<Phase>("entering");
  const router = useRouter();
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = stories[i] ?? stories[0]!;
  const { story, entities } = current;

  // entering -> idle on every index change.
  useEffect(() => {
    setPhase("entering");
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => setPhase("idle"), 30);
    return () => {
      if (enterTimer.current) clearTimeout(enterTimer.current);
    };
  }, [i]);

  // Mirror index into URL so it's shareable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("i", String(i));
    window.history.replaceState(null, "", url.toString());
  }, [i]);

  const go = useCallback(
    (di: number) => {
      if (total <= 0) return;
      const next = ((i + di) % total + total) % total;
      setPhase("leaving");
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => setI(next), 320);
    },
    [i, total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router]);

  return (
    <main className="walk-page">
      <style>{WALK_CSS}</style>

      <div className={`shell walk-stage ${phase}`} key={i}>
        <div className="walk-eyebrow">
          <KindBadge kind={story.kind} />
          {story.historical_year != null ? (
            <span style={{ fontFamily: "var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace)" }}>
              {story.historical_year}
            </span>
          ) : null}
          {story.video_title ? <span>· {story.video_title}</span> : null}
        </div>

        <h1>{story.title ?? "Untitled story"}</h1>

        {story.takeaway ? <p className="walk-take">{story.takeaway}</p> : null}

        {story.body ? (
          <p className="walk-body">
            <Body text={story.body} entities={entities} />
          </p>
        ) : null}

        {entities.length > 0 ? (
          <div className="walk-foot">
            {entities.slice(0, 4).map((e) => (
              <EntityChip key={e.id} entity={e} role={e.role ?? undefined} />
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 40 }}>
          <Link href={`/story/${story.id}`} className="sp-watch">
            Open full story →
          </Link>
        </div>
      </div>

      <div className="walk-nav">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={i === 0}
          aria-label="Previous (←)"
          title="Previous (←)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="walk-progress">
          <strong>{(i + 1).toString().padStart(2, "0")}</strong> / {total}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={i === total - 1}
          aria-label="Next (→)"
          title="Next (→)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </main>
  );
}

// Self-contained walk-mode styles. Mirrors the prototype 1:1 with hard-coded
// fallbacks for the design tokens that aren't yet in globals.css.
const WALK_CSS = `
.walk-page {
  min-height: 100vh;
  background: var(--paper, #F4F1E8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  position: relative;
}
.walk-page .shell {
  width: 100%;
  max-width: 720px;
}
.walk-stage {
  max-width: 720px;
  width: 100%;
  text-align: left;
  transition: opacity .32s ease, transform .32s ease;
}
.walk-stage.leaving { opacity: 0; transform: translateY(-10px); }
.walk-stage.entering { opacity: 0; transform: translateY(10px); }
.walk-stage.idle { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .walk-stage,
  .walk-stage.leaving,
  .walk-stage.entering,
  .walk-stage.idle {
    transition: none;
    transform: none;
    opacity: 1;
  }
}
.walk-eyebrow {
  display: flex;
  gap: 18px;
  align-items: center;
  font-size: 12px;
  color: var(--ink-mute, #8A7E6E);
  margin-bottom: 32px;
}
.walk-kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-mute, #8A7E6E);
}
.walk-kind-square {
  width: 7px;
  height: 7px;
  border-radius: 1px;
  display: inline-block;
}
.walk-kind-label { line-height: 1; }
.walk-stage h1 {
  font-family: var(--serif, ui-serif, Georgia, "Iowan Old Style", "Apple Garamond", serif);
  font-size: clamp(40px, 6vw, 64px);
  font-weight: 500;
  line-height: 1.04;
  letter-spacing: -0.02em;
  margin: 0 0 36px;
  color: var(--ink, #1E1A14);
  text-wrap: balance;
}
.walk-take {
  font-family: var(--serif, ui-serif, Georgia, serif);
  font-size: 22px;
  line-height: 1.45;
  color: var(--ink, #1E1A14);
  border-left: 2px solid var(--accent, #7A5A2E);
  padding-left: 20px;
  margin: 0 0 32px;
  font-style: italic;
  max-width: 56ch;
  text-wrap: balance;
}
.walk-body {
  font-family: var(--serif, ui-serif, Georgia, serif);
  font-size: 19px;
  line-height: 1.62;
  color: var(--ink-soft, #4A4035);
  max-width: 62ch;
  margin: 0 0 36px;
}
.walk-foot {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.walk-page .sp-watch {
  font-size: 13px;
  color: var(--ink-soft, #4A4035);
  border-bottom: 1px solid var(--rule, #E5DFCF);
  padding-bottom: 2px;
  cursor: pointer;
  transition: color .15s, border-color .15s;
}
.walk-page .sp-watch:hover {
  color: var(--accent, #7A5A2E);
  border-bottom-color: var(--accent, #7A5A2E);
}
.walk-nav {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
  align-items: center;
  background: var(--bg-elev, #FFFFFF);
  border: 1px solid var(--rule, #E5DFCF);
  padding: 6px 8px;
  border-radius: 999px;
  box-shadow: 0 6px 24px -10px rgba(30,26,20,0.15);
  z-index: 30;
}
.walk-nav button {
  width: 38px;
  height: 38px;
  border: 0;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-soft, #4A4035);
  cursor: pointer;
  transition: background .15s, color .15s;
}
.walk-nav button:hover:not(:disabled) {
  background: var(--accent-wash, #EDE6D7);
  color: var(--ink, #1E1A14);
}
.walk-nav button:disabled { opacity: 0.3; cursor: default; }
.walk-nav .walk-progress {
  font: 11px var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  color: var(--ink-mute, #8A7E6E);
  padding: 0 14px;
  white-space: nowrap;
}
.walk-nav .walk-progress strong {
  color: var(--ink, #1E1A14);
  font-family: var(--serif, ui-serif, Georgia, serif);
  font-style: italic;
  font-weight: 500;
}
`;

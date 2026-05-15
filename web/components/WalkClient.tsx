"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Body } from "./Body";
import { EntityChip } from "./EntityChip";
import { KindBadge } from "./KindBadge";
import type { EntityView, StoryView } from "@/lib/view";

export type WalkStory = {
  story: StoryView;
  entities: EntityView[];
};

type Phase = "entering" | "idle" | "leaving";

/**
 * Walk — one story at a time, full-bleed, magazine-page transitions.
 *
 * Phase state machine drives the fade+slide:
 *   on index change → "entering", after 30ms → "idle"
 *   on go(±1)       → "leaving", after 320ms → setIndex(next) → re-entering
 *
 * URL mirrors the current index via history.replaceState so any frame is
 * shareable without forcing a navigation.
 */
export function WalkClient({
  stories,
  initialIndex,
}: {
  stories: WalkStory[];
  initialIndex: number;
}) {
  const total = stories.length;
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, total - 1)),
  );
  const [phase, setPhase] = useState<Phase>("entering");
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteringTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (enteringTimer.current) clearTimeout(enteringTimer.current);
    enteringTimer.current = setTimeout(() => setPhase("idle"), 30);
    return () => {
      if (enteringTimer.current) clearTimeout(enteringTimer.current);
    };
  }, [index]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("i", String(index));
    window.history.replaceState(window.history.state, "", url.toString());
  }, [index]);

  const go = useCallback(
    (delta: number) => {
      if (total === 0) return;
      const next = ((index + delta) % total + total) % total;
      setPhase("leaving");
      if (leavingTimer.current) clearTimeout(leavingTimer.current);
      leavingTimer.current = setTimeout(() => {
        setIndex(next);
        setPhase("entering");
      }, 320);
    },
    [index, total],
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
        window.location.href = "/";
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (total === 0) {
    return (
      <main className="walk-page">
        <div className="shell" style={{ color: "var(--ink-mute)", fontStyle: "italic", fontFamily: "var(--serif)" }}>
          No moments to walk through yet. Ingest some videos first.
        </div>
      </main>
    );
  }

  const { story, entities } = stories[index];
  const phaseClass =
    phase === "leaving" ? "leaving" : phase === "entering" ? "entering" : "";

  return (
    <main className="walk-page">
      <div className={`shell walk-stage ${phaseClass}`} key={index}>
        <div className="walk-eyebrow">
          <KindBadge kind={story.kind} />
          {story.year != null && (
            <span style={{ fontFamily: "var(--mono)" }}>{story.year}</span>
          )}
          {story.video_title && <span>· {story.video_title}</span>}
        </div>
        <h1>{story.title}</h1>
        {story.takeaway && <p className="walk-take">{story.takeaway}</p>}
        {story.body && (
          <p className="walk-body">
            <Body text={story.body} entities={entities} />
          </p>
        )}
        {entities.length > 0 && (
          <div className="walk-foot">
            {entities.slice(0, 4).map((e) => (
              <EntityChip key={e.id} entity={e} variant="pill" />
            ))}
          </div>
        )}
        <div style={{ marginTop: 40 }}>
          <Link href={`/story/${story.id}`} className="sp-watch">
            Open full story →
          </Link>
        </div>
      </div>

      <nav className="walk-nav" aria-label="Walk navigation">
        <button onClick={() => go(-1)} title="Previous (←)" aria-label="Previous">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="walk-progress">
          <strong>{(index + 1).toString().padStart(2, "0")}</strong> / {total}
        </div>
        <button onClick={() => go(1)} title="Next (→)" aria-label="Next">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </nav>
    </main>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type HoverEntity = {
  kind: string;
  name: string;
  description?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  occupation?: string | null;
  slug?: string;
};

type HoverCtxValue = {
  show: (entity: HoverEntity, x: number, y: number) => void;
  hide: () => void;
  keep: () => void;
};

const HoverCtx = createContext<HoverCtxValue | null>(null);

export function useHover(): HoverCtxValue {
  return useContext(HoverCtx) ?? {
    show: () => {},
    hide: () => {},
    keep: () => {},
  };
}

const KIND_EYEBROW: Record<string, string> = {
  person: "Person",
  concept: "Concept",
  place: "Place",
  experiment: "Experiment",
  event: "Event",
  work: "Work",
  paper: "Paper",
  story: "Story",
};

export function HoverCardProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<{ entity: HoverEntity; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((entity: HoverEntity, x: number, y: number) => {
    if (timer.current) clearTimeout(timer.current);
    setCard({ entity, x, y });
  }, []);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCard(null), 120);
  }, []);
  const keep = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <HoverCtx.Provider value={{ show, hide, keep }}>
      {children}
      <HoverCardPortal card={card} onEnter={keep} onLeave={hide} />
    </HoverCtx.Provider>
  );
}

function HoverCardPortal({
  card,
  onEnter,
  onLeave,
}: {
  card: { entity: HoverEntity; x: number; y: number } | null;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    if (!card || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const pad = 12;
    let left = card.x + 14;
    let top = card.y + 14;
    if (left + r.width > window.innerWidth - pad) left = card.x - r.width - 14;
    if (top + r.height > window.innerHeight - pad) top = card.y - r.height - 14;
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [card]);

  const e = card?.entity;
  const eyebrow = e ? KIND_EYEBROW[e.kind] ?? "Entity" : "";
  return (
    <div
      ref={ref}
      className={`hovercard ${card ? "is-visible" : ""}`}
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {e && (
        <>
          <div className="hc-eyebrow">{eyebrow}</div>
          <div className="hc-title">{e.name}</div>
          {e.kind === "person" && (e.birth_year || e.death_year) && (
            <div className="hc-dates">
              {e.birth_year ?? "?"}–{e.death_year ?? "?"}
              {e.occupation ? ` · ${e.occupation}` : ""}
            </div>
          )}
          {e.description && <div className="hc-desc">{truncate(e.description, 180)}</div>}
          <div className="hc-foot">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M17 7H8M17 7v9" />
            </svg>
            {e.kind === "person" ? "View their stories" : "View entity"}
          </div>
        </>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n).trim() + "…";
}

// Suppress unused-import warning in CRA-style envs without typedoc
void useEffect;

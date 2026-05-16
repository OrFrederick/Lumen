"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useHover, type HoverEntity } from "./HoverCard";
import {
  FIELDS,
  type Field,
  KIND_COLORS,
  KIND_LABELS,
  inferField,
} from "@/lib/view";
import type { StoryKind } from "@/lib/types";

export interface TimelinePersonInput {
  id: number;
  slug: string;
  name: string;
  short: string;
  birth_year: number;
  death_year: number;
  occupation: string | null;
  description: string | null;
  field: Field;
  mention_count?: number;
}

export interface TimelinePinInput {
  id: number;
  title: string;
  takeaway: string | null;
  kind: StoryKind | null;
  year: number;
  field: Field | null;
}

interface Preset {
  label: string;
  range: [number, number];
}

const PRESETS: Preset[] = [
  { label: "All time", range: [1550, 2030] },
  { label: "17th c.", range: [1600, 1730] },
  { label: "Industrial", range: [1700, 1900] },
  { label: "Modern", range: [1850, 1980] },
  { label: "Recent", range: [1900, 2030] },
];

const FIELD_COLOR: Record<Field, string> = {
  physics: "#7A5A2E",
  engineering: "#5A4A2E",
  biology: "#3D6B5C",
  mathematics: "#4A6B8A",
  chemistry: "#6B5A8A",
  other: "#8A7E6E",
};

const MIN_SPAN = 40;
const MAX_SPAN = 600;
const HARD_MAX_YEAR = 2050;

function clampZoom(
  from: number,
  to: number,
  minYear: number,
  maxYear: number,
): { from: number; to: number } {
  let f = from;
  let t = to;
  const span = t - f;
  if (span < MIN_SPAN) {
    return { from: Math.max(minYear, f), to: Math.min(maxYear, f + MIN_SPAN) };
  }
  if (span > MAX_SPAN) {
    return { from: Math.max(minYear, f), to: Math.min(maxYear, f + MAX_SPAN) };
  }
  if (f < minYear) {
    t += minYear - f;
    f = minYear;
  }
  if (t > maxYear) {
    f -= t - maxYear;
    t = maxYear;
  }
  if (f < minYear) f = minYear;
  if (t > maxYear) t = maxYear;
  return { from: f, to: t };
}

export function Timeline({
  people,
  pins,
  storyCount,
  videoCount,
  initialFrom,
  initialTo,
  filterField,
  filterKind,
}: {
  people: TimelinePersonInput[];
  pins: TimelinePinInput[];
  storyCount: number;
  videoCount: number;
  initialFrom?: number;
  initialTo?: number;
  filterField?: Field | null;
  filterKind?: StoryKind | null;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { show, hide } = useHover();

  const { minYear, maxYear } = useMemo(() => {
    const births = people.map((p) => p.birth_year);
    const deaths = people.map((p) => p.death_year);
    const pinYears = pins.map((p) => p.year);
    const allLow = [...births, ...pinYears];
    const allHigh = [...deaths, ...pinYears];
    const dataMin = allLow.length ? Math.min(...allLow) : 1700;
    const dataMax = allHigh.length ? Math.max(...allHigh) : 2000;
    // Allow scrolling 20 years before the earliest entry so the first bar isn't
    // pinned at x=0; cap the upper bound hard at 2050 regardless of data.
    return {
      minYear: Math.floor(dataMin - 20),
      maxYear: Math.min(HARD_MAX_YEAR, Math.ceil(Math.max(dataMax, new Date().getUTCFullYear()) + 5)),
    };
  }, [people, pins]);

  const [width, setWidth] = useState(1100);
  const [zoom, setZoom] = useState<{ from: number; to: number }>(() => {
    if (initialFrom != null && initialTo != null) return { from: initialFrom, to: initialTo };
    const now = new Date().getUTCFullYear();
    return clampZoom(now - 200, now + 5, minYear, maxYear);
  });
  const [hoveredPinId, setHoveredPinId] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    let rafId: number | null = null;
    let pending: number | null = null;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) pending = entry.contentRect.width;
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        if (pending != null) setWidth(Math.max(640, pending));
        rafId = null;
        pending = null;
      });
    });
    ro.observe(wrapRef.current);
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const M = { l: 24, r: 24, t: 14, b: 36 };
  const H = 320;
  const W = width;
  const innerW = Math.max(1, W - M.l - M.r);

  const xScale = useCallback(
    (year: number) => M.l + ((year - zoom.from) / (zoom.to - zoom.from)) * innerW,
    [zoom, innerW],
  );
  const yearOfX = useCallback(
    (x: number) => zoom.from + ((x - M.l) / innerW) * (zoom.to - zoom.from),
    [zoom, innerW],
  );

  const peopleFiltered = useMemo(
    () =>
      people
        .filter((p) => p.death_year >= zoom.from && p.birth_year <= zoom.to)
        .filter((p) => !filterField || p.field === filterField)
        .sort((a, b) => a.birth_year - b.birth_year),
    [people, zoom, filterField],
  );

  const pinsFiltered = useMemo(
    () =>
      pins
        .filter((p) => p.year >= zoom.from && p.year <= zoom.to)
        .filter((p) => !filterKind || p.kind === filterKind),
    [pins, zoom, filterKind],
  );

  const ticks = useMemo(() => {
    const span = zoom.to - zoom.from;
    const step = span > 400 ? 50 : span > 200 ? 25 : 10;
    const out: number[] = [];
    const start = Math.ceil(zoom.from / step) * step;
    for (let y = start; y <= zoom.to; y += step) out.push(y);
    return out;
  }, [zoom]);

  const lifespanArea = { top: H * 0.36, bottom: H - M.b };
  // Reserve a thin strip at the bottom for the "dust" of low-prominence
  // lifespans that didn't make the row cap. Sized so a few rows of 1px ticks
  // fit without crowding the labeled bars above.
  const DUST_STRIP_H = 14;
  const lifespanH = lifespanArea.bottom - lifespanArea.top - DUST_STRIP_H;
  // Target ~18px per labeled row so names stay readable.
  const ROW_MIN_H = 18;
  const maxRows = Math.max(4, Math.floor(lifespanH / ROW_MIN_H));

  // Importance-aware packing: try to place each person on a row, ordered by
  // mention_count desc so notable people always claim a slot. People that
  // would force a new row beyond maxRows fall into a secondary "dust" pool.
  const { packed, dust } = useMemo(() => {
    const byImportance = [...peopleFiltered].sort((a, b) => {
      const am = a.mention_count ?? 0;
      const bm = b.mention_count ?? 0;
      if (bm !== am) return bm - am;
      return a.birth_year - b.birth_year;
    });
    const rows: { person: TimelinePersonInput; x0: number; x1: number }[][] = [];
    const secondary: { person: TimelinePersonInput; x0: number; x1: number }[] = [];
    for (const p of byImportance) {
      const x0 = xScale(p.birth_year);
      const x1 = xScale(p.death_year);
      let placed = false;
      for (const row of rows) {
        const last = row[row.length - 1];
        if (last.x1 + 60 < x0) {
          row.push({ person: p, x0, x1 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (rows.length < maxRows) {
          rows.push([{ person: p, x0, x1 }]);
          placed = true;
        }
      }
      if (!placed) secondary.push({ person: p, x0, x1 });
    }
    // Re-sort each row left-to-right so chronological reading still works.
    for (const row of rows) row.sort((a, b) => a.x0 - b.x0);
    return { packed: rows, dust: secondary };
  }, [peopleFiltered, xScale, maxRows]);

  const rowH = lifespanH / Math.max(packed.length, 1);
  const barH = Math.min(rowH - 4, 16);
  const dustTop = lifespanArea.bottom - DUST_STRIP_H + 2;

  const pinArea = { top: M.t, bottom: lifespanArea.top - 10 };

  const ridgePath = useMemo(() => {
    const bins = 60;
    const counts = new Array<number>(bins).fill(0);
    for (const s of pinsFiltered) {
      const t = (s.year - zoom.from) / (zoom.to - zoom.from);
      if (t < 0 || t > 1) continue;
      counts[Math.min(bins - 1, Math.floor(t * bins))] += 1;
    }
    const max = Math.max(...counts, 1);
    let d = `M ${M.l} ${pinArea.bottom} `;
    for (let i = 0; i < bins; i += 1) {
      const x = M.l + ((i + 0.5) / bins) * innerW;
      const y = pinArea.bottom - (counts[i] / max) * (pinArea.bottom - pinArea.top - 4);
      d += `L ${x} ${y} `;
    }
    d += `L ${W - M.r} ${pinArea.bottom} Z`;
    return d;
  }, [pinsFiltered, zoom, innerW, W]);

  // Stack overlapping pins.
  const pinNodes = useMemo(() => {
    const buckets = new Map<number, TimelinePinInput[]>();
    for (const s of pinsFiltered) {
      const bk = Math.round(xScale(s.year));
      const arr = buckets.get(bk) ?? [];
      arr.push(s);
      buckets.set(bk, arr);
    }
    const out: { pin: TimelinePinInput; x: number; y: number; color: string }[] = [];
    for (const [bk, arr] of buckets) {
      arr.forEach((s, i) => {
        out.push({
          pin: s,
          x: bk,
          y: pinArea.bottom - 6 - i * 8,
          color: s.kind ? KIND_COLORS[s.kind] : "#64748b",
        });
      });
    }
    return out;
  }, [pinsFiltered, xScale]);

  // Pan & zoom. Coalesce state updates through requestAnimationFrame so we
  // re-render at most once per frame, keeping the ridge + lifespan packing
  // cheap even on a fast scroll wheel.
  const dragRef = useRef<{ x: number; from: number; to: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ from: number; to: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const scheduleZoom = useCallback((next: { from: number; to: number }) => {
    pendingRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) setZoom(pendingRef.current);
      pendingRef.current = null;
    });
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const onMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, from: zoom.from, to: zoom.to };
  };
  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const span = dragRef.current.to - dragRef.current.from;
    const dy = (-dx / innerW) * span;
    scheduleZoom(
      clampZoom(dragRef.current.from + dy, dragRef.current.to + dy, minYear, maxYear),
    );
  };
  useEffect(() => {
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Wheel must call preventDefault, but React 17+ attaches wheel listeners as
  // passive — so we wire it manually with passive:false. Coalesced through
  // requestAnimationFrame for smooth scroll.
  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const handler = (ev: globalThis.WheelEvent) => {
      const rect = node.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const current = pendingRef.current ?? zoom;
      const factor = Math.exp(ev.deltaY * 0.0015);
      const newSpan = (current.to - current.from) * factor;
      // If proposed span is outside [MIN_SPAN, MAX_SPAN], do nothing — and
      // don't preventDefault, so the page can scroll naturally instead of
      // feeling frozen at the zoom boundary.
      if (newSpan < MIN_SPAN || newSpan > MAX_SPAN) return;
      const yearAtCursor = current.from + ((mx - M.l) / innerW) * (current.to - current.from);
      const t = (yearAtCursor - current.from) / (current.to - current.from);
      const proposed = clampZoom(
        yearAtCursor - t * newSpan,
        yearAtCursor + (1 - t) * newSpan,
        minYear,
        maxYear,
      );
      // If the clamp pinned us to where we already are, this wheel event is a
      // no-op — release the page scroll.
      if (
        Math.abs(proposed.from - current.from) < 0.5 &&
        Math.abs(proposed.to - current.to) < 0.5
      ) {
        return;
      }
      ev.preventDefault();
      scheduleZoom(proposed);
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [zoom, innerW, minYear, maxYear, M.l, scheduleZoom]);

  const activePreset = PRESETS.find(
    (p) => Math.abs(p.range[0] - zoom.from) < 2 && Math.abs(p.range[1] - zoom.to) < 2,
  );

  const goPreset = (preset: Preset) => {
    setZoom(clampZoom(preset.range[0], preset.range[1], minYear, maxYear));
  };

  return (
    <div className="timeline-wrap" ref={wrapRef}>
      <div className="timeline-meta">
        <span className="strong" style={{ fontStyle: "italic" }}>
          The Library, at a glance
        </span>
        <span>
          {storyCount} story-moments · {people.length} people · {videoCount} videos
        </span>
        <span style={{ fontFamily: "var(--mono)" }}>
          {Math.round(zoom.from)} → {Math.round(zoom.to)}
        </span>
        <span className="spacer" />
        <div className="timeline-controls" role="group" aria-label="Zoom presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={activePreset === p ? "active" : ""}
              onClick={() => goPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <svg
        ref={svgRef}
        className="timeline-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        <g className="timeline-ridge">
          <path d={ridgePath} />
        </g>

        <g className="timeline-axis">
          <line x1={M.l} x2={W - M.r} y1={lifespanArea.top - 8} y2={lifespanArea.top - 8} />
          {ticks.map((y) => (
            <g key={y}>
              <line x1={xScale(y)} x2={xScale(y)} y1={lifespanArea.top - 12} y2={lifespanArea.top - 8} />
              <text x={xScale(y)} y={lifespanArea.top - 16} textAnchor="middle">
                {y}
              </text>
            </g>
          ))}
        </g>

        {pinNodes.map((node, i) => (
          <g
            key={`pin-${node.pin.id}-${i}`}
            className="timeline-pin"
            onMouseEnter={(e) => {
              setHoveredPinId(node.pin.id);
              const entity: HoverEntity = {
                kind: "story",
                name: node.pin.title,
                description: node.pin.takeaway,
              };
              show(entity, e.clientX, e.clientY);
            }}
            onMouseMove={(e) => {
              const entity: HoverEntity = {
                kind: "story",
                name: node.pin.title,
                description: node.pin.takeaway,
              };
              show(entity, e.clientX, e.clientY);
            }}
            onMouseLeave={() => {
              setHoveredPinId(null);
              hide();
            }}
            onClick={() => router.push(`/story/${node.pin.id}`)}
          >
            <line
              x1={node.x}
              x2={node.x}
              y1={node.y + 3}
              y2={lifespanArea.top - 6}
              stroke="var(--rule)"
              strokeWidth={0.6}
            />
            <circle
              cx={node.x}
              cy={node.y}
              r={hoveredPinId === node.pin.id ? 5 : 3.2}
              fill={node.color}
              stroke="var(--bg)"
              strokeWidth={1.2}
            />
          </g>
        ))}

        {packed.map((row, ri) =>
          row.map(({ person, x0, x1 }) => {
            const y = lifespanArea.top + ri * rowH + (rowH - barH) / 2;
            const fc = FIELD_COLOR[person.field];
            const width = Math.max(2, x1 - x0);
            return (
              <g
                key={person.slug}
                className="timeline-lifespan"
                onMouseEnter={(e) =>
                  show(
                    {
                      kind: "person",
                      name: person.name,
                      description: person.description,
                      birth_year: person.birth_year,
                      death_year: person.death_year,
                      occupation: person.occupation,
                      slug: person.slug,
                    },
                    e.clientX,
                    e.clientY,
                  )
                }
                onMouseMove={(e) =>
                  show(
                    {
                      kind: "person",
                      name: person.name,
                      description: person.description,
                      birth_year: person.birth_year,
                      death_year: person.death_year,
                      occupation: person.occupation,
                      slug: person.slug,
                    },
                    e.clientX,
                    e.clientY,
                  )
                }
                onMouseLeave={hide}
                onClick={() => router.push(`/person/${person.slug}`)}
              >
                <rect
                  x={x0}
                  y={y}
                  width={width}
                  height={barH}
                  rx={barH / 2}
                  ry={barH / 2}
                  fill={fc}
                  opacity={0.35}
                />
                <rect
                  x={x0}
                  y={y + barH / 2 - 0.6}
                  width={width}
                  height={1.2}
                  fill={fc}
                  opacity={0.95}
                />
                <circle cx={x0} cy={y + barH / 2} r={3} fill={fc} />
                <circle cx={x1} cy={y + barH / 2} r={3} fill={fc} />
                {width > 60 && (
                  <text x={x0 + 6} y={y + barH / 2 + 4}>
                    {person.short}
                  </text>
                )}
              </g>
            );
          }),
        )}

        {dust.length > 0 && (
          <g className="timeline-dust">
            {dust.map(({ person, x0, x1 }) => {
              const fc = FIELD_COLOR[person.field];
              const w = Math.max(1, x1 - x0);
              return (
                <line
                  key={`dust-${person.slug}`}
                  x1={x0}
                  x2={x0 + w}
                  y1={dustTop + 4}
                  y2={dustTop + 4}
                  stroke={fc}
                  strokeWidth={1}
                  opacity={0.32}
                  onMouseEnter={(e) =>
                    show(
                      {
                        kind: "person",
                        name: person.name,
                        description: person.description,
                        birth_year: person.birth_year,
                        death_year: person.death_year,
                        occupation: person.occupation,
                        slug: person.slug,
                      },
                      e.clientX,
                      e.clientY,
                    )
                  }
                  onMouseLeave={hide}
                  onClick={() => router.push(`/person/${person.slug}`)}
                  style={{ cursor: "pointer" }}
                />
              );
            })}
            <text
              x={M.l}
              y={dustTop}
              fontFamily="var(--mono)"
              fontSize={10}
              fill="var(--ink-mute)"
            >
              + {dust.length} more · zoom in to read
            </text>
          </g>
        )}
      </svg>
      <div
        style={{
          padding: "0 0 14px",
          fontSize: 11.5,
          color: "var(--ink-mute)",
          display: "flex",
          gap: 22,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span style={{ fontFamily: "var(--mono)" }}>
          scroll to zoom · drag to pan · click a name or pin
        </span>
        <span style={{ flex: 1 }} />
        <Legend />
      </div>
    </div>
  );
}

function Legend() {
  const kinds: StoryKind[] = ["anecdote", "experiment", "fun_fact", "quote", "surprise", "claim", "history"];
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {kinds.map((k) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: KIND_COLORS[k] }} />
          <span style={{ fontSize: 11, color: "var(--ink-mute)" }}>{KIND_LABELS[k]}</span>
        </span>
      ))}
    </div>
  );
}

/** Mobile fallback: chronological list grouped by century. */
export function TimelineMobile({
  people,
  pins,
}: {
  people: TimelinePersonInput[];
  pins: TimelinePinInput[];
}) {
  const router = useRouter();
  const groups = useMemo(() => {
    const map = new Map<number, TimelinePinInput[]>();
    for (const p of pins) {
      const century = Math.floor(p.year / 100);
      const arr = map.get(century) ?? [];
      arr.push(p);
      map.set(century, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [pins]);

  if (!people.length && !pins.length) {
    return (
      <div style={{ padding: "24px 0", color: "var(--ink-mute)", fontStyle: "italic" }}>
        Timeline empty — ingest some videos to populate it.
      </div>
    );
  }
  void inferField; // keep import-of-use stable

  return (
    <div style={{ padding: "12px 0 24px" }}>
      {groups.map(([century, items]) => (
        <section key={century} style={{ marginBottom: 24 }}>
          <h4 className="smallcaps" style={{ marginBottom: 12 }}>
            {century}00s
          </h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((p) => (
              <li
                key={p.id}
                onClick={() => router.push(`/story/${p.id}`)}
                style={{
                  padding: "8px 0",
                  borderTop: "1px solid var(--rule-soft)",
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "60px 1fr",
                  gap: 16,
                }}
              >
                <span style={{ fontFamily: "var(--mono)", color: "var(--ink-mute)", fontSize: 12 }}>
                  {p.year}
                </span>
                <span style={{ fontFamily: "var(--serif)", fontSize: 15, color: "var(--ink)" }}>
                  {p.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

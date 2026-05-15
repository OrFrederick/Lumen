"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type WheelEvent,
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
const CLAMP_MIN_YEAR = 1500;

function clampZoom(from: number, to: number, maxYear: number): { from: number; to: number } {
  let f = from;
  let t = to;
  const span = t - f;
  if (span < MIN_SPAN) return { from: f, to: f + MIN_SPAN };
  if (span > MAX_SPAN) return { from: f, to: f + MAX_SPAN };
  if (f < CLAMP_MIN_YEAR) {
    t += CLAMP_MIN_YEAR - f;
    f = CLAMP_MIN_YEAR;
  }
  if (t > maxYear) {
    f -= t - maxYear;
    t = maxYear;
  }
  if (f < CLAMP_MIN_YEAR) f = CLAMP_MIN_YEAR;
  return { from: f, to: t };
}

export function Timeline({
  people,
  pins,
  storyCount,
  videoCount,
  initialFrom,
  initialTo,
}: {
  people: TimelinePersonInput[];
  pins: TimelinePinInput[];
  storyCount: number;
  videoCount: number;
  initialFrom?: number;
  initialTo?: number;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const { show, hide } = useHover();

  const maxYear = useMemo(() => {
    const ya = people.length ? Math.max(...people.map((p) => p.death_year)) : 2030;
    const yb = pins.length ? Math.max(...pins.map((p) => p.year)) : 2030;
    const now = new Date().getUTCFullYear();
    return Math.max(ya, yb, now);
  }, [people, pins]);

  const [width, setWidth] = useState(1100);
  const [zoom, setZoom] = useState<{ from: number; to: number }>(() => {
    if (initialFrom != null && initialTo != null) return { from: initialFrom, to: initialTo };
    const earliest = people.length
      ? Math.min(...people.map((p) => p.birth_year))
      : 1700;
    return clampZoom(Math.max(CLAMP_MIN_YEAR, earliest - 20), maxYear + 10, maxYear);
  });
  const [hoveredPinId, setHoveredPinId] = useState<number | null>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(Math.max(640, entry.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
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
        .sort((a, b) => a.birth_year - b.birth_year),
    [people, zoom],
  );

  const pinsFiltered = useMemo(
    () => pins.filter((p) => p.year >= zoom.from && p.year <= zoom.to),
    [pins, zoom],
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
  const lifespanH = lifespanArea.bottom - lifespanArea.top;

  // Greedy row-packing of lifespan bars.
  const packed = useMemo(() => {
    const rows: { person: TimelinePersonInput; x0: number; x1: number }[][] = [];
    for (const p of peopleFiltered) {
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
      if (!placed) rows.push([{ person: p, x0, x1 }]);
    }
    return rows;
  }, [peopleFiltered, xScale]);

  const rowH = lifespanH / Math.max(packed.length, 1);
  const barH = Math.min(rowH - 4, 16);

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

  // Pan & zoom
  const dragRef = useRef<{ x: number; from: number; to: number } | null>(null);
  const onMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, from: zoom.from, to: zoom.to };
  };
  const onMouseMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const span = dragRef.current.to - dragRef.current.from;
    const dy = -dx / innerW * span;
    setZoom(clampZoom(dragRef.current.from + dy, dragRef.current.to + dy, maxYear));
  };
  useEffect(() => {
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const onWheel = (e: WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const center = yearOfX(mx);
    const factor = Math.exp(e.deltaY * 0.0015);
    const newSpan = (zoom.to - zoom.from) * factor;
    if (newSpan < MIN_SPAN || newSpan > MAX_SPAN) return;
    const t = (center - zoom.from) / (zoom.to - zoom.from);
    let from = center - t * newSpan;
    let to = center + (1 - t) * newSpan;
    setZoom(clampZoom(from, to, maxYear));
  };

  const activePreset = PRESETS.find(
    (p) => Math.abs(p.range[0] - zoom.from) < 2 && Math.abs(p.range[1] - zoom.to) < 2,
  );

  const goPreset = (preset: Preset) => {
    setZoom(clampZoom(preset.range[0], preset.range[1], maxYear));
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
        className="timeline-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
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

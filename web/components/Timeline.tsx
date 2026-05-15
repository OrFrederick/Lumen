"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import Link from "next/link";
import type { StoryKind, TimelineData } from "@/lib/types";

const KIND_COLORS: Record<StoryKind, string> = {
  anecdote: "#3b82f6", // blue
  experiment: "#10b981", // green
  fun_fact: "#a855f7", // purple
  history: "#f59e0b", // amber
  quote: "#9ca3af", // gray
  surprise: "#ec4899", // pink
  claim: "#ef4444", // red
};

interface Props {
  data: TimelineData;
  height?: number;
}

interface SelectedPin {
  id: number;
  title: string | null;
  kind: StoryKind | null;
  year: number;
}

export default function Timeline({ data, height = 600 }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState(1024);
  const [selected, setSelected] = useState<SelectedPin | null>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [transform, setTransform] = useState(() => zoomIdentity);

  // Track container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const margin = { top: 24, right: 24, bottom: 32, left: 24 };
  const innerW = Math.max(50, width - margin.left - margin.right);
  const innerH = Math.max(50, height - margin.top - margin.bottom);

  const baseScale: ScaleLinear<number, number> = useMemo(() => {
    const { min, max } = data.domain;
    const pad = Math.max(2, Math.floor((max - min) * 0.02));
    return scaleLinear().domain([min - pad, max + pad]).range([0, innerW]);
  }, [data.domain, innerW]);

  const xScale = useMemo(() => transform.rescaleX(baseScale), [baseScale, transform]);

  // d3-zoom wiring.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 200])
      .translateExtent([
        [0, 0],
        [innerW, innerH],
      ])
      .extent([
        [0, 0],
        [innerW, innerH],
      ])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        setTransform(event.transform);
      });
    const sel = select(svg);
    sel.call(z);
    return () => {
      sel.on(".zoom", null);
    };
  }, [innerW, innerH]);

  // Lifespans: simple stacked rows.
  const lifespanRows = useMemo(() => {
    const rows: number[] = []; // tracks the rightmost x per row
    return data.lifespans.map((p) => {
      const start = p.birth_year ?? data.domain.min;
      const end = p.death_year ?? new Date().getUTCFullYear();
      let row = 0;
      while (row < rows.length && rows[row]! > start) row += 1;
      rows[row] = end + 4;
      return { ...p, start, end, row };
    });
  }, [data.lifespans, data.domain.min]);

  const lifespanArea = { top: 8, rowHeight: 14, gap: 2 };
  const eraArea = { top: lifespanArea.top + (Math.max(1, Math.min(lifespanRows.length, 18)) * (lifespanArea.rowHeight + lifespanArea.gap)) + 12, height: 28 };
  const pinArea = { top: eraArea.top + eraArea.height + 24 };

  // Generate ticks from current scale.
  const ticks = xScale.ticks(Math.max(6, Math.floor(innerW / 90)));

  const isEmpty =
    data.lifespans.length === 0 &&
    data.eras.length === 0 &&
    data.pins.length === 0 &&
    data.publishDates.length === 0;

  return (
    <div className="relative w-full" ref={wrapRef}>
      {isEmpty ? (
        <div
          className="flex items-center justify-center rounded border border-dashed border-current/20 text-sm opacity-70"
          style={{ height }}
        >
          No timeline data yet. Run the ingest → extract → enrich pipeline, then refresh.
        </div>
      ) : (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label="Lumen timeline of lifespans, eras, and story pins"
          className="cursor-grab active:cursor-grabbing select-none"
          onMouseLeave={() => setHoverYear(null)}
        >
          <defs>
            <clipPath id="lumen-clip">
              <rect x={0} y={0} width={innerW} height={innerH} />
            </clipPath>
          </defs>
          <g transform={`translate(${margin.left},${margin.top})`}>
            {/* Background */}
            <rect x={0} y={0} width={innerW} height={innerH} fill="transparent" />

            {/* Axis ticks (year) */}
            <g className="timeline-axis" transform={`translate(0,${innerH})`}>
              <line x1={0} x2={innerW} y1={0} y2={0} />
              {ticks.map((t) => (
                <g key={t} transform={`translate(${xScale(t)},0)`}>
                  <line y1={-innerH} y2={4} />
                  <text y={16} textAnchor="middle">
                    {Math.round(t)}
                  </text>
                </g>
              ))}
            </g>

            {/* Clipped data layers */}
            <g clipPath="url(#lumen-clip)">
              {/* Lifespans */}
              <g>
                {lifespanRows.map((p) => {
                  const x1 = xScale(p.start);
                  const x2 = xScale(p.end);
                  const y =
                    lifespanArea.top +
                    (p.row % 18) * (lifespanArea.rowHeight + lifespanArea.gap);
                  if (x2 < 0 || x1 > innerW) return null;
                  return (
                    <g key={`life-${p.id}`}>
                      <rect
                        x={Math.max(0, x1)}
                        y={y}
                        width={Math.max(1, Math.min(innerW, x2) - Math.max(0, x1))}
                        height={lifespanArea.rowHeight - 2}
                        rx={2}
                        fill="currentColor"
                        opacity={0.18}
                      >
                        <title>
                          {p.name} ({p.birth_year ?? "?"}–{p.death_year ?? "present"})
                          {p.occupation ? ` · ${p.occupation}` : ""}
                        </title>
                      </rect>
                      {x2 - x1 > 60 ? (
                        <text
                          x={Math.max(2, x1) + 4}
                          y={y + lifespanArea.rowHeight - 5}
                          fontSize={9}
                          fill="currentColor"
                          opacity={0.7}
                          style={{ pointerEvents: "none" }}
                        >
                          {p.name}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>

              {/* Eras */}
              <g>
                {data.eras.map((e) => {
                  if (e.era_start == null || e.era_end == null) return null;
                  const x1 = xScale(e.era_start);
                  const x2 = xScale(e.era_end);
                  if (x2 < 0 || x1 > innerW) return null;
                  return (
                    <rect
                      key={`era-${e.id}`}
                      x={Math.max(0, x1)}
                      y={eraArea.top}
                      width={Math.max(1, Math.min(innerW, x2) - Math.max(0, x1))}
                      height={eraArea.height}
                      rx={3}
                      fill="#f59e0b"
                      opacity={0.18}
                    >
                      <title>
                        {e.name} ({e.era_start}–{e.era_end})
                      </title>
                    </rect>
                  );
                })}
              </g>

              {/* Story pins */}
              <g>
                {data.pins.map((pin) => {
                  const x = xScale(pin.historical_year);
                  if (x < -8 || x > innerW + 8) return null;
                  const color = pin.kind ? KIND_COLORS[pin.kind] : "#64748b";
                  return (
                    <circle
                      key={`pin-${pin.id}`}
                      cx={x}
                      cy={pinArea.top}
                      r={4}
                      fill={color}
                      stroke="white"
                      strokeWidth={0.5}
                      onClick={() =>
                        setSelected({
                          id: pin.id,
                          title: pin.title,
                          kind: pin.kind,
                          year: pin.historical_year,
                        })
                      }
                      onMouseEnter={() => setHoverYear(pin.historical_year)}
                      style={{ cursor: "pointer" }}
                    >
                      <title>
                        {pin.title ?? "Untitled"} ({pin.historical_year})
                      </title>
                    </circle>
                  );
                })}
              </g>

              {/* Publish-date markers */}
              <g>
                {data.publishDates.map((v) => {
                  const x = xScale(v.year);
                  if (x < 0 || x > innerW) return null;
                  return (
                    <line
                      key={`pub-${v.id}`}
                      x1={x}
                      x2={x}
                      y1={pinArea.top + 14}
                      y2={pinArea.top + 28}
                      stroke="currentColor"
                      opacity={0.35}
                    >
                      <title>
                        Video: {v.title ?? v.id} ({v.year})
                      </title>
                    </line>
                  );
                })}
              </g>
            </g>
          </g>
        </svg>
      )}

      {/* Floating hover indicator */}
      {hoverYear != null ? (
        <div className="pointer-events-none absolute top-1 right-2 text-xs opacity-60 font-mono">
          {hoverYear}
        </div>
      ) : null}

      {/* Selected pin → quick popover with link to /story/[id] */}
      {selected ? (
        <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-96 rounded-lg border border-current/20 bg-paper dark:bg-[#0b0d12] shadow-lg p-3 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold">{selected.title ?? "Untitled story"}</div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="opacity-60 hover:opacity-100"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="text-xs opacity-60 mt-0.5">
            {selected.year}
            {selected.kind ? ` · ${selected.kind}` : ""}
          </div>
          <div className="mt-2">
            <Link
              href={`/story/${selected.id}`}
              className="text-accent text-sm underline-offset-2 hover:underline"
            >
              Open story →
            </Link>
          </div>
        </div>
      ) : null}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs opacity-70">
        {(Object.keys(KIND_COLORS) as StoryKind[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: KIND_COLORS[k] }}
            />
            {k}
          </span>
        ))}
        <span className="ml-2">drag to pan · scroll to zoom</span>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StoryCard } from "./StoryCard";
import {
  FIELDS,
  FIELD_LABELS,
  KIND_LABELS,
  type Field,
  type EntityView,
  type StoryView,
} from "@/lib/view";
import type { StoryKind } from "@/lib/types";

type StoryRecord = {
  story: StoryView;
  entities: EntityView[];
  fields: Field[];
};

export type VideoSummary = { id: string; title: string };

export function HomeBody({
  records,
  videos,
}: {
  records: StoryRecord[];
  videos: VideoSummary[];
}) {
  const [field, setField] = useState<"all" | Field>("all");
  const [kind, setKind] = useState<"all" | StoryKind>("all");

  const fieldCounts = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = { all: records.length };
    for (const f of FIELDS) out[f] = 0;
    out.other = 0;
    for (const r of records) {
      const seen = new Set<Field>();
      for (const f of r.fields) {
        if (!seen.has(f)) {
          out[f] = (out[f] ?? 0) + 1;
          seen.add(f);
        }
      }
    }
    return out;
  }, [records]);

  const kindCounts = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = { all: records.length };
    for (const k of Object.keys(KIND_LABELS) as StoryKind[]) out[k] = 0;
    for (const r of records) if (r.story.kind) out[r.story.kind] = (out[r.story.kind] ?? 0) + 1;
    return out;
  }, [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (kind !== "all" && r.story.kind !== kind) return false;
      if (field !== "all" && !r.fields.includes(field as Field)) return false;
      return true;
    });
  }, [records, field, kind]);

  return (
    <section className="shell layout-with-sidebar" id="all-stories">
      <aside className="sidebar">
        <div className="filter-group">
          <h4>Field</h4>
          <FilterRow
            label="All fields"
            value="all"
            active={field}
            setActive={(v) => setField(v as "all" | Field)}
            count={fieldCounts.all ?? 0}
          />
          {FIELDS.map((f) => (
            <FilterRow
              key={f}
              label={FIELD_LABELS[f]}
              value={f}
              active={field}
              setActive={(v) => setField(v as "all" | Field)}
              count={fieldCounts[f] ?? 0}
            />
          ))}
        </div>
        <div className="filter-group">
          <h4>Kind</h4>
          <FilterRow
            label="All kinds"
            value="all"
            active={kind}
            setActive={(v) => setKind(v as "all" | StoryKind)}
            count={kindCounts.all ?? 0}
          />
          {(Object.entries(KIND_LABELS) as [StoryKind, string][]).map(([k, label]) => (
            <FilterRow
              key={k}
              label={label}
              value={k}
              active={kind}
              setActive={(v) => setKind(v as "all" | StoryKind)}
              count={kindCounts[k] ?? 0}
              dotColor={`var(--kind-${k})`}
            />
          ))}
        </div>
        <div className="filter-group">
          <h4>Videos</h4>
          {videos.map((v) => (
            <Link
              key={v.id}
              href={`/video/${v.id}`}
              className="filter-item"
              style={{ display: "flex" }}
            >
              <span
                className="fi-name"
                style={{
                  fontFamily: "var(--serif)",
                  fontSize: 14,
                  fontStyle: "italic",
                  textWrap: "balance",
                }}
              >
                {v.title}
              </span>
            </Link>
          ))}
        </div>
      </aside>
      <div className="content">
        <div className="section-title" style={{ paddingTop: 0 }}>
          <h2>
            All moments{" "}
            <span
              style={{
                color: "var(--ink-mute)",
                fontFamily: "var(--mono)",
                fontSize: 16,
                fontWeight: 400,
                letterSpacing: 0,
              }}
            >
              · {filtered.length}
            </span>
          </h2>
        </div>
        {filtered.map((r) => (
          <StoryCard key={r.story.id} story={r.story} entities={r.entities} />
        ))}
        {filtered.length === 0 && (
          <div
            style={{
              padding: "64px 0",
              color: "var(--ink-mute)",
              fontFamily: "var(--serif)",
              fontSize: 18,
              fontStyle: "italic",
            }}
          >
            No moments match these filters yet.
          </div>
        )}
      </div>
    </section>
  );
}

function FilterRow({
  label,
  value,
  active,
  setActive,
  count,
  dotColor,
}: {
  label: string;
  value: string;
  active: string;
  setActive: (v: string) => void;
  count: number;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      className={`filter-item ${active === value ? "active" : ""}`}
      onClick={() => setActive(value)}
    >
      <span className="fi-name">
        {dotColor && (
          <span
            style={{
              display: "inline-block",
              width: 7,
              height: 7,
              background: dotColor,
              borderRadius: 2,
              marginRight: 8,
              verticalAlign: "middle",
            }}
          />
        )}
        {label}
      </span>
      <span className="fi-count">{count}</span>
    </button>
  );
}

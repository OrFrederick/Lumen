"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Body } from "./Body";
import { EntityChip } from "./EntityChip";
import { KindBadge } from "./KindBadge";
import type { StoryView, EntityView } from "@/lib/view";
import { youtubeMomentUrl } from "@/lib/view";

interface StoryCardProps {
  story: StoryView;
  entities: EntityView[];
  variant?: "list" | "featured";
}

export function StoryCard({ story, entities, variant = "list" }: StoryCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  if (variant === "featured") {
    return (
      <article
        className="feat"
        onClick={() => router.push(`/story/${story.id}`)}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") router.push(`/story/${story.id}`);
        }}
      >
        <KindBadge kind={story.kind} />
        <h3 className="feat-title">{story.title}</h3>
        {story.takeaway && <p className="feat-takeaway">{story.takeaway}</p>}
        <div className="feat-meta">
          {story.year != null && <span>{story.year}</span>}
          {story.year != null && story.video_channel && <span>·</span>}
          {story.video_channel && <span>{story.video_channel}</span>}
        </div>
      </article>
    );
  }

  return (
    <article className="story-card">
      <div className="sc-year">{story.year ?? ""}</div>
      <div className="sc-main">
        <div className="sc-head">
          <KindBadge kind={story.kind} />
          {story.video_title && <span className="sc-video">· {story.video_title}</span>}
        </div>
        <Link href={`/story/${story.id}`} className="sc-title">
          {story.title}
        </Link>
        {story.takeaway && <p className="sc-takeaway">{story.takeaway}</p>}
        <div className={`sc-body ${expanded ? "expanded" : ""}`}>
          <p style={{ margin: 0 }}>
            <Body text={story.body} entities={entities} />
          </p>
        </div>
        {entities.length > 0 && (
          <div className="sc-entities">
            {entities.slice(0, 4).map((e) => (
              <EntityChip key={e.id} entity={e} variant="pill" />
            ))}
          </div>
        )}
        <div className="sc-actions">
          {story.body && (
            <button
              type="button"
              className="sc-btn"
              onClick={() => setExpanded((x) => !x)}
              aria-expanded={expanded}
            >
              {expanded ? "Hide story" : "Read story"}
            </button>
          )}
          <Link href={`/story/${story.id}`} className="sc-btn primary">
            Open ↗
          </Link>
          <a
            className="sc-btn"
            href={youtubeMomentUrl(story.video_id, story.ts_start)}
            target="_blank"
            rel="noreferrer noopener"
          >
            Watch this moment ↗
          </a>
        </div>
      </div>
    </article>
  );
}

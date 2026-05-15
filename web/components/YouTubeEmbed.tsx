"use client";

import { useState } from "react";

/**
 * Lazy YouTube embed.
 *
 * Renders the YouTube thumbnail (hqdefault) with a play button overlay. When
 * the user clicks Play, swaps the thumbnail for an iframe with autoplay=1 and
 * the right start offset. The first paint stays cheap; we don't drag in the
 * YouTube player iframe (~500KB) until the user actually wants it.
 */
export function YouTubeEmbed({
  videoId,
  startSec,
  title,
  aspect = "16/9",
}: {
  videoId: string;
  startSec?: number | null;
  title?: string | null;
  aspect?: string;
}) {
  const [active, setActive] = useState(false);
  const start = startSec && startSec > 0 ? Math.floor(startSec) : 0;
  const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const embedSrc = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&rel=0`;

  if (active) {
    return (
      <div
        style={{
          aspectRatio: aspect,
          width: "100%",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          background: "#000",
        }}
      >
        <iframe
          src={embedSrc}
          title={title ?? "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0, display: "block" }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="vp-thumb"
      onClick={() => setActive(true)}
      aria-label={title ? `Play ${title}` : "Play video"}
      style={{ width: "100%", aspectRatio: aspect, position: "relative", display: "flex" }}
    >
      <img src={thumbUrl} alt={title ?? "Video thumbnail"} />
      <div className="play-btn">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 3l16 9-16 9V3z" />
        </svg>
      </div>
    </button>
  );
}

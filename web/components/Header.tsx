"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";

export type HeaderSearchResult =
  | { kind: "story"; id: number; title: string; story_kind: string | null }
  | {
      kind: "person";
      slug: string;
      name: string;
      birth_year: number | null;
      death_year: number | null;
    };

/** Render FTS5 snippet output (which only contains <mark>...</mark>) safely. */
function renderHighlightedSnippet(snippet: string): React.ReactNode {
  // reason: input is server-controlled FTS5 snippet output with only <mark> tags.
  // We split on those tags and rebuild as React nodes; no raw HTML is injected.
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  while (cursor < snippet.length) {
    const openIdx = snippet.indexOf("<mark>", cursor);
    if (openIdx === -1) {
      parts.push(snippet.slice(cursor));
      break;
    }
    if (openIdx > cursor) parts.push(snippet.slice(cursor, openIdx));
    const closeIdx = snippet.indexOf("</mark>", openIdx + 6);
    if (closeIdx === -1) {
      parts.push(snippet.slice(openIdx));
      break;
    }
    parts.push(<mark key={key++}>{snippet.slice(openIdx + 6, closeIdx)}</mark>);
    cursor = closeIdx + 7;
  }
  return parts;
}

export function Header({ storyCount, personCount }: { storyCount: number; personCount: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<HeaderSearchResult[]>([]);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(needle)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { results: HeaderSearchResult[] };
        setResults(data.results.slice(0, 8));
      } catch {
        setResults([]);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q]);

  const isActive = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));

  const goto = (href: string) => {
    setQ("");
    setResults([]);
    router.push(href);
  };

  return (
    <header className="l-header">
      <div className="shell l-header-inner">
        <Link href="/" className="l-wordmark">
          Lumen
        </Link>
        <nav className="l-nav">
          <Link href="/" className={isActive("/") ? "active" : ""}>
            Library
          </Link>
          <Link href="/walk" className={isActive("/walk") ? "active" : ""}>
            Walk
          </Link>
        </nav>
        <div className="l-spacer" />
        <label className="l-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            placeholder={`Search ${storyCount} stories, ${personCount} people…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            aria-label="Search Lumen"
          />
          {!q && <kbd>⌘K</kbd>}
          {q && focused && results.length > 0 && (
            <div className="search-dropdown">
              {results.map((r, i) => {
                if (r.kind === "story") {
                  return (
                    <div
                      key={`s-${r.id}-${i}`}
                      className="sr-row"
                      onClick={() => goto(`/story/${r.id}`)}
                    >
                      <div className="sr-eyebrow">
                        Story{r.story_kind ? ` · ${r.story_kind}` : ""}
                      </div>
                      <div className="sr-title">{renderHighlightedSnippet(r.title)}</div>
                    </div>
                  );
                }
                return (
                  <div
                    key={`p-${r.slug}-${i}`}
                    className="sr-row"
                    onClick={() => goto(`/person/${r.slug}`)}
                  >
                    <div className="sr-eyebrow">Person</div>
                    <div className="sr-title">
                      {r.name}{" "}
                      <span
                        style={{
                          color: "var(--ink-mute)",
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                        }}
                      >
                        {r.birth_year ?? "?"}–{r.death_year ?? "?"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </label>
        <ThemeToggle />
      </div>
    </header>
  );
}

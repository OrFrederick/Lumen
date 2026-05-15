"use client";

import { useState, type FormEvent } from "react";

interface Hit {
  id: number;
  title: string | null;
  snippet: string;
}

export default function SearchBar() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error(`search failed: ${res.status}`);
      const data = (await res.json()) as { results: Hit[] };
      setHits(data.results);
    } catch (err) {
      setError((err as Error).message);
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  // reason: FTS5 snippet uses <mark>…</mark> we control on the server; safe to render as HTML.
  function renderSnippet(html: string): { __html: string } {
    return { __html: html };
  }

  return (
    <div className="w-full">
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stories — e.g. 'Einstein elevator'"
          className="flex-1 rounded-md border border-current/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          aria-label="Search stories"
        />
        <button
          type="submit"
          disabled={loading || !q.trim()}
          className="rounded-md border border-current/15 bg-accent text-white px-3 py-2 text-sm disabled:opacity-40"
        >
          {loading ? "…" : "Search"}
        </button>
      </form>
      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
      {hits.length > 0 ? (
        <ul className="mt-3 space-y-2 max-h-64 overflow-auto">
          {hits.map((h) => (
            <li key={h.id}>
              <a
                href={`/story/${h.id}`}
                className="block rounded border border-current/10 p-2 hover:bg-current/5"
              >
                <div className="text-sm font-medium">{h.title ?? "Untitled story"}</div>
                <div
                  className="text-xs opacity-75"
                  dangerouslySetInnerHTML={renderSnippet(h.snippet)}
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

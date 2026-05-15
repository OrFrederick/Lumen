import Link from "next/link";

interface Props {
  videoId: string;
  tsStart: number | null;
  label?: string;
}

export default function WatchButton({ videoId, tsStart, label = "Watch this moment" }: Props) {
  const t = tsStart != null ? `&t=${Math.max(0, Math.floor(tsStart))}s` : "";
  const href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}${t}`;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-current/20 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/20 transition"
    >
      <span aria-hidden>▶</span>
      <span>{label}</span>
    </Link>
  );
}

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

type Chapter = { id: string; title: string; start: number; end: number };
type Cue = { start: number; text: string };

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function parseVtt(vtt: string): Cue[] {
  return vtt.split(/\n\n+/).map((block) => {
    const m = block.match(/(\d+):(\d+):(\d+)\.(\d+)\s+-->/);
    const text = block.split("\n").slice(m ? 2 : 1).join(" ").trim();
    return m && text ? { start: +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, text } : null;
  }).filter((c): c is Cue => !!c);
}

/** One full-length tutorial video with a chapter list that seeks, and a transcript that stays in step with playback. */
export default function DocVideo({ name, title }: { name: string; title: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [cues, setCues] = useState<Cue[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let live = true;
    fetch(`videos/${name}.chapters.json`).then((r) => (r.ok ? r.json() : [])).then((c) => live && setChapters(Array.isArray(c) ? c : [])).catch(() => {});
    fetch(`videos/${name}.vtt`).then((r) => (r.ok ? r.text() : "")).then((t) => live && setCues(parseVtt(t))).catch(() => {});
    return () => { live = false; };
  }, [name]);
  const seek = (t: number) => { const v = video.current; if (!v) return; v.currentTime = t; void v.play().catch(() => {}); };
  const active = chapters.findIndex((c) => now >= c.start && now < c.end);
  return (
    <figure className="doc-video" data-testid={`doc-video-${name}`}>
      <video ref={video} controls preload="metadata" playsInline poster={`videos/${name}.png`} src={`videos/${name}.mp4`} aria-label={`Video: ${title}`} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}>
        <track kind="captions" src={`videos/${name}.vtt`} srcLang="en" label="English" default />
      </video>
      {chapters.length > 0 && (
        <ol className="doc-chapters" aria-label="Chapters">
          {chapters.map((c, i) => (
            <li key={c.id}><button className={i === active ? "active" : ""} onClick={() => seek(c.start)} data-testid={`chapter-${c.id}`}><Play size={11} aria-hidden="true" /><span>{c.title}</span><time>{stamp(c.start)}</time></button></li>
          ))}
        </ol>
      )}
      {cues.length > 0 && (
        <details className="doc-transcript">
          <summary>Transcript</summary>
          <p>{cues.map((c, i) => <button key={i} className={now >= c.start && (cues[i + 1] ? now < cues[i + 1].start : true) ? "active" : ""} onClick={() => seek(c.start)}>{c.text} </button>)}</p>
        </details>
      )}
    </figure>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { EXAMPLES, buildExample, exampleDuration } from "@shared/examples";
import { timelineDuration } from "@shared/timeline";
import ForgePreview from "./forge-preview";
import { CodeBlock } from "./forge-public";

const noop = () => {};
const gesture = { begin: noop, end: noop, update: noop };

/** Live gallery: every example is a list of ops compiled by the same engine the Studio and the renderer use. */
export default function ExampleGallery() {
  const [id, setId] = useState(EXAMPLES[0].id);
  const example = EXAMPLES.find(e => e.id === id) ?? EXAMPLES[0];
  const timeline = useMemo(() => buildExample(example), [example]);
  const duration = Math.max(.5, useMemo(() => exampleDuration(example), [example]));
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { setTime(0); }, [id]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now();
    const tick = (now: number) => { const dt = (now - last) / 1000; last = now; setTime(t => (t + dt) % duration); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  const ops = JSON.stringify({ ops: example.ops }, null, 2);
  return <div className="example-gallery" data-testid="example-gallery">
    <div className="example-tabs" role="tablist" aria-label="Example compositions">
      {EXAMPLES.map(e => <button key={e.id} role="tab" aria-selected={e.id === id} className={e.id === id ? "active" : ""} onClick={() => setId(e.id)} data-testid={`example-${e.id}`}>{e.title}</button>)}
    </div>
    <div className="motion-demo">
      <div className="demo-head"><span className="mono">examples / {example.id}</span><span className="demo-live">LIVE · {timelineDuration(timeline).toFixed(1)}s LOOP</span></div>
      <div className="demo-monitor example-monitor"><ForgePreview timeline={timeline} assets={[]} time={time} playing={playing} selectedId={null} readOnly gesture={gesture} mediaUrl={() => ""} onError={noop} onValues={noop} /></div>
      <div className="demo-controls">
        <button aria-label={playing ? "Pause example" : "Play example"} onClick={() => setPlaying(p => !p)} data-testid="example-play">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
        <button aria-label="Restart example" onClick={() => setTime(0)}><RotateCcw size={15} /></button>
        <input aria-label="Example playhead" type="range" min={0} max={Math.max(.01, duration - .01)} step={.01} value={Math.min(time, duration - .01)} onChange={e => { setPlaying(false); setTime(Number(e.target.value)); }} />
        <span className="mono">{time.toFixed(2)}s</span>
      </div>
    </div>
    <div className="example-meta"><h3>{example.title}</h3><p>{example.summary}</p><ul className="example-features">{example.features.map(f => <li key={f}>{f}</li>)}</ul></div>
    <CodeBlock code={ops} label={`POST /api/projects/:id/timeline/ops  ·  ${example.ops.length} ops`} />
  </div>;
}

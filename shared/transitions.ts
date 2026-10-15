import { clipDuration, clipEnd, normalizeTimeline, TRANSITION_TYPES, type Clip, type Timeline } from './timeline';
export const TRANSITIONS = TRANSITION_TYPES;
export const TRANSITION_LABELS: Record<string,string> = { none: 'None', dissolve: 'Dissolve', 'wipe-left': 'Wipe from left', 'wipe-right': 'Wipe from right', 'wipe-up': 'Wipe from bottom', 'wipe-down': 'Wipe from top', iris: 'Iris open', 'barn-h': 'Barn doors (horizontal)', 'barn-v': 'Barn doors (vertical)', diamond: 'Diamond open', 'wipe-diagonal': 'Diagonal wipe' };
export type TransitionType = typeof TRANSITIONS[number];
export type Transition = { fromClipId: string; type: TransitionType; duration: number };
export function incomingTransition(t: Timeline, c: Clip): Transition | undefined {
  const tr = c.transitionIn, from = tr && t.clips.find(x => x.id === tr.fromClipId);
  if (!tr || !from || from.track !== 'video' || c.track !== 'video' || from.start >= c.start || Math.abs(clipEnd(from) - c.start - tr.duration) > .04) return;
  return tr;
}
/** CSS clip-path for a transition at progress p (0..1); the FFmpeg renderer draws the same shapes with geq. */
export function transitionClipPath(type: string, p: number): string | undefined {
  switch (type) {
    case 'wipe-left': return `inset(0 ${(1-p)*100}% 0 0)`;
    case 'wipe-right': return `inset(0 0 0 ${(1-p)*100}%)`;
    case 'wipe-up': return `inset(${(1-p)*100}% 0 0 0)`;
    case 'wipe-down': return `inset(0 0 ${(1-p)*100}% 0)`;
    case 'iris': return `circle(${p*70.711}% at 50% 50%)`;
    case 'barn-h': return `inset(0 ${(1-p)*50}% 0 ${(1-p)*50}%)`;
    case 'barn-v': return `inset(${(1-p)*50}% 0 ${(1-p)*50}% 0)`;
    case 'diamond': return `polygon(50% ${50-p*100}%, ${50+p*100}% 50%, 50% ${50+p*100}%, ${50-p*100}% 50%)`;
    case 'wipe-diagonal': { const q=p*2*100; return p<=.5 ? `polygon(0 0, ${q}% 0, 0 ${q}%)` : `polygon(0 0, 100% 0, 100% ${q-100}%, ${q-100}% 100%, 0 100%)`; }
  }
}
export function transitionProgress(t: Timeline, c: Clip, time: number) {
  const tr = incomingTransition(t,c); return tr ? Math.max(0,Math.min(1,(time-c.start)/tr.duration)) : 1;
}
export function transitionAudio(t: Timeline, c: Clip, time: number) {
  const out = t.clips.find(x => incomingTransition(t,x)?.fromClipId === c.id);
  const outgoing = out ? 1-transitionProgress(t,out,time) : 1;
  return transitionProgress(t,c,time)*outgoing;
}
/** Overlap consecutive video clips without inventing footage; ripple following video clips. */
export function setTransition(t: Timeline, clipId: string, type: string, duration = .6, join = true): Timeline {
  const next = normalizeTimeline(JSON.parse(JSON.stringify(t))), c = next.clips.find(x=>x.id===clipId);
  if (!c || c.track !== 'video' || !c.assetId) throw new Error('Choose an incoming video or image clip on the video track');
  const ordered = next.clips.filter(x=>x.track==='video').sort((a,b)=>a.start-b.start), prev = ordered[ordered.indexOf(c)-1];
  const old = incomingTransition(next,c)?.duration ?? 0;
  if (type==='none' && !old) return next;
  if (!prev) throw new Error('A transition needs a preceding video clip');
  if (type!=='none' && !TRANSITIONS.includes(type as TransitionType)) throw new Error('Unknown transition type');
  if (!old && type!=='none' && Math.abs(clipEnd(prev)-c.start)>.04) {
    if (!join) throw new Error('Place the clips end to end before adding a transition, or pass join: true');
    const delta = clipEnd(prev)-c.start, from = c.start;
    for (const x of ordered) if (x.start>=from-.0005) x.start=Math.round(Math.max(0,x.start+delta)*1000)/1000;
  }
  const d = type==='none' ? 0 : Math.round(Math.min(Math.max(.1,Number.isFinite(duration)?duration:.6),clipDuration(c)/2,clipDuration(prev)/2,3)*1000)/1000;
  const shift = old-d, start = c.start;
  for(const x of ordered) if(x.start>=start-.0005) x.start=Math.round((x.start+shift)*1000)/1000;
  if(d) c.transitionIn={fromClipId:prev.id,type:type as TransitionType,duration:d}; else delete c.transitionIn;
  return next;
}

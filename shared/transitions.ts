import { clipDuration, clipEnd, normalizeTimeline, type Clip, type Timeline } from './timeline';
export const TRANSITIONS = ['dissolve', 'wipe-left', 'wipe-right'] as const;
export type TransitionType = typeof TRANSITIONS[number];
export type Transition = { fromClipId: string; type: TransitionType; duration: number };
export function incomingTransition(t: Timeline, c: Clip): Transition | undefined {
  const tr = c.transitionIn, from = tr && t.clips.find(x => x.id === tr.fromClipId);
  if (!tr || !from || from.track !== 'video' || c.track !== 'video' || from.start >= c.start || Math.abs(clipEnd(from) - c.start - tr.duration) > .04) return;
  return tr;
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

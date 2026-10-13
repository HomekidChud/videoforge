export type Peer = { cid: string; name: string; color: string; time: number; selectedIds: string[]; playing: boolean; cursor: { area: "preview"; x: number; y: number } | { area: "timeline"; t: number; lane?: string } | null };
export function PreviewCursors({ peers }: { peers: Peer[] }) {
  return <div className="presence-overlay" aria-hidden="true">{peers.map(p => p.cursor?.area === 'preview' && <div key={p.cid} className="peer-cursor" style={{left:`${p.cursor.x*100}%`,top:`${p.cursor.y*100}%`,"--pc":p.color} as any} data-testid="live-cursor"><span className="cursor-arrow"/><b>{p.name}</b></div>)}</div>;
}

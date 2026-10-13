import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Lock, Film } from "lucide-react";
import { ForgeLogo } from "@/components/forge-shell";
import { API_BASE } from "@/lib/api";

type Shared = { id: string; name: string; updatedAt: number; renderUrl: string | null };

/** Public, unauthenticated viewer. It only ever receives a finished render. */
export default function SharePage() {
  const [, params] = useRoute("/share/:id");
  const q = useQuery<Shared>({
    queryKey: ["share", params?.id],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/public/projects/${params?.id}`);
      if (!r.ok) throw new Error("This project is private or no longer available.");
      return r.json();
    },
  });
  return <div className="forge-app share-page"><header className="share-head"><ForgeLogo/><a className="secondary-btn" href="#/api-key">Open VideoForge</a></header>
    <main className="share-main">
      {q.isLoading && <div className="empty-state">Loading video…</div>}
      {q.error && <div className="empty-state"><Lock size={34}/><h1>Not available</h1><p>{q.error.message}</p></div>}
      {q.data && <><h1>{q.data.name}</h1><p className="muted">Shared with VideoForge · Updated {new Date(q.data.updatedAt).toLocaleDateString()}</p>
        {q.data.renderUrl ? <video className="share-video" controls playsInline src={`${API_BASE}${q.data.renderUrl}`} data-testid="shared-video"/> : <div className="empty-state"><Film size={34}/><h2>No render yet</h2><p>The owner has not published a finished video for this project.</p></div>}</>}
    </main></div>;
}

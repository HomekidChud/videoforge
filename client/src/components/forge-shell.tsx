import { Film, KeyRound, BookOpen, LogOut, ArrowUpRight, Radio } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiKey } from "@/lib/apiKey";
import { endServerSession } from "@/lib/api";
export function ForgeLogo() {
  return <a href="#/" className="forge-logo" aria-label="VideoForge home"><svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M4 5h13l-5 8h10L9 26l3-10H4V5Z" fill="currentColor" /></svg><span>Video<span className="muted">Forge</span></span></a>;
}
export function ForgeNav({ active = "editor" }: { active?: string }) {
  const { clearApiKey } = useApiKey();
  const me = useQuery<{ scope: string }>({ queryKey: ["/api/auth/me"] });
  return <nav className="forge-nav" aria-label="Main navigation"><ForgeLogo/><div className="nav-links"><a className={active === "editor" ? "active" : ""} href="#/editor"><Film size={16}/> Studio</a><a className={active === "platform" ? "active" : ""} href="#/platform"><KeyRound size={16}/> Developer platform</a>{me.data?.scope === "admin" && <a className={active === "live" ? "active" : ""} href="#/live" data-testid="nav-live"><Radio size={16}/> Live</a>}<a href="#/api-docs"><BookOpen size={16}/> API reference <ArrowUpRight size={12}/></a></div><button className="icon-btn" onClick={async () => {await endServerSession(); clearApiKey(); window.location.hash = "#/api-key";}} title="Sign out" aria-label="Sign out"><LogOut size={16}/></button></nav>;
}
export function ErrorBox({ message }: { message?: string }) { return message ? <div className="error-box" role="alert">{message}</div> : null; }
export async function copyText(value: string) {
  if (!navigator.clipboard) throw new Error("Clipboard unavailable. Select and copy the text manually.");
  await navigator.clipboard.writeText(value);
}

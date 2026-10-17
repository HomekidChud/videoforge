import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Hash, History, Search, X } from "lucide-react";
import type { DocPage } from "@/lib/docs-content";
import { countByGroup, highlightRuns, queryTokens, searchDocs } from "@/lib/docs-search";

const RECENT_KEY = "vf.docs.recent.v1";
const SUGGESTIONS = ["quickstart", "keyframes", "animator", "render", "authentication", "shapes"];

const loadRecent = (): string[] => { try { return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]).slice(0, 5); } catch { return []; } };
const saveRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* storage is optional */ } };

function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  return <>{highlightRuns(text, tokens).map((r, i) => r.hit ? <mark key={i}>{r.text}</mark> : <Fragment key={i}>{r.text}</Fragment>)}</>;
}

type Item = { key: string; slug: string; anchor: string | null; kind: "page" | "section"; title: string; group: string; text: string };

export default function DocsSearchDialog({ pages, onClose, onGo }: {
  pages: readonly DocPage[];
  onClose: () => void;
  onGo: (slug: string, anchor: string | null) => void;
}) {
  const [query, setQuery] = useState(""), [group, setGroup] = useState<string | null>(null), [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const tokens = useMemo(() => queryTokens(query), [query]);
  const counts = useMemo(() => (tokens.length ? countByGroup(pages, query) : {}), [pages, query, tokens.length]);
  const results = useMemo(() => searchDocs(pages, query, { group }), [pages, query, group]);

  // The flat list the arrow keys walk through: each page, then the sections that matched under it.
  const items: Item[] = useMemo(() => {
    if (tokens.length) {
      return results.flatMap((p): Item[] => [
        { key: p.slug, slug: p.slug, anchor: null, kind: "page", title: p.title, group: p.group, text: p.description },
        ...p.hits.map((h): Item => ({ key: `${p.slug}#${h.sectionId}`, slug: p.slug, anchor: h.sectionId, kind: "section", title: h.sectionTitle ?? "", group: p.group, text: h.snippet })),
      ]);
    }
    return pages.filter((p) => p.group === "Get started").map((p): Item => ({ key: p.slug, slug: p.slug, anchor: null, kind: "page", title: p.title, group: p.group, text: p.description }));
  }, [results, tokens.length, pages]);

  useEffect(() => { setCursor(0); }, [query, group]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const remember = () => {
    const q = query.trim();
    if (q.length < 2) return;
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    setRecent(next); saveRecent(next);
  };
  const go = (item: Item) => { remember(); onGo(item.slug, item.anchor); };
  const forget = () => { setRecent([]); saveRecent([]); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); setCursor(0); }
    else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); setCursor(Math.max(0, items.length - 1)); }
    else if (e.key === "Enter" && items[cursor]) { e.preventDefault(); go(items[cursor]); }
  };

  const groupNames = Object.keys(counts);
  const total = results.length;
  let idx = -1;
  const row = (item: Item) => {
    idx += 1; const i = idx;
    return <button key={item.key} role="option" aria-selected={i === cursor} data-idx={i} tabIndex={-1} className={`sr-row ${item.kind} ${i === cursor ? "on" : ""}`} onMouseMove={() => setCursor(i)} onClick={() => go(item)} data-testid={`docs-result-${item.key}`}>
      {item.kind === "page"
        ? <><span className="sr-group">{item.group}</span><b><Marked text={item.title} tokens={tokens} /></b><p><Marked text={item.text} tokens={tokens} /></p></>
        : <><b><Hash size={13} /><Marked text={item.title} tokens={tokens} /></b><p><Marked text={item.text} tokens={tokens} /></p></>}
      <ArrowRight size={16} className="sr-go" />
    </button>;
  };

  return <div className="search-backdrop" onClick={onClose}>
    <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search documentation" onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Tab") { const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button:not([tabindex="-1"])')); const first = els[0], last = els[els.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}>
      <div className="search-input-row">
        <Search size={20} />
        <input ref={input} role="combobox" aria-expanded="true" aria-controls="docs-search-list" aria-label="Search documentation" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search guides, operations, endpoints..." data-testid="docs-search-input" autoComplete="off" spellCheck={false} />
        {query && <button className="public-icon" aria-label="Clear search" onClick={() => { setQuery(""); input.current?.focus(); }} data-testid="docs-search-clear"><X size={16} /></button>}
        <kbd className="sr-esc">Esc</kbd>
      </div>
      {tokens.length > 0 && groupNames.length > 0 && <div className="sr-chips" role="group" aria-label="Filter by section">
        <button className={group === null ? "on" : ""} onClick={() => setGroup(null)}>All <em>{Object.values(counts).reduce((a, b) => a + b, 0)}</em></button>
        {groupNames.map((g) => <button key={g} className={group === g ? "on" : ""} onClick={() => setGroup(group === g ? null : g)}>{g} <em>{counts[g]}</em></button>)}
      </div>}
      <div className="search-results" id="docs-search-list" role="listbox" ref={list}>
        {tokens.length > 0 ? (total ? results.map((p) => <div className="sr-page" key={p.slug}>
          {row(items.find((i) => i.key === p.slug)!)}
          {p.hits.map((h) => row(items.find((i) => i.key === `${p.slug}#${h.sectionId}`)!))}
        </div>) : <div className="search-empty">
          <p>Nothing matches “{query.trim()}”{group ? ` in ${group}` : ""}.</p>
          {group && <button className="sr-link" onClick={() => setGroup(null)}>Search all of the docs</button>}
          <div className="sr-suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => { setGroup(null); setQuery(s); input.current?.focus(); }}>{s}</button>)}</div>
        </div>) : <>
          {recent.length > 0 && <div className="sr-block">
            <div className="sr-label"><span><History size={13} /> Recent</span><button onClick={forget}>Clear</button></div>
            <div className="sr-suggest">{recent.map((r) => <button key={r} onClick={() => { setQuery(r); input.current?.focus(); }}>{r}</button>)}</div>
          </div>}
          <div className="sr-block">
            <div className="sr-label"><span>Try searching</span></div>
            <div className="sr-suggest">{SUGGESTIONS.map((s) => <button key={s} onClick={() => { setQuery(s); input.current?.focus(); }}>{s}</button>)}</div>
          </div>
          <div className="sr-label pad"><span>Get started</span></div>
          <div className="sr-page">{items.map((i) => row(i))}</div>
        </>}
      </div>
      <div className="search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd><CornerDownLeft size={11} /></kbd> open</span><span><kbd>Esc</kbd> close</span>
        <b>{tokens.length ? `${total} ${total === 1 ? "page" : "pages"}` : `${pages.length} pages`}</b>
      </div>
    </div>
  </div>;
}

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CornerDownLeft, Hash, Search, X } from "lucide-react";
import type { DocPage } from "@/lib/docs-content";
import { countByGroup, highlightRuns, queryTokens, searchDocs } from "@/lib/docs-search";

/** Pages shown at first; the rest wait behind "Show more" so a search reads like an answer, not a dump. */
const FIRST_PAGES = 4;
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
  const [showAll, setShowAll] = useState(false);
  const input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const tokens = useMemo(() => queryTokens(query), [query]);
  const counts = useMemo(() => (tokens.length ? countByGroup(pages, query) : {}), [pages, query, tokens.length]);
  const strict = useMemo(() => searchDocs(pages, query, { group }), [pages, query, group]);
  // Nothing has every word: fall back to the closest pages and say so, instead of showing an empty box.
  const loose = useMemo(() => (strict.length === 0 && tokens.length > 1 ? searchDocs(pages, query, { group, loose: true }) : []), [strict, pages, query, group, tokens.length]);
  const all = strict.length ? strict : loose;
  const partial = strict.length === 0 && loose.length > 0;
  const results = showAll ? all : all.slice(0, FIRST_PAGES);
  const hidden = all.length - results.length;

  // The flat list the arrow keys walk through: each page, then the sections that matched under it.
  const items: Item[] = useMemo(() => {
    if (!tokens.length) return [];
    return results.flatMap((p): Item[] => [
      { key: p.slug, slug: p.slug, anchor: null, kind: "page", title: p.title, group: p.group, text: p.description },
      ...p.hits.map((h): Item => ({ key: `${p.slug}#${h.sectionId}`, slug: p.slug, anchor: h.sectionId, kind: "section", title: h.sectionTitle ?? "", group: p.group, text: h.snippet })),
    ]);
  }, [results, tokens.length]);

  useEffect(() => { setCursor(0); setShowAll(false); if (list.current) list.current.scrollTop = 0; }, [query, group]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" }); }, [cursor]);

  const go = (item: Item) => { onGo(item.slug, item.anchor); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(items.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); setCursor(0); }
    else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); setCursor(Math.max(0, items.length - 1)); }
    else if (e.key === "Enter" && items[cursor]) { e.preventDefault(); go(items[cursor]); }
  };

  const groupNames = Object.keys(counts);
  const total = all.length;
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
        {tokens.length > 0 ? (total ? <>
          {partial && <p className="sr-note">No page has every word in “{query.trim()}”. These are the closest matches.</p>}
          {results.map((p, n) => <div className="sr-page" key={p.slug}>
            {n === 0 && !partial && <span className="sr-best">Best match</span>}
            {row(items.find((i) => i.key === p.slug)!)}
            {p.hits.map((h) => row(items.find((i) => i.key === `${p.slug}#${h.sectionId}`)!))}
          </div>)}
          {hidden > 0 && <button className="sr-more" tabIndex={-1} onClick={() => { setShowAll(true); input.current?.focus(); }} data-testid="docs-search-more">Show {hidden} more {hidden === 1 ? "page" : "pages"}</button>}
        </> : <div className="search-empty">
          <p>Nothing matches “{query.trim()}”{group ? ` in ${group}` : ""}.</p>
          {group && <button className="sr-link" onClick={() => setGroup(null)}>Search all of the docs</button>}
        </div>) : null}
      </div>
      <div className="search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd><CornerDownLeft size={11} /></kbd> open</span><span><kbd>Esc</kbd> close</span>
        <b>{tokens.length ? `${total} ${total === 1 ? "page" : "pages"}` : `Search ${pages.length} pages`}</b>
      </div>
    </div>
  </div>;
}

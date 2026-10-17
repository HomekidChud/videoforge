import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronRight, Clock, Info, Lightbulb, Link2, Menu, Pencil, Search, TriangleAlert, X } from "lucide-react";
import { useLocation } from "wouter";
import { PublicSite, PublicHeader, CodeBlock, usePageTitle } from "@/components/forge-public";
import { DOC_PAGES } from "@/lib/docs-content";
import type { DocSection } from "@/lib/docs-content";
import MotionDemo from "@/components/motion-demo";
import ExampleGallery from "@/components/example-gallery";

const REPO = "https://github.com/HomekidChud/videoforge";
const GROUPS_KEY = "vf.docs.groups.v1";
const sectionId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Words in a page, so every guide can say how long it takes to read. */
const readingMinutes = (sections: DocSection[]) => {
  const words = sections.map((s) => `${s.text} ${s.callouts?.map((c) => c.text).join(" ") ?? ""} ${s.rows?.flat().join(" ") ?? ""}`).join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

/** Inline markdown: **bold**, `code` and [links](url). Everything else is plain text. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g);
  return <>{parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = link[2], external = /^https?:/.test(href);
      return <a key={i} href={external ? href : href.startsWith("#") ? `#/docs/${href.slice(1)}` : `#/docs/${href}`} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>{link[1]}</a>;
    }
    return part;
  })}</>;
}

/** A section's text: blank-line separated paragraphs, and "- item" lines become a list. */
function DocText({ text }: { text: string }) {
  return <>{text.split("\n\n").map((block, i) => {
    const lines = block.split("\n");
    if (lines.every((l) => l.startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}><Inline text={l.slice(2)} /></li>)}</ul>;
    return <p key={i}><Inline text={block} /></p>;
  })}</>;
}

const CALLOUT = {
  note: { label: "Note", Icon: Info },
  tip: { label: "Tip", Icon: Lightbulb },
  warning: { label: "Careful", Icon: TriangleAlert },
} as const;

function loadGroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}") as Record<string, boolean>; } catch { return {}; }
}

export default function ApiDocsPage({ params }: { params?: { slug: string } }) {
  // "#/docs/editor#custom-tools" opens the page and jumps to that section.
  const [rawPage, rawAnchor] = (params?.slug ? params.slug.replace(/\/+$/, "") : "api-reference").split("#");
  const slug = rawPage || "api-reference";
  const current = DOC_PAGES.find((p) => p.slug === slug);
  const groups = useMemo(() => Array.from(new Set(DOC_PAGES.map((p) => p.group))), []);
  const [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState(""), [menu, setMenu] = useState(false);
  const [groupState, setGroupState] = useState<Record<string, boolean>>(loadGroups);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(""), [progress, setProgress] = useState(0), [showTop, setShowTop] = useState(false), [toast, setToast] = useState("");
  const [, navigate] = useLocation();
  const searchRef = useRef<HTMLInputElement>(null), searchButton = useRef<HTMLButtonElement>(null), toastTimer = useRef<number>();
  usePageTitle(current ? `${current.title} · Docs` : "Page not found · Docs");

  const groupOpen = (g: string) => groupState[g] ?? true;
  const setGroups = (next: Record<string, boolean>) => { setGroupState(next); try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* storage is optional */ } };
  const toggleGroup = (g: string) => setGroups({ ...groupState, [g]: !groupOpen(g) });
  const allGroupsOpen = groups.every(groupOpen);

  const say = useCallback((message: string) => {
    setToast(message); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen((o) => !o); }
      if (e.key === "Escape") { setSearchOpen(false); setMenu(false); searchButton.current?.focus(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  // New page: close the mobile menu, open the page's group, reset sections and honour a section link.
  useEffect(() => {
    setMenu(false); setCollapsed(new Set()); setActive("");
    if (current && groupState[current.group] === false) setGroups({ ...groupState, [current.group]: true });
    if (rawAnchor) window.setTimeout(() => document.getElementById(rawAnchor)?.scrollIntoView({ behavior: "smooth" }), 60);
    else window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, rawAnchor]);

  // Reading progress, back-to-top and the section the reader is on.
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? Math.min(1, h.scrollTop / max) : 0); setShowTop(h.scrollTop > 700);
    };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true }); return () => window.removeEventListener("scroll", onScroll);
  }, [slug]);
  useEffect(() => {
    if (!current || typeof IntersectionObserver === "undefined") return;
    const ids = current.sections.map((s) => sectionId(s.title));
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = ids.find((id) => seen.get(id)); if (first) setActive(first);
    }, { rootMargin: "-90px 0px -60% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [current, collapsed.size]);

  const filtered = DOC_PAGES.filter((p) => `${p.title} ${p.description} ${p.sections.map((s) => s.title + " " + s.text + " " + s.code + " " + s.rows?.flat().join(" ")).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const index = DOC_PAGES.findIndex((p) => p.slug === slug), previous = DOC_PAGES[index - 1], next = DOC_PAGES[index + 1];
  const choose = (s: string) => { navigate(`/docs/${s}`); setSearchOpen(false); setQuery(""); };

  const ids = current?.sections.map((s) => sectionId(s.title)) ?? [];
  const allCollapsed = ids.length > 0 && ids.every((id) => collapsed.has(id));
  const toggleSection = (id: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const jump = (id: string) => {
    setCollapsed((c) => { if (!c.has(id)) return c; const n = new Set(c); n.delete(id); return n; });
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 30);
  };
  const copyLink = async (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/docs/${slug}#${id}`;
    try { await navigator.clipboard.writeText(url); say("Link copied"); } catch { say("Copy the address bar to share this section"); }
  };

  return <PublicSite><a className="public-skip" href="#/" onClick={(e) => { e.preventDefault(); document.getElementById("docs-content")?.focus(); }}>Skip to content</a>
    <div className="docs-progress" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></div>
    <PublicHeader docs><button className="docs-search" ref={searchButton} onClick={() => setSearchOpen(true)} data-testid="docs-search"><Search size={17} /><span>Search documentation</span><kbd>Ctrl K</kbd></button></PublicHeader>
    <div className="docs-mobile-bar"><button onClick={() => setMenu((o) => !o)} aria-expanded={menu} data-testid="docs-menu"><Menu size={17} /> Documentation</button><span>{current?.title ?? "Not found"}</span></div>
    <div className="docs-layout">
      <aside className={`docs-sidebar ${menu ? "open" : ""}`}>
        <div className="docs-sidebar-tools"><span>Guides</span><button onClick={() => setGroups(Object.fromEntries(groups.map((g) => [g, !allGroupsOpen])))} data-testid="docs-toggle-groups">{allGroupsOpen ? "Collapse all" : "Expand all"}</button></div>
        <nav aria-label="Documentation">{groups.map((group) => {
          const pages = DOC_PAGES.filter((p) => p.group === group), open = groupOpen(group), hasCurrent = pages.some((p) => p.slug === slug);
          return <div className={`docs-group ${open ? "open" : ""}`} key={group}>
            <button className="docs-group-head" aria-expanded={open} aria-controls={`docs-group-${sectionId(group)}`} onClick={() => toggleGroup(group)} data-testid={`docs-group-${sectionId(group)}`}>
              <ChevronRight size={15} className="chev" /><span>{group}</span><em className={hasCurrent && !open ? "here" : ""}>{pages.length}</em>
            </button>
            <div className="docs-group-body" id={`docs-group-${sectionId(group)}`} {...({ inert: open ? undefined : "" } as Record<string, string | undefined>)}><div>
              {pages.map((p) => <a key={p.slug} href={`#/docs/${p.slug}`} aria-current={p.slug === slug ? "page" : undefined} className={p.slug === slug ? "selected" : ""} data-testid={`docs-link-${p.slug}`}>{p.title}</a>)}
            </div></div>
          </div>;
        })}</nav>
        <a className="sidebar-repo" href={`${REPO}/blob/main/docs/API.md`}>Repository reference <ArrowUpRight size={14} /></a>
      </aside>
      <main className="docs-article" id="docs-content" tabIndex={-1}>{current ? <>
        <div className="docs-breadcrumb"><a href="#/docs/introduction">Documentation</a> <span>/</span> {current.group} <span>/</span> <b>{current.title}</b></div>
        <h1>{current.title}</h1><p className="doc-lede">{current.description}</p>
        <div className="doc-meta" data-testid="doc-meta">
          <span><Clock size={14} /> {readingMinutes(current.sections)} min read</span><span>{current.sections.length} {current.sections.length === 1 ? "section" : "sections"}</span>
          {current.sections.length > 1 && <button onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(ids))} data-testid="docs-toggle-sections"><ChevronRight size={14} className={`chev ${allCollapsed ? "" : "down"}`} />{allCollapsed ? "Expand all sections" : "Collapse all sections"}</button>}
        </div>
        {current.sections.map((s) => {
          const id = sectionId(s.title), shut = collapsed.has(id);
          return <section key={s.title} id={id} className={shut ? "shut" : ""} data-testid={`doc-section-${id}`}>
            <h2>
              <button className="doc-fold" aria-expanded={!shut} aria-controls={`${id}-body`} onClick={() => toggleSection(id)}><ChevronRight size={18} className={`chev ${shut ? "" : "down"}`} /><span>{s.title}</span></button>
              <button className="doc-anchor" aria-label={`Copy link to ${s.title}`} title="Copy link to this section" onClick={() => copyLink(id)}><Link2 size={15} /></button>
            </h2>
            <div className="doc-section-body" id={`${id}-body`} {...({ inert: shut ? "" : undefined } as Record<string, string | undefined>)}><div>
              {s.text && <DocText text={s.text} />}
              {s.callouts?.map((c, i) => { const { label, Icon } = CALLOUT[c.kind]; return <aside key={i} className={`doc-callout ${c.kind}`} role="note"><Icon size={17} aria-hidden="true" /><div><b>{label}</b><p><Inline text={c.text} /></p></div></aside>; })}
              {s.code && <CodeBlock code={s.code} label={s.language ?? "JSON"} />}
              {s.rows && <div className="doc-table-wrap"><table><thead><tr>{s.rows[0].map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{s.rows.slice(1).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{j === 0 ? <code>{c}</code> : c}</td>)}</tr>)}</tbody></table></div>}
              {s.links && <div className="doc-link-cards">{s.links.map((l) => <a key={l.slug} href={`#/docs/${l.slug}`}>{l.label}<ArrowRight size={17} /></a>)}</div>}
            </div></div>
          </section>;
        })}
        {slug === "motion-graphics" && <section id="playground"><h2><span className="doc-plain">Try the motion playground</span></h2><p>Switch templates, change the headline, pause playback or scrub through the composition. This is a local preview; it does not create a project or send requests to your server.</p><MotionDemo compact /></section>}
        {slug === "examples" && <section id="gallery"><h2><span className="doc-plain">Live gallery</span></h2><p>Pick an example to play it. Each one runs on the same timeline engine as Studio and the FFmpeg renderer, and its ops are shown below. Press Copy and POST them to a project to build it yourself.</p><ExampleGallery /></section>}
        <div className="doc-edit-row"><a href={`${REPO}/edit/main/docs/${current.slug}.md`} target="_blank" rel="noreferrer" data-testid="doc-edit"><Pencil size={14} /> Edit this page on GitHub</a><span>Timeline schema v4 · motion engine v2</span></div>
        <nav className="docs-pagination" aria-label="Guide navigation">{previous ? <a href={`#/docs/${previous.slug}`}><ArrowLeft size={17} /><div><small>Previous</small><b>{previous.title}</b></div></a> : <span />}{next ? <a href={`#/docs/${next.slug}`}><div><small>Next</small><b>{next.title}</b></div><ArrowRight size={17} /></a> : <a href="#/editor"><div><small>Start creating</small><b>Open Studio</b></div><ArrowUpRight size={17} /></a>}</nav>
      </> : <><h1>That guide doesn’t exist.</h1><p>Choose a topic from the sidebar, or return to the introduction.</p><a className="public-button" href="#/docs/introduction">Read the introduction</a></>}</main>
      <aside className="docs-toc"><nav aria-label="On this page"><b>On this page</b>{current?.sections.map((s) => { const id = sectionId(s.title); return <button key={s.title} className={active === id ? "on" : ""} aria-current={active === id ? "location" : undefined} onClick={() => jump(id)}>{s.title}</button>; })}{slug === "examples" && <button onClick={() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })}>Live gallery</button>}{slug === "motion-graphics" && <button onClick={() => document.getElementById("playground")?.scrollIntoView({ behavior: "smooth" })}>Motion playground</button>}</nav><div className="toc-callout"><span>CREATE WITH CODE</span><p>Your agent’s next composition starts with one request.</p><a href="#/docs/quickstart">Read the quickstart <ArrowRight size={14} /></a></div></aside>
    </div>
    {showTop && <button className="docs-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top" data-testid="docs-top"><ArrowUp size={18} /></button>}
    <div className={`docs-toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast && <><Check size={15} /> {toast}</>}</div>
    {searchOpen && <div className="search-backdrop" onClick={() => { setSearchOpen(false); searchButton.current?.focus(); }}><div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search documentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Tab") { const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("input,button")); const first = items[0], last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}>
      <div className="search-input-row"><Search size={20} /><input ref={searchRef} aria-label="Search documentation" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search guides, operations, endpoints..." onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) choose(filtered[0].slug); }} data-testid="docs-search-input" /><button className="public-icon" aria-label="Close search" onClick={() => { setSearchOpen(false); searchButton.current?.focus(); }}><X size={18} /></button></div>
      <div className="search-results">{filtered.length ? filtered.map((p) => <button key={p.slug} onClick={() => choose(p.slug)}><span>{p.group}</span><b>{p.title}</b><p>{p.description}</p><ArrowRight size={17} /></button>) : <p className="search-empty">No matches. Try “shape”, “keyframes” or “render”.</p>}</div><div className="search-footer">Enter to open first result · Escape to close</div>
    </div></div>}
  </PublicSite>;
}

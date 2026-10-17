import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Bot, Check, ChevronRight, Clapperboard, Clock, Info, Lightbulb, Link2, Menu, Search, ThumbsDown, ThumbsUp, TriangleAlert, Wrench, X } from "lucide-react";
import { useLocation } from "wouter";
import { PublicSite, PublicHeader, CodeBlock, usePageTitle } from "@/components/forge-public";
import { DOC_PAGES, CONTRIBUTORS } from "@/lib/docs-content";
import type { DocPage, DocSection, DocTask } from "@/lib/docs-content";
import { GLOSSARY, glossaryRuns } from "@/lib/glossary";
import MotionDemo from "@/components/motion-demo";
import ExampleGallery from "@/components/example-gallery";
import DocsSearchDialog from "@/components/docs-search-dialog";

const REPO = "https://github.com/HomekidChud/videoforge";
const HOSTED = "https://videoforge-api-s54w.onrender.com";
const GROUPS_KEY = "vf.docs.groups.v2";
const TASKS_KEY = "vf.docs.tasks.v1";
/** Only this group starts open; the rest wait until you open them (or open the page you are on). */
const OPEN_BY_DEFAULT = "Get started";
const sectionId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

type TaskFilter = { status: "all" | "open" | "doing" | "done"; priority: "all" | "High" | "Medium" | "Low" | "none"; area: string; sort: "authored" | "priority" };
const DEFAULT_FILTER: TaskFilter = { status: "all", priority: "all", area: "all", sort: "authored" };
const loadFilter = (): TaskFilter => { try { return { ...DEFAULT_FILTER, ...JSON.parse(localStorage.getItem(TASKS_KEY) ?? "{}") as Partial<TaskFilter> }; } catch { return DEFAULT_FILTER; }; };
const saveFilter = (f: TaskFilter) => { try { localStorage.setItem(TASKS_KEY, JSON.stringify(f)); } catch { /* storage is optional */ } };
const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2, none: 3 };
/** New if the page was added within 30 days, Updated if it changed within 30 days. */
const pageBadge = (p: { added?: string; updated?: string }): "New" | "Updated" | null => {
  const age = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : Infinity);
  return age(p.added) <= 30 ? "New" : age(p.updated) <= 30 ? "Updated" : null;
};

/** Words in a page, so every guide can say how long it takes to read. */
const readingMinutes = (sections: DocSection[]) => {
  const words = sections.map((s) => `${s.text} ${s.callouts?.map((c) => c.text).join(" ") ?? ""} ${s.rows?.flat().join(" ") ?? ""} ${s.tasks?.map((t) => t.text).join(" ") ?? ""}`).join(" ").split(/\s+/).filter(Boolean).length;
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
    return <Fragment key={i}><GlossaryText text={part} /></Fragment>;
  })}</>;
}

/** Plain text with glossary words as hoverable definitions. */
function GlossaryText({ text }: { text: string }) {
  return <>{glossaryRuns(text).map((run, i) => typeof run === "string" ? run : (
    <span key={i} className="gl-term" tabIndex={0} title={GLOSSARY[run.term.toLowerCase()]}>{run.term}</span>
  ))}</>;
}

/** A section's text: blank-line separated paragraphs, "- item" lines become a list, and the todo page's calculated markers. */
function DocText({ text, page }: { text: string; page: DocPage }) {
  return <>{text.split("\n\n").map((block, i) => {
    if (block === "{{progress-overall}}" && page.taskStats) return <OverallProgress key={i} stats={page.taskStats} />;
    if (block === "{{progress-table}}" && page) return <ProgressTable key={i} sections={page.sections} />;
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

/** One checkbox item on a task page: read-only, labelled for screen readers. */
function TaskItem({ task, status }: { task: DocTask; status: TaskFilter["status"] }) {
  const visible = status === "all"
    || (status === "open" ? task.status !== "done" : status === "doing" ? task.status === "doing" : task.status === "done");
  if (!visible) return null;
  return <li className={`todo-item ${task.status}`} data-testid={`todo-item-${task.status}`}>
    <label>
      <input type="checkbox" readOnly checked={task.status === "done"} aria-label={`${task.text}${task.status === "doing" ? " — in progress" : ""}`} data-testid="todo-checkbox" />
      <span className="todo-text"><Inline text={task.text} /></span>
    </label>
    {task.priority && <span className={`todo-pri ${task.priority.toLowerCase()}`}>{task.priority}</span>}
    {task.status === "doing" && <span className="todo-doing">In progress</span>}
  </li>;
}

/** A section's checklist with its calculated progress bar and counts. */
function TaskList({ tasks, stats, filter }: { tasks: DocTask[]; stats?: { done: number; doing: number; todo: number }; filter: TaskFilter }) {
  const done = stats?.done ?? tasks.filter((t) => t.status === "done").length, total = tasks.length;
  const pct = total ? Math.round((100 * done) / total) : 0;
  const priorityOk = (t: DocTask) => filter.priority === "all" || (filter.priority === "none" ? !t.priority : t.priority === filter.priority);
  let shown = tasks.filter(priorityOk);
  if (filter.sort === "priority") shown = [...shown].sort((a, b) => PRIORITY_RANK[a.priority ?? "none"] - PRIORITY_RANK[b.priority ?? "none"]);
  return <div className="todo-list" data-testid="todo-list">
    <div className="todo-head">
      <div className="todo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total} items done`}><i style={{ width: `${pct}%` }} /></div>
      <span className="todo-count">{done} of {total} done</span>
    </div>
    <ul>{shown.map((t, i) => <TaskItem key={`${t.text.slice(0, 40)}${i}`} task={t} status={filter.status} />)}</ul>
    {!shown.some((t) => filter.status === "all" || (filter.status === "open" ? t.status !== "done" : filter.status === "doing" ? t.status === "doing" : t.status === "done")) && shown.length > 0 && <p className="todo-none">No items match the status filter — showing every priority.</p>}
    {shown.length === 0 && <p className="todo-none">No items match this filter.</p>}
  </div>;
}

/** The overall bar on a task page: counts and percentage worked out from the checkboxes. */
function OverallProgress({ stats }: { stats: { done: number; doing: number; todo: number } }) {
  const total = stats.done + stats.doing + stats.todo, pct = total ? Math.round((100 * stats.done) / total) : 0;
  return <div className="todo-overall" data-testid="todo-overall">
    <div className="todo-bar big" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={stats.done} aria-label={`${stats.done} of ${total} items done, ${pct} percent`}><i style={{ width: `${pct}%` }} /></div>
    <p className="todo-overall-text"><b>{stats.done} of {total} done</b><span className="todo-pct">{pct}%</span><span className="todo-sub">{stats.doing} in progress · {stats.todo} to do</span></p>
  </div>;
}

/** The Progress by area table, generated from the page's own sections. */
function ProgressTable({ sections }: { sections: DocSection[] }) {
  const rows = sections.filter((s) => s.tasks?.length);
  return <div className="doc-table-wrap todo-table" data-testid="todo-table"><table>
    <thead><tr><th scope="col">Area</th><th scope="col">Done</th><th scope="col">In progress</th><th scope="col">To do</th><th scope="col">Progress</th></tr></thead>
    <tbody>{rows.map((s) => {
      const done = s.tasks!.filter((t) => t.status === "done").length, doing = s.tasks!.filter((t) => t.status === "doing").length, todo = s.tasks!.length - done - doing;
      const pct = Math.round((100 * done) / s.tasks!.length);
      return <tr key={s.title}><td>{s.title}</td><td>{done}</td><td>{doing}</td><td>{todo}</td>
        <td><span className="todo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={s.tasks!.length} aria-valuenow={done} aria-label={`${done} of ${s.tasks!.length} done`}><i style={{ width: `${pct}%` }} /></span> <span className="todo-pct">{pct}%</span></td></tr>;
    })}</tbody>
  </table></div>;
}

/** Role cards for the docs home page: one short path per kind of reader. */
function RoleCards() {
  const roles = [
    { Icon: Clapperboard, title: "Studio user", text: "Cut footage, build motion graphics and export an MP4 in the browser.", href: "#/docs/motion-graphics-tutorial", cta: "Take the tutorial" },
    { Icon: Bot, title: "Agent builder", text: "Drive the same timeline over HTTP: scoped keys, atomic batches, renders.", href: "#/docs/agent-workflow", cta: "See the workflow" },
    { Icon: Wrench, title: "Contributor", text: "Add a preset, template, operation or block — every table is generated and tested.", href: "#/docs/contribute", cta: "Start contributing" },
  ] as const;
  return <div className="role-cards" data-testid="role-cards">{roles.map((r) => <a key={r.title} className="role-card" href={r.href}><r.Icon size={20} aria-hidden="true" /><b>{r.title}</b><p>{r.text}</p><span>{r.cta} <ArrowRight size={15} /></span></a>)}</div>;
}

/** Live status of the hosted deployment, checked from the browser. */
function StatusPanel() {
  const [state, setState] = useState<"checking" | "up" | "down">("checking"), [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const t0 = performance.now();
    fetch(`${HOSTED}/api/health`, { signal: AbortSignal.timeout(8000) })
      .then((r) => { setMs(Math.round(performance.now() - t0)); setState(r.ok ? "up" : "down"); })
      .catch(() => setState("down"));
  }, []);
  return <div className="status-panel" data-testid="status-panel">
    <span className={`status-dot ${state}`} aria-hidden="true" />
    <div>
      <b>{state === "checking" ? "Checking the hosted API…" : state === "up" ? "Hosted API is up" : "Could not verify the hosted API from this browser"}</b>
      {state === "up" && ms !== null && <p>Answered the health check in {ms} ms.</p>}
      {state === "down" && <p>A blocked or failed request looks the same from here — the deployment may be asleep, the browser may have blocked the cross-origin check, or the network may be down. Retry in a minute, or <a href="#/docs/self-hosting">run your own</a>.</p>}
      <p className="status-note">Checked live from your browser against <code>{HOSTED}</code>. The health endpoint is public; everything else needs a key issued by that deployment.</p>
    </div>
  </div>;
}

function loadGroups(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "{}") as Record<string, boolean>; } catch { return {}; }
}

export default function ApiDocsPage({ params }: { params?: { slug: string } }) {
  // "#/docs/editor#custom-tools" opens the page and jumps to that section.
  const [rawPage, rawAnchor] = (params?.slug ? params.slug.replace(/\/+$/, "") : "api-reference").split("#");
  const slug = rawPage || "api-reference";
  const current = DOC_PAGES.find((p) => p.slug === slug);
  const groups = useMemo(() => Array.from(new Set(DOC_PAGES.map((p) => p.group))), []);
  const [searchOpen, setSearchOpen] = useState(false), [menu, setMenu] = useState(false);
  const [groupState, setGroupState] = useState<Record<string, boolean>>(loadGroups);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(""), [progress, setProgress] = useState(0), [showTop, setShowTop] = useState(false), [toast, setToast] = useState("");
  const [filter, setFilter] = useState<TaskFilter>(loadFilter);
  const [helpful, setHelpful] = useState<null | "yes" | "no">(() => { try { return JSON.parse(localStorage.getItem(`vf.docs.feedback.${slug}`) ?? "null"); } catch { return null; } });
  const [, navigate] = useLocation();
  const searchButton = useRef<HTMLButtonElement>(null), toastTimer = useRef<number>();
  usePageTitle(current ? `${current.title} · Docs` : "Page not found · Docs");

  const taskAreas = useMemo(() => (current?.sections ?? []).filter((s) => s.tasks?.length).map((s) => s.title), [current]);
  const hasTasks = taskAreas.length > 0;

  const groupOpen = (g: string) => groupState[g] ?? (g === OPEN_BY_DEFAULT || g === current?.group);
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
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setSearchOpen(true); }
      if (e.key === "Escape") { setSearchOpen(false); setMenu(false); searchButton.current?.focus(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  // New page: close the mobile menu, open the page's group, reset sections and honour a section link.
  useEffect(() => {
    setMenu(false); setCollapsed(new Set()); setActive("");
    setHelpful(() => { try { return JSON.parse(localStorage.getItem(`vf.docs.feedback.${slug}`) ?? "null"); } catch { return null; } });
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

  const index = DOC_PAGES.findIndex((p) => p.slug === slug), previous = DOC_PAGES[index - 1], next = DOC_PAGES[index + 1];
  const closeSearch = () => { setSearchOpen(false); searchButton.current?.focus(); };
  const openFromSearch = (target: string, anchor: string | null) => {
    setSearchOpen(false);
    if (target === slug && anchor) { setCollapsed((c) => { if (!c.has(anchor)) return c; const n = new Set(c); n.delete(anchor); return n; }); window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }), 40); }
    navigate(`/docs/${target}${anchor ? `#${anchor}` : ""}`);
  };

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

  const updated = current?.updated ? new Date(current.updated) : null;
  const badge = pageBadge(current ?? {});
  const vote = (v: "yes" | "no") => { setHelpful(v); try { localStorage.setItem(`vf.docs.feedback.${slug}`, JSON.stringify(v)); } catch { /* storage is optional */ } };
  useEffect(() => { saveFilter(filter); }, [filter]);

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
              {pages.map((p) => {
                const st = p.taskStats, pct = st ? Math.round((100 * st.done) / (st.done + st.doing + st.todo)) : null, pb = pageBadge(p);
                return <a key={p.slug} href={`#/docs/${p.slug}`} aria-current={p.slug === slug ? "page" : undefined} className={p.slug === slug ? "selected" : ""} data-testid={`docs-link-${p.slug}`}>{p.title}{pb && <i className={`side-badge ${pb.toLowerCase()}`}>{pb === "Updated" ? "Upd" : pb}</i>}{pct !== null && <em className="pct" title={`${st!.done} of ${st!.done + st!.doing + st!.todo} items done`}>{pct}%</em>}</a>;
              })}
            </div></div>
          </div>;
        })}</nav>
        <a className="sidebar-repo" href={`${REPO}/blob/main/docs/API.md`}>Repository reference <ArrowUpRight size={14} /></a>
      </aside>
      <main className="docs-article" id="docs-content" tabIndex={-1}>{current ? <>
        <div className="docs-breadcrumb"><a href="#/docs/introduction">Documentation</a> <span>/</span> {current.group} <span>/</span> <b>{current.title}</b></div>
        <h1>{current.title}{badge && <span className="doc-badge" data-testid="doc-badge">{badge}</span>}</h1><p className="doc-lede">{current.description}</p>
        <div className="doc-meta" data-testid="doc-meta">
          <span><Clock size={14} /> {readingMinutes(current.sections)} min read</span><span>{current.sections.length} {current.sections.length === 1 ? "section" : "sections"}</span>
          {updated && <span className="doc-updated" data-testid="doc-updated" title={updated.toISOString().slice(0, 10)}>Updated {updated.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
          {current.sections.length > 1 && <button onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(ids))} data-testid="docs-toggle-sections"><ChevronRight size={14} className={`chev ${allCollapsed ? "" : "down"}`} />{allCollapsed ? "Expand all sections" : "Collapse all sections"}</button>}
        </div>
        {hasTasks && <div className="todo-filters" role="group" aria-label="Filter the todo list" data-testid="todo-filters">
          <div className="tf-status">
            {(["all", "open", "doing", "done"] as const).map((v) => <button key={v} className={filter.status === v ? "on" : ""} aria-pressed={filter.status === v} onClick={() => setFilter({ ...filter, status: v })} data-testid={`todo-filter-${v}`}>{v === "doing" ? "In progress" : v === "all" ? "All" : v === "open" ? "Open" : "Done"}</button>)}
          </div>
          <label className="tf-select">Priority
            <select value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value as TaskFilter["priority"] })} data-testid="todo-filter-priority">
              <option value="all">All</option>
              {(["High", "Medium", "Low"] as const).map((p) => <option key={p} value={p}>{p} ({current?.sections.flatMap((s) => s.tasks ?? []).filter((t) => t.priority === p).length})</option>)}
              <option value="none">None</option>
            </select>
          </label>
          <label className="tf-select">Area
            <select value={filter.area} onChange={(e) => setFilter({ ...filter, area: e.target.value })} data-testid="todo-filter-area">
              <option value="all">All areas</option>
              {taskAreas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="tf-select">Sort
            <select value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value as TaskFilter["sort"] })} data-testid="todo-filter-sort">
              <option value="authored">As written</option>
              <option value="priority">By priority</option>
            </select>
          </label>
        </div>}
        {slug === "introduction" && <RoleCards />}
        {current.sections.map((s) => {
          const id = sectionId(s.title), shut = collapsed.has(id), inArea = filter.area === "all" || filter.area === s.title;
          return <section key={s.title} id={id} className={shut ? "shut" : ""} data-testid={`doc-section-${id}`} hidden={hasTasks && s.tasks?.length && !inArea ? true : undefined}>
            <h2>
              <button className="doc-fold" aria-expanded={!shut} aria-controls={`${id}-body`} onClick={() => toggleSection(id)}><ChevronRight size={18} className={`chev ${shut ? "" : "down"}`} /><span>{s.title}</span></button>
              <button className="doc-anchor" aria-label={`Copy link to ${s.title}`} title="Copy link to this section" onClick={() => copyLink(id)}><Link2 size={15} /></button>
            </h2>
            <div className="doc-section-body" id={`${id}-body`} {...({ inert: shut ? "" : undefined } as Record<string, string | undefined>)}><div>
              {s.video && <figure className="doc-video" data-testid={`doc-video-${s.video}`}>
                <video controls preload="none" playsInline poster={`videos/${s.video}.png`} src={`videos/${s.video}.mp4`} aria-label={`Recording of the step: ${s.title}`}>
                  <track kind="captions" src={`videos/${s.video}.vtt`} srcLang="en" default />
                </video>
                <figcaption>Watch the step, or follow the text below.</figcaption>
              </figure>}
              {s.text && <DocText text={s.text} page={current} />}
              {s.tasks && <TaskList tasks={s.tasks} stats={s.taskStats} filter={filter} />}
              {s.callouts?.map((c, i) => { const { label, Icon } = CALLOUT[c.kind]; return <aside key={i} className={`doc-callout ${c.kind}`} role="note"><Icon size={17} aria-hidden="true" /><div><b>{label}</b><p><Inline text={c.text} /></p></div></aside>; })}
              {s.code && <CodeBlock code={s.code} label={s.language ?? "JSON"} />}
              {s.rows && <div className="doc-table-wrap"><table><thead><tr>{s.rows[0].map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{s.rows.slice(1).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{j === 0 ? <code>{c}</code> : c}</td>)}</tr>)}</tbody></table></div>}
              {s.links && <div className="doc-link-cards">{s.links.map((l) => <a key={l.slug} href={`#/docs/${l.slug}`}>{l.label}<ArrowRight size={17} /></a>)}</div>}
            </div></div>
          </section>;
        })}
        {slug === "motion-graphics" && <section id="playground"><h2><span className="doc-plain">Try the motion playground</span></h2><p>Switch templates, change the headline, pause playback or scrub through the composition. This is a local preview; it does not create a project or send requests to your server.</p><MotionDemo compact /></section>}
        {slug === "examples" && <section id="gallery"><h2><span className="doc-plain">Live gallery</span></h2><p>Pick an example to play it. Each one runs on the same timeline engine as Studio and the FFmpeg renderer, and its ops are shown below. Press Copy and POST them to a project to build it yourself.</p><ExampleGallery /></section>}
        {slug === "status" && <section id="live-status"><h2><span className="doc-plain">Live status</span></h2><p>The check runs in your browser against the hosted deployment.</p><StatusPanel /></section>}
        {slug === "contribute" && CONTRIBUTORS.length > 0 && <section id="contributors"><h2><span className="doc-plain">Contributors</span></h2><p>Everyone who has landed a commit on this repository, straight from the git history.</p><ul className="contrib-list" data-testid="contrib-list">{CONTRIBUTORS.map((c) => <li key={c.name}><span className="contrib-count">{c.commits}</span> {c.name}</li>)}</ul></section>}
        <div className="doc-feedback" data-testid="doc-feedback">
          {helpful === null ? <>
            <span>Is this page helpful?</span>
            <button onClick={() => vote("yes")} data-testid="doc-feedback-yes"><ThumbsUp size={14} /> Yes</button>
            <button onClick={() => vote("no")} data-testid="doc-feedback-no"><ThumbsDown size={14} /> No</button>
          </> : <span className="doc-feedback-thanks">Thanks for the feedback.</span>}
        </div>
        <nav className="docs-pagination" aria-label="Guide navigation">{previous ? <a href={`#/docs/${previous.slug}`}><ArrowLeft size={17} /><div><small>Previous</small><b>{previous.title}</b></div></a> : <span />}{next ? <a href={`#/docs/${next.slug}`}><div><small>Next</small><b>{next.title}</b></div><ArrowRight size={17} /></a> : <a href="#/editor"><div><small>Start creating</small><b>Open Studio</b></div><ArrowUpRight size={17} /></a>}</nav>
      </> : <><h1>That guide doesn’t exist.</h1><p>Choose a topic from the sidebar, or return to the introduction.</p><a className="public-button" href="#/docs/introduction">Read the introduction</a></>}</main>
      <aside className="docs-toc"><nav aria-label="On this page"><b>On this page</b>{current?.sections.map((s) => { const id = sectionId(s.title); return <button key={s.title} className={active === id ? "on" : ""} aria-current={active === id ? "location" : undefined} onClick={() => jump(id)}>{s.title}</button>; })}{slug === "examples" && <button onClick={() => document.getElementById("gallery")?.scrollIntoView({ behavior: "smooth" })}>Live gallery</button>}{slug === "motion-graphics" && <button onClick={() => document.getElementById("playground")?.scrollIntoView({ behavior: "smooth" })}>Motion playground</button>}</nav><div className="toc-callout"><span>CREATE WITH CODE</span><p>Your agent’s next composition starts with one request.</p><a href="#/docs/quickstart">Read the quickstart <ArrowRight size={14} /></a></div></aside>
    </div>
    {showTop && <button className="docs-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top" data-testid="docs-top"><ArrowUp size={18} /></button>}
    <div className={`docs-toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast && <><Check size={15} /> {toast}</>}</div>
    {searchOpen && <DocsSearchDialog pages={DOC_PAGES} onClose={closeSearch} onGo={openFromSearch} />}
  </PublicSite>;
}

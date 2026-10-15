import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Menu, Search, X } from "lucide-react";
import { useLocation } from "wouter";
import { PublicSite, PublicHeader, CodeBlock, usePageTitle } from "@/components/forge-public";
import { DOC_PAGES } from "@/lib/docs-content";
import MotionDemo from "@/components/motion-demo";
import ExampleGallery from "@/components/example-gallery";

const sectionId=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-");
export default function ApiDocsPage({params}:{params?:{slug:string}}) {
  const slug=params?.slug??"api-reference",current=DOC_PAGES.find(p=>p.slug===slug);
  const [searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState(""),[menu,setMenu]=useState(false);
  const [,navigate]=useLocation(),searchRef=useRef<HTMLInputElement>(null),searchButton=useRef<HTMLButtonElement>(null);
  usePageTitle(current?`${current.title} · Docs`:"Page not found · Docs");
  useEffect(()=>{const h=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearchOpen(o=>!o);}if(e.key==="Escape"){setSearchOpen(false);setMenu(false);searchButton.current?.focus();}};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[]);
  useEffect(()=>{if(searchOpen)searchRef.current?.focus();},[searchOpen]);
  useEffect(()=>{setMenu(false);window.scrollTo(0,0);},[slug]);
  const filtered=DOC_PAGES.filter(p=>`${p.title} ${p.description} ${p.sections.map(s=>s.title+" "+s.text+" "+s.code+" "+s.rows?.flat().join(" ")).join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const index=DOC_PAGES.findIndex(p=>p.slug===slug),previous=DOC_PAGES[index-1],next=DOC_PAGES[index+1];
  const choose=(s:string)=>{navigate(`/docs/${s}`);setSearchOpen(false);setQuery("");};
  return <PublicSite><a className="public-skip" href="#/" onClick={e=>{e.preventDefault();document.getElementById("docs-content")?.focus();}}>Skip to content</a>
    <PublicHeader docs><button className="docs-search" ref={searchButton} onClick={()=>setSearchOpen(true)} data-testid="docs-search"><Search size={17}/><span>Search documentation</span><kbd>Ctrl K</kbd></button></PublicHeader>
    <div className="docs-mobile-bar"><button onClick={()=>setMenu(o=>!o)} aria-expanded={menu} data-testid="docs-menu"><Menu size={17}/> Documentation</button><span>{current?.title??"Not found"}</span></div>
    <div className="docs-layout">
      <aside className={`docs-sidebar ${menu?"open":""}`}><nav aria-label="Documentation">{Array.from(new Set(DOC_PAGES.map(p=>p.group))).map(group=><details open key={group}><summary>{group}</summary><div>{DOC_PAGES.filter(p=>p.group===group).map(p=><a key={p.slug} href={`#/docs/${p.slug}`} aria-current={p.slug===slug?"page":undefined} className={p.slug===slug?"selected":""} data-testid={`docs-link-${p.slug}`}>{p.title}</a>)}</div></details>)}</nav><a className="sidebar-repo" href="https://github.com/HomekidChud/videoforge/blob/main/docs/API.md">Repository reference <ArrowUpRight size={14}/></a></aside>
      <main className="docs-article" id="docs-content" tabIndex={-1}>{current?<>
        <div className="docs-breadcrumb">Documentation <span>/</span> {current.group}</div><h1>{current.title}</h1><p className="doc-lede">{current.description}</p>
        {current.sections.map(s=><section key={s.title} id={sectionId(s.title)}><h2>{s.title}<button aria-label={`Link to ${s.title}`} onClick={()=>document.getElementById(sectionId(s.title))?.scrollIntoView({behavior:"smooth"})}>#</button></h2><p>{s.text}</p>
          {s.code&&<CodeBlock code={s.code} label={s.language??"JSON"}/>}
          {s.rows&&<div className="doc-table-wrap"><table><thead><tr>{s.rows[0].map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{s.rows.slice(1).map((row,i)=><tr key={i}>{row.map((c,j)=><td key={j}>{j===0?<code>{c}</code>:c}</td>)}</tr>)}</tbody></table></div>}
          {s.links&&<div className="doc-link-cards">{s.links.map(l=><a key={l.slug} href={`#/docs/${l.slug}`}>{l.label}<ArrowRight size={17}/></a>)}</div>}
        </section>)}
        {slug==="motion-graphics"&&<section id="playground"><h2>Try the motion playground</h2><p>Switch templates, change the headline, pause playback or scrub through the composition. This is a local preview; it does not create a project or send requests to your server.</p><MotionDemo compact/></section>}
        {slug==="examples"&&<section id="gallery"><h2>Live gallery</h2><p>Pick an example to play it. Each one runs on the same timeline engine as Studio and the FFmpeg renderer, and its ops are shown below. Press Copy and POST them to a project to build it yourself.</p><ExampleGallery/></section>}
        <div className="doc-edit-row"><a href="https://github.com/HomekidChud/videoforge" target="_blank" rel="noreferrer">Contribute on GitHub <ArrowUpRight size={14}/></a><span>Timeline schema v4 · motion engine v2</span></div>
        <nav className="docs-pagination" aria-label="Guide navigation">{previous?<a href={`#/docs/${previous.slug}`}><ArrowLeft size={17}/><div><small>Previous</small><b>{previous.title}</b></div></a>:<span/>}{next?<a href={`#/docs/${next.slug}`}><div><small>Next</small><b>{next.title}</b></div><ArrowRight size={17}/></a>:<a href="#/editor"><div><small>Start creating</small><b>Open Studio</b></div><ArrowUpRight size={17}/></a>}</nav>
      </>:<><h1>That guide doesn’t exist.</h1><p>Choose a topic from the sidebar, or return to the introduction.</p><a className="public-button" href="#/docs/introduction">Read the introduction</a></>}</main>
      <aside className="docs-toc"><nav aria-label="On this page"><b>On this page</b>{current?.sections.map(s=><button key={s.title} onClick={()=>document.getElementById(sectionId(s.title))?.scrollIntoView({behavior:"smooth"})}>{s.title}</button>)}{slug==="examples"&&<button onClick={()=>document.getElementById("gallery")?.scrollIntoView({behavior:"smooth"})}>Live gallery</button>}{slug==="motion-graphics"&&<button onClick={()=>document.getElementById("playground")?.scrollIntoView({behavior:"smooth"})}>Motion playground</button>}</nav><div className="toc-callout"><span>CREATE WITH CODE</span><p>Your agent’s next composition starts with one request.</p><a href="#/docs/quickstart">Read the quickstart <ArrowRight size={14}/></a></div></aside>
    </div>
    {searchOpen&&<div className="search-backdrop" onClick={()=>{setSearchOpen(false);searchButton.current?.focus();}}><div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search documentation" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==="Tab"){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>("input,button"));const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}>
      <div className="search-input-row"><Search size={20}/><input ref={searchRef} aria-label="Search documentation" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search guides, operations, endpoints..." onKeyDown={e=>{if(e.key==="Enter"&&filtered[0])choose(filtered[0].slug);}} data-testid="docs-search-input"/><button className="public-icon" aria-label="Close search" onClick={()=>{setSearchOpen(false);searchButton.current?.focus();}}><X size={18}/></button></div>
      <div className="search-results">{filtered.length?filtered.map(p=><button key={p.slug} onClick={()=>choose(p.slug)}><span>{p.group}</span><b>{p.title}</b><p>{p.description}</p><ArrowRight size={17}/></button>):<p className="search-empty">No matches. Try “shape”, “keyframes” or “render”.</p>}</div><div className="search-footer">Enter to open first result · Escape to close</div>
    </div></div>}
  </PublicSite>;
}

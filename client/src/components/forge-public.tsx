import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Github, Moon, Sun } from "lucide-react";
import { ForgeLogo } from "./forge-shell";
import "@/public.css";

const Theme = createContext({dark:false,toggle:()=>{}});
export function PublicThemeProvider({children}:{children:ReactNode}) {
  const [dark,setDark]=useState(()=>matchMedia("(prefers-color-scheme: dark)").matches);
  return <Theme.Provider value={{dark,toggle:()=>setDark(d=>!d)}}>{children}</Theme.Provider>;
}
export function PublicSite({children}:{children:ReactNode}) {
  const {dark}=useContext(Theme);
  return <div className="public-site" data-theme={dark?"dark":"light"}>{children}</div>;
}
export function ThemeToggle() {
  const {dark,toggle}=useContext(Theme);
  return <button className="public-icon" aria-label={`Switch to ${dark?"light":"dark"} mode`} onClick={toggle} data-testid="theme-toggle">{dark?<Sun size={18}/>:<Moon size={18}/>}</button>;
}
export function PublicHeader({children,docs=false}:{children?:ReactNode;docs?:boolean}) {
  return <header className="public-header"><ForgeLogo/>{docs?<a className="docs-label" href="#/docs/introduction">Docs</a>:null}
    <div className="header-middle">{children??<nav aria-label="Main navigation"><a href="#/docs/introduction">Documentation</a><a href="#/docs/motion-graphics">Motion graphics</a><a href="#/docs/api-reference">API</a></nav>}</div>
    <a className="public-icon github-link" href="https://github.com/HomekidChud/videoforge" aria-label="VideoForge on GitHub" target="_blank" rel="noreferrer"><Github size={18}/></a><ThemeToggle/>
    <a className="public-button small header-studio" href="#/editor">Open Studio <ArrowUpRight size={15}/></a>
  </header>;
}
export function usePageTitle(title:string) {
  useEffect(()=>{document.title=`${title} | VideoForge`;},[title]);
}
export function CodeBlock({code,label="JSON"}:{code:string;label?:string}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState("");
  return <div className="code-block"><div className="code-bar"><span>{label}</span><button data-testid="copy-code" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setError("");setTimeout(()=>setCopied(false),2000);}catch{setError("Select the code below to copy it manually.");}}}>{copied?"Copied":"Copy"}</button></div><pre><code>{code}</code></pre>{error&&<p role="status">{error}</p>}</div>;
}

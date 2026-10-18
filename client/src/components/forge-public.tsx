import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, Github, Moon, Sun } from "lucide-react";
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
    <div className="header-middle">{children??<nav aria-label="Main navigation"><a href="#/docs/introduction">Documentation</a><a href="#/docs/motion-graphics">Motion graphics</a><a href="#/docs/api-reference">API</a><a href="#/signup">Sign up</a></nav>}</div>
    <a className="public-icon github-link" href="https://github.com/HomekidChud/videoforge" aria-label="VideoForge on GitHub" target="_blank" rel="noreferrer"><Github size={18}/></a><ThemeToggle/>
    <a className="public-button small header-studio" href="#/editor">Open Studio <ArrowUpRight size={15}/></a>
  </header>;
}
export function usePageTitle(title:string) {
  useEffect(()=>{document.title=`${title} | VideoForge`;},[title]);
}
const KEYWORDS = new Set(["const", "let", "var", "function", "return", "if", "else", "for", "while", "await", "async", "import", "export", "from", "new", "class", "try", "catch", "throw", "typeof", "def", "print", "curl", "true", "false", "null", "undefined", "None", "True", "False", "not", "in", "is", "and", "or"]);
const TOKEN_RE = /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d[\d._]*)\b|\b([A-Za-z_$][\w$]*)\b/g;

/** Lightweight highlighting for JSON, JavaScript, Python and shell: strings, numbers, comments, keywords and JSON keys. */
function highlightCode(code: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0, m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const cls = m[1] ? "tok-c" : m[2] ? (code.slice(m.index + m[0].length).match(/^\s*:/) ? "tok-k" : "tok-s") : m[3] ? "tok-n" : KEYWORDS.has(m[4]) ? "tok-w" : "";
    out.push(cls ? <span key={out.length} className={cls}>{m[0]}</span> : m[0]);
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({code,label="JSON"}:{code:string;label?:string}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState("");
  return <div className="code-block"><div className="code-bar"><span>{label}</span><button data-testid="copy-code" onClick={async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setError("");setTimeout(()=>setCopied(false),2000);}catch{setError("Select the code below to copy it manually.");}}}>{copied?<><Check size={13}/> Copied</>:<>Copy</>}</button></div><pre><code>{highlightCode(code)}</code></pre>{error&&<p role="status">{error}</p>}</div>;
}

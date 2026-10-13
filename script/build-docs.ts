// ============================================================================
// Static-site generator for VideoForge docs.
//
// Reads markdown sources from docs/src/, writes HTML pages into
// dist/public/docs/ with real URLs (no hash routing), plus /home.
//
// The renderer is minimal: fenced code blocks, headings, lists, tables,
// blockquotes, inline code/links. It does not run arbitrary JS — the output
// is plain HTML that works with JavaScript disabled.
// ============================================================================

import fs from "node:fs";
import path from "node:path";

type Page = { id: string; title: string; group: string; file: string };

const DOCS_SRC = "docs/src";
const OUT = "dist/public/docs";

// ---------------------------------------------------------------------------
// Navigation — matches the playvortex structure (Get Started / Concepts / API).
// ---------------------------------------------------------------------------

const PAGES: Page[] = [
  { id: "", title: "Docs home", group: "Get Started", file: "index.md" },
  { id: "guides/intro", title: "Introduction", group: "Get Started", file: "guides/intro.md" },
  { id: "guides/quickstart", title: "Your first timeline", group: "Get Started", file: "guides/quickstart.md" },
  { id: "guides/ops", title: "Editing operations", group: "Get Started", file: "guides/ops.md" },
  { id: "guides/animations", title: "Keyframes and easing", group: "Get Started", file: "guides/animations.md" },
  { id: "guides/motion-graphics", title: "Motion graphics", group: "Get Started", file: "guides/motion-graphics.md" },
  { id: "concepts/clips", title: "Clips and layers", group: "Concepts", file: "concepts/clips.md" },
  { id: "concepts/tracks", title: "Tracks", group: "Concepts", file: "concepts/tracks.md" },
  { id: "concepts/assets", title: "Assets and uploads", group: "Concepts", file: "concepts/assets.md" },
  { id: "concepts/transitions", title: "Transitions", group: "Concepts", file: "concepts/transitions.md" },
  { id: "concepts/presets", title: "Presets", group: "Concepts", file: "concepts/presets.md" },
  { id: "concepts/collab", title: "Live collaboration", group: "Concepts", file: "concepts/collab.md" },
  { id: "api/", title: "API reference", group: "API Reference", file: "api/index.md" },
  { id: "api/motion-graphics", title: "Motion graphics API", group: "API Reference", file: "api/motion-graphics.md" },
  { id: "api/editing", title: "Editing API", group: "API Reference", file: "api/editing.md" },
];

const GROUPS = ["Get Started", "Concepts", "API Reference"];

function escapeHtml(s: string): string {
  const AMP = '&', LT = '<', GT = '>';
  const QUOT = '"', SEMI = ';';
  return s
    .replace(/&/g, AMP + "amp" + SEMI)
    .replace(/</g, AMP + "lt" + SEMI)
    .replace(/>/g, AMP + "gt" + SEMI)
    .replace(/"/g, AMP + "quot" + SEMI)
    .replace(/'/g, AMP + "#39" + SEMI);
}

// Minimal inline markdown: code, bold, links.
function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function renderMarkdown(src: string): string {
  const out: string[] = [];
  let inCode = false, codeLang = "";
  const lines = src.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code blocks
    if (line.startsWith("```")) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        codeLang = line.slice(3).trim();
        out.push(`<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ""}>`);
        inCode = true;
      }
      i++;
      continue;
    }
    if (inCode) {
      out.push(escapeHtml(line));
      i++;
      continue;
    }

    // Headings
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++;
      continue;
    }

    // hr
    if (/^---+$/.test(line.trim())) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // Table
    if (line.includes("|") && lines[i + 1]?.match(/^\|[-\s|:]+\|$/)) {
      const header = line.split("|").slice(1, -1).map(s => s.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map(s => s.trim()));
        i++;
      }
      out.push("<table><thead><tr>" + header.map(h => `<th>${inline(h)}</th>`).join("") + "</tr></thead><tbody>");
      for (const r of rows) out.push("<tr>" + r.map(c => `<td>${inline(c)}</td>`).join("") + "</tr>");
      out.push("</tbody></table>");
      continue;
    }

    // List
    if (/^[-*]\s/.test(line)) {
      out.push("<ul>");
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^[-*]\s/, ""))}</li>`);
        i++;
      }
      out.push("</ul>");
      continue;
    }
    if (/^\d+\.\s/.test(line)) {
      out.push("<ol>");
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        out.push(`<li>${inline(lines[i].replace(/^\d+\.\s/, ""))}</li>`);
        i++;
      }
      out.push("</ol>");
      continue;
    }

    // Paragraph
    if (line.trim()) {
      const buf: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s|```|> )/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      out.push(`<p>${inline(buf.join(" "))}</p>`);
      continue;
    }
    i++;
  }

  return out.join("\n");
}

function renderPage(page: Page, html: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const headings = [...html.matchAll(/<h([23])[^>]*>([^<]+)<\/h\1>/g)]
    .map((m) => ({ level: m[1], id: slug(m[2]), text: m[2] }));
  const toc = headings.length
    ? `<details class="vf-ontoc"><summary>On this page</summary><ul>${headings
        .map((h) => `<li${h.level === "3" ? ' style="padding-left:12px"' : ""}><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`)
        .join("")}</ul></details>`
    : "";

  // Anchors for TOC
  const anchored = html.replace(/<h([23])([^>]*)>([^<]+)<\/h\1>/g, (_, lvl, attrs, text) =>
    `<h${lvl}${attrs} id="${slug(text)}">${text}</h${lvl}>`);

  const idx = PAGES.findIndex((p) => p.id === page.id);
  const next = PAGES[idx + 1];

  const nav = GROUPS.map((g) => {
    const items = PAGES.filter((p) => p.group === g);
    return `<details class="vf-nav-group" open>
      <summary class="vf-nav-title">${g}</summary>
      <ul class="vf-nav-links">
        ${items.map((p) => `<li><a class="vf-nav-link"${p.id === page.id ? ' aria-current="page"' : ""} href="/docs/${p.id}">${p.title}</a></li>`).join("")}
      </ul>
    </details>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)} — VideoForge Docs</title>
  <meta name="description" content="VideoForge documentation: ${escapeHtml(page.title)}" />
  <link rel="stylesheet" href="/docs/docs.css" />
</head>
<body>
  <a href="#main" class="sr-only" style="position:absolute;left:-9999px">Skip to content</a>
  <div class="vf-docs">
    <header class="vf-topbar">
      <a href="/" class="vf-logo"><span class="vf-logo-mark" aria-hidden="true"></span>VideoForge Docs</a>
      <nav class="vf-topbar-links">
        <a href="/">Home</a>
        <a href="/docs/">Docs</a>
        <a href="/docs/api/">API</a>
        <a href="https://github.com/HomekidChud/videoforge">GitHub</a>
        <button class="vf-theme-btn" type="button" data-vf-theme aria-label="Switch to dark mode">◐</button>
      </nav>
    </header>
    <aside class="vf-sidebar" aria-label="Main navigation">${nav}</aside>
    <main class="vf-main" id="main">
      ${toc}
      ${anchored}
      ${next ? `<a class="vf-next-card" href="/docs/${next.id}">
        <div><small>Next</small>${next.title}</div>
        <span class="vf-next-arrow">→</span>
      </a>` : ""}
    </main>
  </div>
  <script>
    (function () {
      var btn = document.querySelector("[data-vf-theme]");
      var root = document.documentElement;
      var saved = null;
      try { saved = localStorage.getItem("vf-theme"); } catch (e) {}
      if (saved === "dark" || saved === "light") root.setAttribute("data-theme", saved);
      function apply(t) {
        root.setAttribute("data-theme", t);
        try { localStorage.setItem("vf-theme", t); } catch (e) {}
        if (btn) btn.setAttribute("aria-label", "Switch to " + (t === "dark" ? "light" : "dark") + " mode");
      }
      if (btn) btn.addEventListener("click", function () {
        var cur = root.getAttribute("data-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        apply(cur === "dark" ? "light" : "dark");
      });
    })();
  </script>
</body>
</html>`;
}

function build() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync("docs/docs.css", path.join(OUT, "docs.css"));
  // The homepage is served at /home — copy it alongside the docs so the
  // static server can find it without a separate directory.
  if (fs.existsSync("docs/home.html")) {
    fs.copyFileSync("docs/home.html", path.join(OUT, "home.html"));
  }
  for (const page of PAGES) {
    const src = path.join(DOCS_SRC, page.file);
    if (!fs.existsSync(src)) {
      console.warn(`! missing doc source: ${src}`);
      continue;
    }
    const md = fs.readFileSync(src, "utf8");
    const outDir = path.join(OUT, page.id === "api/" ? "api" : page.id);
    fs.mkdirSync(outDir, { recursive: true });
    const html = renderPage(page, renderMarkdown(md));
    fs.writeFileSync(path.join(outDir, "index.html"), html);
  }
  console.log(`docs: ${PAGES.length} pages -> ${OUT}`);
}

build();

// Fills the bucket list (docs/TODO.md) from GitHub issues.
// Lists open issues as checklist items; --write appends new ones to docs/TODO.md
// under a "## From GitHub issues" section (created before "## Shipped:" if missing).
// Usage: tsx script/todo-from-issues.ts [--repo owner/name] [--label bug] [--write]
// Set GITHUB_TOKEN for private repos and higher rate limits.
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined; };
const repo = flag("--repo") ?? "HomekidChud/videoforge";
const label = flag("--label");
const write = args.includes("--write");

type Issue = { number: number; title: string; html_url: string; labels: { name: string }[]; pull_request?: unknown };

const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const issues: Issue[] = [];
for (let page = 1; page <= 5; page++) {
  const url = `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}${label ? `&labels=${encodeURIComponent(label)}` : ""}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub said ${res.status} ${res.statusText} for ${url}${res.status === 403 ? " — set GITHUB_TOKEN for a higher rate limit" : ""}`);
  const batch = (await res.json()) as Issue[];
  issues.push(...batch);
  if (batch.length < 100) break;
}
const open = issues.filter((i) => !i.pull_request);
const priorityOf = (i: Issue) => /priority:\s*high/i.test(i.labels.map((l) => l.name).join(",")) ? "High" : /priority:\s*low/i.test(i.labels.map((l) => l.name).join(",")) ? "Low" : "Medium";
const line = (i: Issue) => `- [ ] **${priorityOf(i)}.** ${i.title} ([#${i.number}](${i.html_url}))`;

if (!open.length) { console.log(`No open issues on ${repo}${label ? ` with label "${label}"` : ""}.`); process.exit(0); }
const lines = open.map(line);
console.log(lines.join("\n"));
if (!write) { console.log(`\n${open.length} item(s). Re-run with --write to add them to docs/TODO.md.`); process.exit(0); }

const TODO = "docs/TODO.md";
let md = await readFile(TODO, "utf-8");
const HEADING = "## From GitHub issues";
const known = new Set([...md.matchAll(/^- \[[ ~x]\]\s+\*\*(High|Medium|Low)\.\*\*\s+(.*)\(#(\d+)\)/gm)].map((m) => m[3]));
const fresh = open.filter((i) => !known.has(String(i.number)));
if (!fresh.length) { console.log("Every open issue is already on the list."); process.exit(0); }

const block = `${HEADING}\n\nItems pulled from the [issue tracker](https://github.com/${repo}/issues); regenerate with \`npm run docs\` then \`tsx script/todo-from-issues.ts --write\`.\n\n${fresh.map(line).join("\n")}\n`;
if (md.includes(HEADING)) md = md.replace(new RegExp(`${HEADING}[^#]*`), block);
else {
  const at = md.indexOf("\n## Shipped:");
  md = at >= 0 ? `${md.slice(0, at)}\n${block}${md.slice(at + 1)}` : `${md}\n${block}`;
}
await writeFile(TODO, md, "utf-8");
console.log(`Added ${fresh.length} item(s) to docs/TODO.md.`);

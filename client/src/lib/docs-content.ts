export type DocTask = { text: string; status: "todo" | "doing" | "done"; priority?: "High" | "Medium" | "Low" };
export type DocSection = { title: string; text: string; callouts?: { kind: "note" | "tip" | "warning"; text: string }[]; code?: string; language?: string; rows?: string[][]; links?: { label: string; slug: string }[]; tasks?: DocTask[] };
export type DocPage = { slug: string; group: string; title: string; description: string; sections: DocSection[]; updated?: string; added?: string; taskStats?: { done: number; doing: number; todo: number } };
// The pages themselves come from docs/*.md, compiled by script/generate-docs.ts.
export { DOC_PAGES, CONTRIBUTORS } from "./docs-generated";
const json=(v:unknown)=>JSON.stringify(v,null,2);
export const motionExample = {op:"add_motion_template",args:{template:"lower-third",title:"Ada Lovelace",subtitle:"Pioneer of computing",color:"#f6a447",start:0,duration:4}};

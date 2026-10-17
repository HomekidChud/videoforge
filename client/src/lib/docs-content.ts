export type DocSection = { title:string; text:string; callouts?:{kind:"note"|"tip"|"warning";text:string}[]; code?:string; language?:string; rows?:string[][]; links?:{label:string;slug:string}[] };
export type DocPage = { slug:string; group:string; title:string; description:string; sections:DocSection[] };
// The pages themselves come from docs/*.md, compiled by script/generate-docs.ts.
export { DOC_PAGES } from "./docs-generated";
const json=(v:unknown)=>JSON.stringify(v,null,2);
export const motionExample = {op:"add_motion_template",args:{template:"lower-third",title:"Ada Lovelace",subtitle:"Pioneer of computing",color:"#f6a447",start:0,duration:4}};

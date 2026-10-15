import { ArrowRight, ArrowUpRight, Code2, Diamond, Film, Github } from "lucide-react";
import { PublicSite, PublicHeader, CodeBlock, usePageTitle } from "@/components/forge-public";
import MotionDemo from "@/components/motion-demo";

export default function HomePage() {
  usePageTitle("Video production, programmable");
  return <PublicSite><a className="public-skip" href="#/" onClick={e=>{e.preventDefault();document.getElementById("home-content")?.focus();}}>Skip to content</a><PublicHeader/>
    <main id="home-content" tabIndex={-1}>
      <section className="home-hero">
        <div className="hero-copy"><a className="release-link" href="#/docs/examples"><span>NEW</span> Motion engine v2: 14 presets, 9 templates <ArrowRight size={14}/></a>
          <p className="public-eyebrow">THE PROGRAMMABLE VIDEO STUDIO</p><h1>From the first cut<br/>to the final frame.</h1>
          <p className="hero-description">Edit with your hands. Compose with your code. Give your AI agent the same timeline, motion tools and rendering engine you use.</p>
          <div className="hero-actions"><a className="public-button" href="#/editor">Open Studio <ArrowUpRight size={18}/></a><a className="text-button" href="#/docs/quickstart">Build with the API <ArrowRight size={16}/></a></div>
          <p className="hero-footnote">Self-hosted · Scoped API keys · FFmpeg exports</p>
        </div><div className="hero-demo"><MotionDemo/><div className="demo-caption"><Diamond size={14}/><span>Not a video. A composition running on the real timeline engine.</span></div></div>
      </section>
      <section className="home-strip" aria-label="Platform features"><span><Film size={17}/> Timeline editing</span><span><Diamond size={17}/> Keyframe animation</span><span><Code2 size={17}/> Agent-first API</span><span>Browser preview → MP4 render</span></section>
      <section className="home-workflow"><div><p className="public-eyebrow">ONE COMPOSITION. TWO WAYS TO CREATE.</p><h2>A studio for you.<br/>A toolkit for your agent.</h2><p>Upload your footage, arrange clips, add graphics and tune every keyframe in the browser. Or describe the same edits with structured JSON.</p><a className="text-button" href="#/docs/agent-workflow">Explore the agent workflow <ArrowRight size={16}/></a></div>
        <CodeBlock label="POST /api/projects/:id/timeline/ops" code={JSON.stringify({ops:[{op:"add_motion_template",args:{template:"lower-third",title:"Meet your next idea",subtitle:"Made with VideoForge",start:0,duration:4}},{op:"add_shape_clip",args:{id:"accent",shape:{type:"ellipse",width:.12,height:.21,fill:"#f6a447"},x:.85,y:.2,duration:4}}],dryRun:true},null,2)}/></section>
      <section className="home-graphics"><div className="graphics-statement"><p className="public-eyebrow">MOTION IS A FIRST-CLASS BUILDING BLOCK</p><h2>Give ideas<br/>something to move with.</h2><p>Rectangles, ellipses and lines. Lower thirds, title cards, quote cards, progress bars, kinetic type and more, plus springs, whips and wipes. Every template expands into editable clips, not a black box.</p><a className="public-button" href="#/docs/examples">See the live examples <ArrowRight size={16}/></a></div><div className="home-feature-list"><a href="#/docs/shapes"><span>01</span><div><h3>Asset-free primitives</h3><p>Fill, stroke, rounded corners and animated transforms.</p></div><ArrowUpRight size={18}/></a><a href="#/docs/keyframes"><span>02</span><div><h3>Precisely timed animation</h3><p>Clip-local keyframes, custom easing and staggered sequences.</p></div><ArrowUpRight size={18}/></a><a href="#/docs/batch-operations"><span>03</span><div><h3>A safer creative loop</h3><p>Dry-run edits, detect stale writes and inspect composed frames.</p></div><ArrowUpRight size={18}/></a></div></section>
      <section className="home-start"><h2>Your next frame starts here.</h2><a className="public-button" href="#/docs/quickstart">Read the quickstart <ArrowRight size={18}/></a></section>
    </main><footer className="public-footer"><span>VideoForge · Video production, programmable.</span><a href="#/docs/introduction">Documentation</a><a href="https://github.com/HomekidChud/videoforge"><Github size={16}/> GitHub</a></footer>
  </PublicSite>;
}

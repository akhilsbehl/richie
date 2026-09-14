// Runs only in the opaque-origin artifact iframe. It has no token or network privileges.
const correlation = new URL(document.currentScript?.getAttribute("src") ?? location.href, location.href).searchParams.get("c") ?? "";
const cap = (s: string, n = 512) => s.replace(/\s+/g, " ").trim().slice(0, n);
const pathFor = (node: Node, root: Node): number[] => { const out: number[] = []; for (let n: Node | null = node; n && n !== root; n = n.parentNode) { if (!n.parentNode) break; out.unshift(Array.from(n.parentNode.childNodes).indexOf(n as ChildNode)); } return out; };
function selector(element: Element): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const bits: string[] = []; let e: Element | null = element;
  while (e && e !== document.documentElement && bits.length < 6) { const same = Array.from(e.parentElement!.children).filter((x) => x.tagName === e!.tagName); bits.unshift(`${e.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ""}`); e = e.parentElement; }
  return bits.join(" > ") || "html";
}
function rect(r: DOMRect) { return { viewport: { x:r.x,y:r.y,width:r.width,height:r.height }, document: { x:r.x + scrollX,y:r.y + scrollY,width:r.width,height:r.height }, viewportSize:{width:innerWidth,height:innerHeight} }; }
function ignored(e: Element | null | undefined) { return !e || e.closest(".richie-html-ui,button,input,textarea,select,option,audio,video,iframe,object,embed") !== null; }
function menu(target: Record<string, unknown>, r: DOMRect) {
  document.querySelector(".richie-html-ui")?.remove(); const m = document.createElement("div"); m.className = "richie-html-ui"; Object.assign(m.style,{position:"fixed",left:`${Math.max(4,r.left)}px`,top:`${Math.max(4,r.bottom+4)}px`,zIndex:"2147483647",background:"white",border:"1px solid #777",padding:"3px"});
  for (const kind of ["comment","replace","delete"]) { const b=document.createElement("button");b.textContent=kind[0].toUpperCase()+kind.slice(1);b.onclick=()=>parent.postMessage({type:"richie-html-target",correlation,kind,target},"*");m.append(b); }
  document.body.append(m);
}
document.addEventListener("mouseup", () => { setTimeout(() => { const s=getSelection(); if (!s || s.isCollapsed || !s.rangeCount || ignored(s.anchorNode?.parentElement)) return; const r=s.getRangeAt(0), common=r.commonAncestorContainer instanceof Element?r.commonAncestorContainer:r.commonAncestorContainer.parentElement; if (!common) return; const boundary=(n:Node,o:number)=>({selector:selector(n instanceof Element?n:n.parentElement!),path:pathFor(n,n instanceof Element?n:n.parentElement!),offset:o}); menu({type:"html-text-range",selector:selector(common),commonAncestorSelector:selector(common),start:boundary(r.startContainer,r.startOffset),end:boundary(r.endContainer,r.endOffset),text:cap(s.toString()),exactText:s.toString().slice(0,2048),rect:rect(r.getBoundingClientRect())},r.getBoundingClientRect()); },0); });
document.addEventListener("click", e => { const el=(e.target as Element).closest("*"), s=getSelection(); if ((s && !s.isCollapsed) || ignored(el ?? null)) return; if (!el) return; menu({type:"html-element",selector:selector(el),path:pathFor(el,document),tag:el.tagName.toLowerCase(),text:cap(el.textContent??""),rect:rect(el.getBoundingClientRect())},el.getBoundingClientRect()); });
window.addEventListener("message", e => { if (e.source !== parent || (e.data as {correlation?:string}).correlation !== correlation) return; if ((e.data as {type?:string}).type === "richie-html-jump") { const t=(e.data as {selector?:string}).selector; if (t) document.querySelector(t)?.scrollIntoView({behavior:"smooth",block:"center"}); } });

// Opaque-origin artifact SDK: no token and no privileged network access.
const correlation = new URL(document.currentScript?.getAttribute("src") ?? location.href, location.href).searchParams.get("c") ?? "";
const cap = (s: string, n = 512) => s.replace(/\s+/g, " ").trim().slice(0, n);
const pathFor = (node: Node, root: Node): number[] => { const out: number[]=[]; for(let n:Node|null=node;n&&n!==root;n=n.parentNode) { if(!n.parentNode) break; out.unshift(Array.from(n.parentNode.childNodes).indexOf(n as ChildNode)); } return out; };
const samePath = (node: Node, root: Node, path: unknown) => Array.isArray(path) && JSON.stringify(pathFor(node,root)) === JSON.stringify(path);

function selector(element: Element): string { if(element.id) return `#${CSS.escape(element.id)}`; const bits:string[]=[]; let e:Element|null=element; while(e&&e!==document.documentElement&&bits.length<6){ const same=Array.from(e.parentElement!.children).filter(x=>x.tagName===e!.tagName); bits.unshift(`${e.tagName.toLowerCase()}${same.length>1?`:nth-of-type(${same.indexOf(e)+1})`:""}`); e=e.parentElement; } return bits.join(" > ")||"html"; }
function rect(r:DOMRect) { return {viewport:{x:r.x,y:r.y,width:r.width,height:r.height},document:{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height},viewportSize:{width:innerWidth,height:innerHeight}}; }
function ignored(e:Element|null|undefined) { return !e || e.closest(".richie-html-ui,button,input,textarea,select,option,audio,video,iframe,object,embed,a,[contenteditable],form")!==null; }

const targetClass = "richie-html-hover-target";
let hoveredTarget: Element | undefined;
let hideMenuTimer: number | undefined;

function installStyles() {
  if (document.getElementById("richie-html-review-styles")) return;
  const styles = document.createElement("style");
  styles.id = "richie-html-review-styles";
  styles.textContent = `
    .${targetClass} {
      outline: 3px solid #2563eb !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 6px rgb(37 99 235 / 18%) !important;
      cursor: crosshair !important;
    }
    .richie-html-ui {
      display: flex;
      gap: 4px;
      position: fixed;
      z-index: 2147483647;
      padding: 4px;
      border: 1px solid #dfd6cc;
      border-radius: 7px;
      background: #fffaf3;
      box-shadow: 0 4px 14px rgb(87 82 121 / 18%);
    }
    .richie-html-ui button {
      min-height: 36px;
      padding: 7px 11px;
      border: 1px solid #dfd6cc;
      border-radius: 7px;
      background: #f2e9de;
      color: #575279;
      font: .9rem/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      transition: background .15s ease, border-color .15s ease, transform .15s ease;
    }
    .richie-html-ui button:hover,
    .richie-html-ui button:focus-visible {
      border-color: #d7827e;
      background: #eadfd2;
      transform: translateY(-1px);
    }
    .richie-html-ui button:focus-visible {
      outline: 3px solid rgb(144 122 169 / 35%);
      outline-offset: 2px;
    }
    .richie-html-ui button:nth-child(3) {
      border-color: #b4637a;
      background: #b4637a;
      color: #fffaf3;
    }
    .richie-html-ui button:nth-child(3):hover,
    .richie-html-ui button:nth-child(3):focus-visible { background: #9f5369; }
  `;
  document.head.append(styles);
}

function clearHoveredTarget() {
  hoveredTarget?.classList.remove(targetClass);
  hoveredTarget = undefined;
}

function scheduleMenuHide(target: Element, menu: HTMLElement) {
  window.clearTimeout(hideMenuTimer);
  hideMenuTimer = window.setTimeout(() => {
    if (!target.matches(":hover") && !menu.matches(":hover")) {
      if (hoveredTarget === target) clearHoveredTarget();
      menu.remove();
    }
  }, 120);
}

function menu(target:Record<string,unknown>, r:DOMRect, highlighted?: Element) {
  window.clearTimeout(hideMenuTimer);
  document.querySelector(".richie-html-ui")?.remove();
  if (highlighted) {
    if (hoveredTarget !== highlighted) clearHoveredTarget();
    hoveredTarget = highlighted;
    highlighted.classList.add(targetClass);
  }
  const m=document.createElement("div");
  m.className="richie-html-ui";
  m.setAttribute("role", "toolbar");
  m.setAttribute("aria-label", "Add feedback to highlighted content");
  Object.assign(m.style,{left:`${Math.max(4,Math.min(r.left, innerWidth - 240))}px`,top:`${Math.max(4,Math.min(r.bottom+6, innerHeight - 42))}px`});
  for(const kind of ["comment","replace","delete"]){
    const b=document.createElement("button");
    b.type="button";
    b.textContent=kind[0].toUpperCase()+kind.slice(1);
    b.onclick=()=>parent.postMessage({type:"richie-html-target",correlation,kind,target},"*");
    m.append(b);
  }
  m.addEventListener("pointerenter", () => window.clearTimeout(hideMenuTimer));
  m.addEventListener("pointerleave", () => { if (highlighted) scheduleMenuHide(highlighted, m); else m.remove(); });
  document.body.append(m);
  if (highlighted) highlighted.addEventListener("pointerleave", () => scheduleMenuHide(highlighted, m), { once: true });
}

function elementTarget(el: Element) {
  return {type:"html-element",selector:selector(el),path:pathFor(el,document),tag:el.tagName.toLowerCase(),text:cap(el.textContent??""),rect:rect(el.getBoundingClientRect())};
}

installStyles();
document.addEventListener("pointerover", event => {
  const el = (event.target as Element | null)?.closest("*");
  if (!el || ignored(el) || el === hoveredTarget) return;
  const selection = getSelection();
  if (selection && !selection.isCollapsed) return;
  menu(elementTarget(el), el.getBoundingClientRect(), el);
});

document.addEventListener("mouseup",()=>setTimeout(()=>{
  const s=getSelection();
  if(!s||s.isCollapsed||!s.rangeCount||ignored(s.anchorNode?.parentElement))return;
  const r=s.getRangeAt(0),common=r.commonAncestorContainer instanceof Element?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;
  if(!common)return;
  const boundary=(n:Node,o:number)=>({selector:selector(n instanceof Element?n:n.parentElement!),path:pathFor(n,n instanceof Element?n:n.parentElement!),offset:o});
  menu({type:"html-text-range",selector:selector(common),commonAncestorSelector:selector(common),start:boundary(r.startContainer,r.startOffset),end:boundary(r.endContainer,r.endOffset),text:cap(s.toString()),exactText:s.toString().slice(0,2048),rect:rect(r.getBoundingClientRect())},r.getBoundingClientRect(),common);
},0));

function resolve(target:Record<string,unknown>): Element|undefined { const s=target.selector;if(typeof s!=="string")return;let all:Element[];try{all=Array.from(document.querySelectorAll(s));}catch{return;} if(all.length!==1)return;const el=all[0];if(target.type==="html-element" && (el.tagName.toLowerCase()!==target.tag || !samePath(el,document,target.path) || cap(el.textContent??"")!==target.text))return;if(target.type==="mermaid-node" && (el.id!==target.nodeId && selector(el)!==target.nodeId || cap(el.textContent??"")!==target.label))return;if(target.type==="html-text-range" && (!samePath(el,document,target.path) && selector(el)!==target.commonAncestorSelector))return el; }
window.addEventListener("message",e=>{const data=e.data as {correlation?:string;type?:string;target?:Record<string,unknown>};if(e.source!==parent||data.correlation!==correlation||data.type!=="richie-html-jump"||!data.target)return;const el=resolve(data.target);if(el){el.scrollIntoView({behavior:"smooth",block:"center"});(el as HTMLElement).style.outline="3px solid #ea9d34";setTimeout(()=>{ (el as HTMLElement).style.outline=""; },1400);} parent.postMessage({type:"richie-html-resolved",correlation,selector:data.target.selector,resolved:Boolean(el)},"*");});

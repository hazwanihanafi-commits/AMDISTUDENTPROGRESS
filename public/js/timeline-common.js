// timeline-common.js - shared helpers
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('API Error: ' + res.status + ' ' + txt);
  }
  return res.json();
}

function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  Object.entries(props).forEach(([k,v])=>{
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (!c) return;
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  });
  return n;
}

function showToast(msg, type='info') {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = el('div',{id:'app-toast', style:'position:fixed;right:20px;top:20px;padding:12px 16px;border-radius:10px;background:rgba(0,0,0,0.7);color:#fff;z-index:9999'});
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(()=> t.style.opacity = '0', 3500);
}

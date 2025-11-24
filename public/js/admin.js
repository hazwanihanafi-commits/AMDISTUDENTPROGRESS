// public/js/admin.js
async function apiGet(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  return await r.json();
}

function el(id){ return document.getElementById(id); }

async function loadOverview() {
  try {
    const j = await apiGet('/api/students');
    if (j.status !== 'ok') return;
    const students = j.students || [];
    el('total').textContent = students.length;
    let p1=0,p3=0,p4=0,p5=0,comp=0;
    students.forEach(s=>{
      if (s['P1 Submitted'] || s['P1']) p1++;
      if (s['P3 Submitted'] || s['P3']) p3++;
      if (s['P4 Submitted'] || s['P4']) p4++;
      if (s['P5 Submitted'] || s['P5']) p5++;
      if ((s['P1 Approved'] && s['P3 Approved'] && s['P4 Approved'] && s['P5 Approved'])) comp++;
    });
    el('p1').textContent = p1; el('p3').textContent = p3; el('p4').textContent = p4; el('p5').textContent = p5; el('completed').textContent = comp;
  } catch(e){ console.error(e); }
}

async function doSearch(){
  const m = el('searchMatric').value.trim();
  if(!m) return alert('Enter matric');
  const j = await apiGet(`/api/timeline?matric=${encodeURIComponent(m)}&template=m`);
  if (!j || j.status !== 'ok') { alert('Student not found'); return; }
  el('studentSummary').classList.remove('hidden');
  el('studentName').textContent = j.studentName || '—';
  el('studentMat').textContent = j.matric || m;
  el('p1val').textContent = j.milestones && j.milestones.P1 ? j.milestones.P1 : '--';
  el('p1app').textContent = j.milestones && j.milestones.P1 && j.milestones.P1.includes('Approved') ? 'Yes' : '--';

  // prepare preview iframe url
  el('openPrintable').onclick = () => window.open(`/printable.html?matric=${encodeURIComponent(m)}`, '_blank');
  el('embedPreview').onclick = () => {
    el('previewArea').classList.remove('hidden');
    el('previewFrame').src = `/printable.html?matric=${encodeURIComponent(m)}`;
  };
}

document.addEventListener('DOMContentLoaded',()=>{
  loadOverview();
  el('doSearch').addEventListener('click', doSearch);
  el('downloadLog').addEventListener('click', ()=> window.location = '/api/approval_log');
  el('health').addEventListener('click', async ()=> {
    const h = await apiGet('/api/health'); alert(JSON.stringify(h));
  });
  el('signout').addEventListener('click', ()=> location.href = '/logout');
});

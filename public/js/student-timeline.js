// student-timeline.js
import './timeline-common.js';

let STUDENT = { matric: null, row: null, header: [] };

async function init(matric) {
  STUDENT.matric = matric || document.getElementById('matric')?.value || null;
  if (!STUDENT.matric) return;

  try {
    const res = await apiFetch(`/api/status?matric=${encodeURIComponent(STUDENT.matric)}`);
    if (res.status !== 'ok') { showToast('Student not found'); return; }
    STUDENT.row = res.row;
    STUDENT.header = res.header || []; // if your /api/status returns header row, good; otherwise fetch separately
    renderPage();
  } catch (err) {
    console.error(err); showToast('Error loading student data');
  }
}

function renderPage() {
  const container = document.getElementById('timeline-root');
  container.innerHTML = '';

  // heading
  const h = el('div', {class:'card'}, [
    el('div',{class:'header'}, [
      el('div',{class:'logo'}, ['A']),
      el('div',{class:'title', html:`<div>${STUDENT.row['Student Name']||'Student'}</div><div class="small">${STUDENT.matric}</div>`})
    ])
  ]);
  container.appendChild(h);

  // build timeline table
  const table = el('table',{class:'timeline'}, []);
  const thead = el('thead',{},[]);
  const trh = el('tr',{},[]);
  trh.appendChild(el('th',{class:'activity'}, 'Activity'));
  // find quarter columns (header keys that look like Q1/Q2 etc)
  const quarterKeys = Object.keys(STUDENT.row).filter(k => /\bq[1-4]\b/i.test(k) || /year\s*\d/i.test(k) || /\bY\d\s*Q\d\b/i.test(k));
  const qCols = quarterKeys.length ? quarterKeys : generateDefaultQuarters();
  qCols.forEach(q=> trh.appendChild(el('th',{}, q)));
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = el('tbody',{},[]);
  // activities list - fallback to typical list if sheet doesn't provide
  const activities = [
    'Registration & Orientation','Literature Review & Proposal Preparation','Proposal Defence',
    'Research Ethics Approval (JEPeM)','Research Implementation I','Mid-Candidature Review',
    'Research Communication I','Research Implementation II','Publication I','Research Dissemination',
    'Thesis Preparation','Pre-Submission Review (JPMPMP)','Thesis Examination & Completion'
  ];
  activities.forEach(act=>{
    const tr = el('tr',{},[]);
    tr.appendChild(el('td',{class:'activity'}, act));
    qCols.forEach(q=>{
      const value = STUDENT.row[q] || '';
      const cell = el('td',{}, el('div',{class: 'qcell' + (value ? ' checked' : ''), 'data-col': q}, value ? '✓' : ''));
      cell.querySelector('.qcell').addEventListener('click', async (ev)=>{
        const elc = ev.currentTarget;
        const checked = !elc.classList.contains('checked');
        try {
          await apiFetch('/api/update_timeline', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ matric: STUDENT.matric, column: q, value: checked ? '✓' : '' })
          });
          if (checked) elc.classList.add('checked'); else elc.classList.remove('checked');
          elc.textContent = checked ? '✓' : '';
          showToast('Saved');
        } catch(e){ console.error(e); showToast('Save failed'); }
      });
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);

  // print button
  const actions = el('div',{style:'margin-top:12px;'}, [
    el('button',{class:'btn primary', onclick:()=> window.open(`/printable-timeline.html?matric=${STUDENT.matric}`)}, 'Open Printable Summary')
  ]);
  container.appendChild(actions);
}

function generateDefaultQuarters(){
  const arr = [];
  for (let y=1;y<=3;y++){
    for (let q=1;q<=4;q++){
      arr.push(`Y${y}Q${q}`);
    }
  }
  return arr;
}

// on load, check url param
document.addEventListener('DOMContentLoaded', ()=>{
  const params = new URLSearchParams(location.search);
  const m = params.get('matric') || '';
  if (m) init(m);
  document.getElementById('checkBtn')?.addEventListener('click', ()=> init(document.getElementById('matric').value));
});

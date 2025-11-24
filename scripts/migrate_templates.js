// scripts/migrate_templates.js
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const MScPath = '/mnt/data/AMDI–P2A_StudentYearPlan_MSc.xlsx';
const PhDPath = '/mnt/data/AMDI–P2b_StudentYearPlan_PhD.xlsx';

function parseTemplate(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('File not found', filePath);
    return null;
  }
  const wb = xlsx.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map(c => String(c || '').toLowerCase());
    if (r.some(c => /q1|q2|q3|q4|year\s*1/i.test(c))) {
      headerRowIndex = i;
      break;
    }
  }

  const header = rows[headerRowIndex].map(h => String(h || '').trim());
  const activities = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const act = String(row[0] || '').trim();
    if (act) activities.push(act);
  }

  const quarterCols = [];
  header.forEach((h, idx) => {
    if (/q[1-4]/i.test(String(h)) || /year\s*[0-9]/i.test(String(h))) {
      quarterCols.push({ idx, name: String(h || '').trim() });
    }
  });

  const mapping = activities.map((act, i) => {
    const row = rows[headerRowIndex + 1 + i] || [];
    const qticks = {};
    quarterCols.forEach(qc => {
      qticks[qc.name] = row[qc.idx] ? true : false;
    });
    return { activity: act, quarterColumns: quarterCols.map(q => q.name) };
  });

  return { header, activities, quarterColumns: quarterCols.map(q => q.name), mapping };
}

const msc = parseTemplate(MScPath);
const phd = parseTemplate(PhDPath);

if (msc) fs.writeFileSync('/tmp/timeline_mapping_msc.json', JSON.stringify(msc, null, 2));
if (phd) fs.writeFileSync('/tmp/timeline_mapping_phd.json', JSON.stringify(phd, null, 2));

console.log("Generated:");
console.log(" - /tmp/timeline_mapping_msc.json");
console.log(" - /tmp/timeline_mapping_phd.json");

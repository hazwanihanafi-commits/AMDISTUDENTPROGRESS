import { google } from 'googleapis';


function parseStartDate(raw) {
if (!raw) return new Date();
const s = String(raw).trim();
if (s.includes('/')) {
const parts = s.split('/');
if (parts.length === 3) {
const d = parseInt(parts[0],10), m = parseInt(parts[1],10)-1, y = parseInt(parts[2],10);
const yy = y < 100 ? 2000 + y : y;
return new Date(yy,m,d);
}
}
const dt = new Date(s);
return isNaN(dt.getTime()) ? new Date() : dt;
}


export async function readMasterTracking(spreadsheetId) {
const rows = await readRange(spreadsheetId, 'MasterTracking!A1:Z2000');
if (!rows || rows.length < 1) return [];
const headers = rows[0].map(h => (h||'').toString().trim());
const data = rows.slice(1);


const idx = (cands) => findHeaderIndex(headers, cands);


const iMat = idx(['Matric','Matric No','MatricNo']);
const iName = idx(['Student Name','Name']);
const iProg = idx(['Programme','Program']);
const iStart = idx(['Start Date','StartDate','Start']);


const iP1S = idx(['P1 Submitted','P1Submitted']);
const iP1A = idx(['P1 Approved','P1Approved']);
const iP3S = idx(['P3 Submitted','P3Submitted']);
const iP3A = idx(['P3 Approved','P3Approved']);
const iP4S = idx(['P4 Submitted','P4Submitted']);
const iP4A = idx(['P4 Approved','P4Approved']);
const iP5S = idx(['P5 Submitted','P5Submitted']);
const iP5A = idx(['P5 Approved','P5Approved']);


const iSupervisor = idx(["Main Supervisor's Email","Supervisor Email","Supervisor"]);
const iStudentEmail = idx(["Student's Email","Student Email","Email"]);
const iActivities = idx(['Milestone','Activity','Activities']);


return data.map(row => {
const col = i => (i >= 0 ? (row[i] || '').toString().trim() : '');
const mapped = {
matric: col(iMat),
name: col(iName),
programme: col(iProg),
startDate: parseStartDate(col(iStart)),
p1Submitted: !!col(iP1S),
p1Approved: !!col(iP1A),
p3Submitted: !!col(iP3S),
p3Approved: !!col(iP3A),
p4Submitted: !!col(iP4S),
p4Approved: !!col(iP4A),
p5Submitted: !!col(iP5S),
p5Approved: !!col(iP5A),
supervisorEmail: col(iSupervisor),
studentEmail: col(iStudentEmail),
activitiesRaw: col(iActivities)
};


const isPhD = /(philosophy|phd|doctor)/i.test(mapped.programme || '');
const expectedMonths = isPhD ? {P1:0,P3:3,P4:6,P5:24} : {P1:0,P3:3,P4:6,P5:12};


mapped.timeline = buildTimeline(mapped, expectedMonths);
mapped.progress = calcProgress(mapped);


let acts = [];
if (mapped.activitiesRaw) acts = mapped.activitiesRaw.split(',').map(s=>s.trim()).filter(Boolean);
mapped.activitiesGrouped = groupActivities(acts);


return mapped;
});
}

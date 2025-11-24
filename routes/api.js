import express from 'express';
import { readMasterTracking } from '../services/googleSheets.js';
const router = express.Router();


router.get('/', (req, res) => res.json({ ok: true, message: 'API is working' }));


router.get('/all', async (req, res) => {
try {
const students = await readMasterTracking(process.env.SHEET_ID);
const total = students.length;
const completed = students.filter(s => s.p5Approved).length;
const stages = {
P1: students.filter(s => s.p1Submitted || s.p1Approved).length,
P3: students.filter(s => s.p3Submitted || s.p3Approved).length,
P4: students.filter(s => s.p4Submitted || s.p4Approved).length,
P5: students.filter(s => s.p5Submitted || s.p5Approved).length,
};
res.json({ total, completed, stages, students });
} catch (err) {
console.error('API /all error:', err);
res.status(500).json({ error: 'Server error' });
}
});


router.get('/status', async (req,res) => {
try {
const matric = String(req.query.matric || '').trim();
if (!matric) return res.status(400).json({ error: 'Matric required' });
const students = await readMasterTracking(process.env.SHEET_ID);
const s = students.find(x => String(x.matric).trim() === matric);
if (!s) return res.status(404).json({ error: 'Student not found' });
res.json({ matric: s.matric, studentName: s.name, programme: s.programme, startDate: s.startDate, timeline: s.timeline, progress: s.progress });
} catch (err) {
console.error('API /status error:', err);
res.status(500).json({ error: 'Server error' });
}
});


export default router;

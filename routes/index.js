// routes/index.js (update)
const express = require('express');
const router = express.Router();
const { getAuthClient } = require('../services/googleAuth'); // your auth helper
const { readMasterTracking } = require('../services/googleSheets');

router.get('/', async (req, res, next) => {
  try {
    const auth = await getAuthClient();
    const students = await readMasterTracking(auth, process.env.SHEET_ID);
    // compute summary for donut
    const totalPct = students.length ? Math.round(students.reduce((s,st)=> s + st.progress.percentage, 0) / students.length) : 0;
    // overdue logic: expected quarter -> convert to date and compare to today
    // simple overdue: expected months for each milestone and not submitted nor approved -> overdue
    const overdueList = [];
    const now = new Date();
    students.forEach(st => {
      const milestones = [
        { id:'P1', months:0 },
        { id:'P3', months:3 },
        { id:'P4', months:6 },
        { id:'P5', months: st.programme && st.programme.toLowerCase().includes('philosophy') ? 24 : 12 }
      ];
      milestones.forEach(m => {
        const expectedDate = new Date(new Date(st.startDate).getFullYear(), new Date(st.startDate).getMonth()+m.months, 1);
        const keySubmitted = `p${m.id.slice(1)}Submitted`;
        const keyApproved = `p${m.id.slice(1)}Approved`;
        if (!st[keySubmitted] && !st[keyApproved] && expectedDate < now) {
          overdueList.push({
            matric: st.matric, name: st.name, milestone: m.id, expectedDate
          });
        }
      });
    });

    res.render('index', { students, totalPct, overdueList, imagePath: '/assets/timeline.png' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

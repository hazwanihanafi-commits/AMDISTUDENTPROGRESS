// helpers/timeline.js
'use strict';
const MS_PER_DAY = 24*60*60*1000;

/**
 * Convert JS Date -> YxQy relative to startDate
 */
function quarterLabelForDate(startDate, date) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  const monthsDiff = (d.getFullYear() - start.getFullYear())*12 + (d.getMonth() - start.getMonth());
  const year = Math.floor(monthsDiff / 12) + 1;
  const quarter = Math.floor((d.getMonth())/3) + 1; // quarter of calendar month
  return `Y${year}Q${quarter}`;
}

/**
 * Generate an array of quarter labels from startDate, for nMonths (inclusive).
 * e.g., nMonths=36 -> array of quarters across 3 years.
 */
function generateQuarters(startDate, nMonths) {
  const q = [];
  for (let m=0; m<nMonths; m+=3) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth()+m, 1);
    q.push(quarterLabelForDate(startDate, d));
  }
  // remove duplicates and keep order
  return Array.from(new Set(q));
}

/**
 * Given student object and milestone months map, return timeline object:
 * milestones = { P1:0, P3:3, P4:6, P5:24 } (for PhD)
 * If programme === "Doctor of Philosophy", use 36 total months by default
 */
function buildTimeline(student, milestones = {P1:0,P3:3,P4:6,P5:24}) {
  const start = new Date(student.startDate);
  const totalMonths = (student.programme && student.programme.toLowerCase().includes('philosophy')) ? 36 : 24;
  const quarters = generateQuarters(start, totalMonths);
  const expected = {};
  Object.entries(milestones).forEach(([k, months]) => {
    const d = new Date(start.getFullYear(), start.getMonth()+months, 1);
    expected[k] = quarterLabelForDate(start, d);
  });
  // For rendering, create an array of objects for each milestone containing expectedQuarter & actual status
  const milestonesArr = Object.keys(milestones).map(k => {
    return {
      id: k,
      expectedQuarter: expected[k],
      submitted: !!student[`p${k.slice(1)}Submitted`],
      approved: !!student[`p${k.slice(1)}Approved`]
    };
  });

  return {
    quarters,
    milestones: milestonesArr,
    totalMonths
  };
}

module.exports = { quarterLabelForDate, generateQuarters, buildTimeline };

// helpers/progress.js
'use strict';

/**
 * Calculate progress score & level based on submitted/approved fields.
 * Submitted = 0.5, Approved = 1.0
 * Milestones considered: P1, P3, P4, P5
 *
 * studentRow: {
 *   p1Submitted, p1Approved, p3Submitted, p3Approved,
 *   p4Submitted, p4Approved, p5Submitted, p5Approved
 * }
 */
function calcProgress(studentRow) {
  const pts = [
    (studentRow.p1Submitted ? 0.5 : 0) + (studentRow.p1Approved ? 1 : 0),
    (studentRow.p3Submitted ? 0.5 : 0) + (studentRow.p3Approved ? 1 : 0),
    (studentRow.p4Submitted ? 0.5 : 0) + (studentRow.p4Approved ? 1 : 0),
    (studentRow.p5Submitted ? 0.5 : 0) + (studentRow.p5Approved ? 1 : 0)
  ];
  // but note: approved column is being given full 1. We don't double count — ensure your sheet uses blank/values.
  const totalPoints = pts.reduce((a,b)=>a+b,0);
  // Cap per-milestone to 1.0 in case both submitted and approved are set (the formula earlier uses approved=1, submitted=0.5 but
  // if approved present also submitted might be present — we interpret approved as final, so clamp each milestone to 1)
  const clampedPoints = pts.map(p=> p>1?1:p).reduce((a,b)=>a+b,0);

  const score = Math.min(4, clampedPoints);
  const pct = Math.round(score / 4 * 100);

  // Determine level: highest milestone that has some submission/approval (P5->P4->P3->P1)
  let level = 'Not Started';
  if (studentRow.p5Submitted || studentRow.p5Approved) level = 'P5';
  else if (studentRow.p4Submitted || studentRow.p4Approved) level = 'P4';
  else if (studentRow.p3Submitted || studentRow.p3Approved) level = 'P3';
  else if (studentRow.p1Submitted || studentRow.p1Approved) level = 'P1';

  return { score, percentage: pct, level };
}

module.exports = { calcProgress };

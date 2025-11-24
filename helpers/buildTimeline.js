// helpers/buildTimeline.js

/**
 * Build milestone-based timeline (System B).
 * - student: { startDate: Date or string, p1Submitted: bool/string, p1Approved: bool/string, ... }
 * - expectedMonths: { P1:0, P3:3, P4:6, P5:12|24 }
 *
 * Returns { quarters: [...], milestones: [{id, expectedQuarter, submitted, approved}], status }
 */

export function buildTimeline(student, expectedMonths) {
  // parse start date
  let start = student.startDate instanceof Date ? student.startDate : new Date(student.startDate);
  if (isNaN(start.getTime())) {
    // fallback to today so we still generate quarters (but flag Invalid Start Date if you want)
    start = new Date();
  }

  // Determine total months and quarters
  const totalMonths = expectedMonths.P5;
  // For display we want:
  // - MSc: 12 months -> 4 quarters (but we can show 8 quarters = 2 years if you prefer). We'll show 8 quarters for MSc and 12 for PhD to give a wider range.
  const correctedTotalQuarters = totalMonths === 12 ? 8 : 12; // MSc -> 8 quarters, PhD -> 12 quarters

  const quarters = [];
  const cursor = new Date(start);
  for (let i = 0; i < correctedTotalQuarters; i++) {
    const year = Math.floor(i / 4) + 1;
    const q = (i % 4) + 1;
    quarters.push(`Y${year}Q${q}`);
    cursor.setMonth(cursor.getMonth() + 3);
  }

  // convert month offset -> quarter label index
  function monthToQuarterLabel(monthOffset) {
    const idx = Math.floor(monthOffset / 3);
    return quarters[idx] || quarters[quarters.length - 1];
  }

  // helper: treat any non-empty string or truthy value as true (milestone flags)
  function flag(val) {
    return val !== "" && val !== null && val !== undefined && val !== false;
  }

  const milestones = [
    {
      id: "P1",
      expectedQuarter: monthToQuarterLabel(expectedMonths.P1),
      submitted: flag(student.p1Submitted),
      approved: flag(student.p1Approved)
    },
    {
      id: "P3",
      expectedQuarter: monthToQuarterLabel(expectedMonths.P3),
      submitted: flag(student.p3Submitted),
      approved: flag(student.p3Approved)
    },
    {
      id: "P4",
      expectedQuarter: monthToQuarterLabel(expectedMonths.P4),
      submitted: flag(student.p4Submitted),
      approved: flag(student.p4Approved)
    },
    {
      id: "P5",
      expectedQuarter: monthToQuarterLabel(expectedMonths.P5),
      submitted: flag(student.p5Submitted),
      approved: flag(student.p5Approved)
    }
  ];

  // Compute status: Completed if P5 approved, Warning/Overduration based on months elapsed vs expected P5 offset
  const now = new Date();
  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  let status = "On Track";
  if (milestones[3].approved) status = "Completed";
  else if (monthsDiff > expectedMonths.P5) status = "Overduration";
  else if (monthsDiff > expectedMonths.P5 - 3) status = "Warning";

  return { quarters, milestones, status };
}

export default buildTimeline;

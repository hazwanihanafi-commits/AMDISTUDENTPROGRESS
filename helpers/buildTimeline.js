// helpers/buildTimeline.js
export function buildTimeline(student, expectedMonths) {
  const start = student.startDate instanceof Date ? student.startDate : new Date(student.startDate || Date.now());
  const totalQuarters = expectedMonths.P5 === 12 ? 8 : 12; // MSc -> 8 quarters (2y), PhD -> 12 quarters (3y)
  const quarters = [];
  for (let i = 0; i < totalQuarters; i++) {
    const year = Math.floor(i / 4) + 1;
    const q = (i % 4) + 1;
    quarters.push(`Y${year}Q${q}`);
  }

  function monthToQuarterLabel(monthOffset) {
    const idx = Math.floor(monthOffset / 3);
    return quarters[idx] || quarters[quarters.length - 1];
  }

  function flag(val) {
    return val !== "" && val !== null && val !== undefined && val !== false;
  }

  const milestones = [
    { id: "P1", expectedQuarter: monthToQuarterLabel(expectedMonths.P1), submitted: flag(student.p1Submitted), approved: flag(student.p1Approved) },
    { id: "P3", expectedQuarter: monthToQuarterLabel(expectedMonths.P3), submitted: flag(student.p3Submitted), approved: flag(student.p3Approved) },
    { id: "P4", expectedQuarter: monthToQuarterLabel(expectedMonths.P4), submitted: flag(student.p4Submitted), approved: flag(student.p4Approved) },
    { id: "P5", expectedQuarter: monthToQuarterLabel(expectedMonths.P5), submitted: flag(student.p5Submitted), approved: flag(student.p5Approved) }
  ];

  const now = new Date();
  const monthsDiff = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  let status = "On Track";
  if (milestones[3].approved) status = "Completed";
  else if (monthsDiff > expectedMonths.P5) status = "Overduration";
  else if (monthsDiff > expectedMonths.P5 - 3) status = "Warning";

  return { quarters, milestones, status };
}
export default buildTimeline;

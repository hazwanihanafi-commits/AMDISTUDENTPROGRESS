function buildTimeline(student, expectedMonths) {
  const start = new Date(student.startDate);
  if (isNaN(start)) {
    return {
      quarters: [],
      milestones: [],
      status: "Invalid Start Date"
    };
  }

  // Generate quarters (max 12 for PhD, 8 for MSc)
  const totalMonths = expectedMonths.P5;
  const totalQuarters = Math.ceil(totalMonths / 3);

  const quarters = [];
  for (let i = 0; i < totalQuarters; i++) {
    const year = Math.floor(i / 4) + 1;
    const q = (i % 4) + 1;
    quarters.push(`Y${year}Q${q}`);
  }

  // Convert expected months → expected quarter
  function monthToQuarter(m) {
    const idx = Math.floor(m / 3);
    return quarters[idx] || quarters[quarters.length - 1];
  }

  // Build milestone objects
  const milestones = [
    {
      id: "P1",
      expectedQuarter: monthToQuarter(expectedMonths.P1),
      submitted: student.p1Submitted,
      approved: student.p1Approved
    },
    {
      id: "P3",
      expectedQuarter: monthToQuarter(expectedMonths.P3),
      submitted: student.p3Submitted,
      approved: student.p3Approved
    },
    {
      id: "P4",
      expectedQuarter: monthToQuarter(expectedMonths.P4),
      submitted: student.p4Submitted,
      approved: student.p4Approved
    },
    {
      id: "P5",
      expectedQuarter: monthToQuarter(expectedMonths.P5),
      submitted: student.p5Submitted,
      approved: student.p5Approved
    }
  ];

  // Determine status
  const today = new Date();
  const monthsDiff =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth());

  let status = "On Track";
  if (student.p5Approved) status = "Completed";
  else if (monthsDiff > expectedMonths.P5) status = "Overduration";
  else if (monthsDiff > expectedMonths.P5 - 3) status = "Warning";

  return { quarters, milestones, status };
}

module.exports = { buildTimeline };

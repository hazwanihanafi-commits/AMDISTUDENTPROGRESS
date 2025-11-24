export function computeTimeline(student) {
  const {
    programme,
    startDate,
    p1Submitted, p1Approved,
    p3Submitted, p3Approved,
    p4Submitted, p4Approved,
    p5Submitted, p5Approved
  } = student;

  const durationMonths = programme === "MSc" ? 24 : 36;
  const quarters = programme === "MSc" ? 8 : 12;

  const start = new Date(startDate);

  function within(date, startQ, endQ) {
    if (!date) return false;
    const d = new Date(date);
    return d >= startQ && d <= endQ;
  }

  const timeline = [];

  for (let i = 0; i < quarters; i++) {
    let qStart = new Date(start);
    qStart.setMonth(start.getMonth() + i * 3);

    let qEnd = new Date(start);
    qEnd.setMonth(start.getMonth() + (i + 1) * 3);
    qEnd.setDate(qEnd.getDate() - 1);

    const events = [];

    if (within(p1Submitted, qStart, qEnd)) events.push("P1 Submitted");
    if (within(p1Approved,  qStart, qEnd)) events.push("P1 Approved");
    if (within(p3Submitted, qStart, qEnd)) events.push("P3 Submitted");
    if (within(p3Approved,  qStart, qEnd)) events.push("P3 Approved");
    if (within(p4Submitted, qStart, qEnd)) events.push("P4 Submitted");
    if (within(p4Approved,  qStart, qEnd)) events.push("P4 Approved");
    if (within(p5Submitted, qStart, qEnd)) events.push("P5 Submitted");
    if (within(p5Approved,  qStart, qEnd)) events.push("P5 Approved");

    timeline.push(events.join(" / "));
  }

  // Status logic:
  const today = new Date();
  const monthsDiff = (today.getFullYear() - start.getFullYear()) * 12 +
                     (today.getMonth() - start.getMonth());

  let status = "On Track";
  if (p5Approved) status = "Completed";
  else if (monthsDiff > durationMonths) status = "Overduration";
  else if (monthsDiff > durationMonths - 3) status = "Warning";

  return { timeline, status };
}

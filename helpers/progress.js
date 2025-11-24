export function calcProgress(student) {
  let score = 0;

  if (student.p1Submitted) score += 10;
  if (student.p1Approved) score += 10;

  if (student.p3Submitted) score += 20;
  if (student.p3Approved) score += 20;

  if (student.p4Submitted) score += 20;
  if (student.p4Approved) score += 20;

  if (student.p5Submitted) score += 30;
  if (student.p5Approved) score += 30;

  const percentage = Math.min(100, score);

  let level = "P1";
  if (student.p3Submitted || student.p3Approved) level = "P3";
  if (student.p4Submitted || student.p4Approved) level = "P4";
  if (student.p5Submitted || student.p5Approved) level = "P5";

  return { percentage, level };
}

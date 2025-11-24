// helpers/progress.js

export function calcProgress(s) {
  let total = 4; // P1, P3, P4, P5
  let completed = 0;

  if (s.p1Approved) completed++;
  if (s.p3Approved) completed++;
  if (s.p4Approved) completed++;
  if (s.p5Approved) completed++;

  const percentage = Math.round((completed / total) * 100);

  let level = "P1";
  if (s.p3Approved) level = "P3";
  if (s.p4Approved) level = "P4";
  if (s.p5Approved) level = "P5";

  return { percentage, level };
}

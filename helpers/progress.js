export function calcProgress(student) {
  let level = "Not Started";
  let percentage = 0;
  const { p1Submitted, p3Submitted, p4Submitted, p5Submitted } = student;
  if (p1Submitted && p3Submitted && p4Submitted && p5Submitted) {
    level = 'P5'; percentage = 100;
  } else if (p1Submitted && p3Submitted && p4Submitted) {
    level = 'P4'; percentage = 75;
  } else if (p1Submitted && p3Submitted) {
    level = 'P3'; percentage = 50;
  } else if (p1Submitted) {
    level = 'P1'; percentage = 25;
  }
  return { level, percentage };
}

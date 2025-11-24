export function calcProgress(s) {
// simple scoring: each approved = 1 point, submitted = 0.5; per milestone cap 1
const pts = [
(s.p1Submitted?0.5:0) + (s.p1Approved?1:0),
(s.p3Submitted?0.5:0) + (s.p3Approved?1:0),
(s.p4Submitted?0.5:0) + (s.p4Approved?1:0),
(s.p5Submitted?0.5:0) + (s.p5Approv

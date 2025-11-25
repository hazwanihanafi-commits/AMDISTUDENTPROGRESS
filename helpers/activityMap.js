export const ACTIVITY_MAPPING = [
  { activity:'Registration', milestone:'P1', keywords:['registration'] },
  { activity:'Literature', milestone:'P3', keywords:['literature'] },
  { activity:'Proposal', milestone:'P3', keywords:['proposal'] },
  { activity:'Ethics', milestone:'P3', keywords:['ethic','jepem'] },
  { activity:'Pilot', milestone:'P4', keywords:['pilot'] },
  { activity:'Implementation', milestone:'P4', keywords:['implement','implementation'] },
  { activity:'Mid-Candidature', milestone:'P5', keywords:['mid-candidature','mid candidature'] },
  { activity:'Seminar', milestone:'P5', keywords:['seminar'] },
  { activity:'Publication', milestone:'P4', keywords:['publication'] },
  { activity:'Dissemination', milestone:'P4', keywords:['dissemination'] },
  { activity:'Thesis', milestone:'P5', keywords:['thesis'] },
  { activity:'Pre-Submission', milestone:'P5', keywords:['pre-submission','pre submission'] },
  { activity:'Examination', milestone:'P5', keywords:['examination','viva'] }
];
export function groupActivities(activities) {
  const buckets = { P1: [], P3: [], P4: [], P5: [] };
  if (!activities || !activities.length) return buckets;
  activities.forEach(a => {
    const found = ACTIVITY_MAPPING.find(m => m.keywords.some(k => a.toLowerCase().includes(k)));
    if (found) buckets[found.milestone].push(a);
    else buckets.P4.push(a);
  });
  return buckets;
}

// helpers/activityMap.js
// Simple mapping from activity keywords to milestone id.
// You can expand the keywords array to catch variations.

export const ACTIVITY_MAPPING = [
  { activity: "Registration", milestone: "P1", keywords: ["Registration"] },
  { activity: "Literature", milestone: "P3", keywords: ["Literature"] },
  { activity: "Proposal", milestone: "P3", keywords: ["Proposal"] },
  { activity: "Ethics", milestone: "P3", keywords: ["Ethics","JEPeM"] },
  { activity: "Pilot", milestone: "P4", keywords: ["Pilot"] },
  { activity: "Implementation", milestone: "P4", keywords: ["Implementation","Implementation"] },
  { activity: "Mid-Candidature", milestone: "P5", keywords: ["Mid-Candidature","Mid Candidature"] },
  { activity: "Seminar", milestone: "P5", keywords: ["Seminar"] },
  { activity: "Publication", milestone: "P4", keywords: ["Publication"] },
  { activity: "Dissemination", milestone: "P4", keywords: ["Dissemination"] },
  { activity: "Thesis", milestone: "P5", keywords: ["Thesis"] },
  { activity: "Pre-Submission", milestone: "P5", keywords: ["Pre-Submission","Pre Submission"] },
  { activity: "Examination", milestone: "P5", keywords: ["Examination","Viva","Viva Voce"] }
];

/**
 * Group activities into milestone buckets.
 * - activities: array of {activity: 'Registration', ...} or array of plain strings
 * Returns: { P1: [...], P3: [...], P4: [...], P5: [...] }
 */
export function groupActivities(activities) {
  const buckets = { P1: [], P3: [], P4: [], P5: [] };
  if (!activities || !activities.length) return buckets;

  activities.forEach(aRaw => {
    const a = (typeof aRaw === "string") ? aRaw : (aRaw.activity || "");
    const found = ACTIVITY_MAPPING.find(m =>
      m.keywords.some(k => a.toLowerCase().includes(k.toLowerCase()))
    );
    if (found) buckets[found.milestone].push(a);
    else {
      // fallback: push to nearest milestone (P4 default)
      buckets.P4.push(a);
    }
  });

  return buckets;
}

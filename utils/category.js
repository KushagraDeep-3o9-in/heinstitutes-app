// AISHE codes are prefixed by institution category:
//   U- University      S- Standalone Institution      C- College
// This is the authoritative classification the user asked for - derived
// from the code itself, not from the (sometimes inconsistent) category
// field on individual program rows.

const CATEGORY_MAP = {
  U: { code: 'U', label: 'University' },
  S: { code: 'S', label: 'Standalone Institution' },
  C: { code: 'C', label: 'College' },
};

function getCategory(aisheCode) {
  const prefix = String(aisheCode || '').trim().charAt(0).toUpperCase();
  return CATEGORY_MAP[prefix] || { code: '?', label: 'Other' };
}

function categoryLabel(aisheCode) {
  return getCategory(aisheCode).label;
}

// For building filter links / validating the ?category= query param
const CATEGORY_CODES = Object.keys(CATEGORY_MAP); // ['U', 'S', 'C']

// categoryCounts: { U: n, S: n, C: n } -> sorted breakdown with percentages,
// for the "Institute Type" bar chart shown on programme/discipline pages.
function buildCategoryBreakdown(categoryCounts) {
  const total = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  return CATEGORY_CODES.map((code) => ({
    label: CATEGORY_MAP[code].label,
    count: categoryCounts[code] || 0,
    percent: total > 0 ? Math.round(((categoryCounts[code] || 0) / total) * 100) : 0,
  })).filter((c) => c.count > 0);
}

module.exports = { getCategory, categoryLabel, CATEGORY_CODES, CATEGORY_MAP, buildCategoryBreakdown };

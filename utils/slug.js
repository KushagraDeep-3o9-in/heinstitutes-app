/**
 * The legacy app builds institute URLs like:
 *   /india-heinstitutes/Andhra%20Pradesh/Anantapur/BHARTIYA%20...%20UNIVERSITY%20(Id:%20U-1132)
 *
 * Notice spaces are %20 but "(" ")" ":" are left LITERAL - that is the output of
 * encodeURI() on a segment, NOT encodeURIComponent() (which would also escape ":").
 * We replicate that exactly so every already-indexed URL keeps resolving byte-for-byte
 * on the new app - no redirect needed for institute pages themselves.
 */

// Build the path segment for one piece (state name, district name, or "name (Id: code)")
function seg(str) {
  return encodeURI(String(str || '').trim());
}

function instituteSlugPart(name, aisheCode) {
  return `${String(name || '').trim()} (Id: ${aisheCode})`;
}

function buildInstituteUrl({ stateName, districtName, name, aisheCode }) {
  return `/india-heinstitutes/${seg(stateName)}/${seg(districtName)}/${seg(
    instituteSlugPart(name, aisheCode)
  )}`;
}

function buildStateUrl(stateName) {
  return `/india-heinstitutes/${seg(stateName)}`;
}

function buildDistrictUrl(stateName, districtName) {
  return `/india-heinstitutes/${seg(stateName)}/${seg(districtName)}`;
}

// Express decodes :params for us, so this receives the human-readable string already.
// Pull the AISHE code out of "... (Id: U-1132)".
function parseAisheCodeFromSlug(slugParam) {
  const match = String(slugParam || '').match(/\(Id:\s*([A-Za-z0-9-]+)\)\s*$/i);
  return match ? match[1].toUpperCase() : null;
}

module.exports = {
  buildInstituteUrl,
  buildStateUrl,
  buildDistrictUrl,
  instituteSlugPart,
  parseAisheCodeFromSlug,
};

// AISHE discipline/programme names sometimes arrive with spaces stripped out
// entirely, e.g. "ArtificialIntelligenceandMachineLearning" or
// "ComputerScienceandEngineering". This reconstructs readable spacing at
// render time WITHOUT touching the stored data - so it stays reversible and
// doesn't risk corrupting names that already have legitimate CamelCase
// content (acronyms, brand names) mixed with spaces.
//
// Only kicks in when the string has NO whitespace at all - a string that
// already contains a space is assumed to be correctly formatted and is
// left untouched.

const GLUE_WORDS = ['and', 'of', 'for', 'in', 'the', 'to', 'with'];

function humanizeConcatenated(str) {
  if (!str || typeof str !== 'string') return str;
  if (/\s/.test(str)) return str; // already spaced - leave alone

  let s = str;

  // 1. Split out lowercase "glue" words (and/of/for/...) stuck between two
  //    camelCase words - must run BEFORE the generic camelCase split below,
  //    otherwise "eandM" splits into "eand M" instead of "e and M".
  const glueAlternation = GLUE_WORDS.join('|');
  const glueRegex = new RegExp(`([a-z])(${glueAlternation})([A-Z])`, 'g');
  s = s.replace(glueRegex, '$1 $2 $3');

  // 2. Generic camelCase boundary: lowercase followed by uppercase.
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');

  // 3. Collapse accidental double spaces and trim.
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// Formats an array of names into a readable comma list for FAQ answers,
// capping length so an institute with 80 programmes doesn't produce an
// unreadable wall of text - "and N more" instead.
function formatList(items, max = 12) {
  const clean = [...new Set(items.filter(Boolean))];
  if (clean.length === 0) return '';
  if (clean.length <= max) return clean.join(', ');
  return `${clean.slice(0, max).join(', ')}, and ${clean.length - max} more`;
}

module.exports = { humanizeConcatenated, formatList };

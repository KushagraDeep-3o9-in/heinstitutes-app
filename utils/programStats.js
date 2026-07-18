// All computed from the raw heprograms rows for a given programmeId/discipline.
// Same principle as utils/seoContent.js for institute pages: templated from
// data, not LLM-generated, so it's fast, consistent, and factually anchored.

const { formatList } = require('./textClean');

function toInt(val) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? 0 : n;
}

function buildProgrammeStats(programRows, instituteCount, stateCount) {
  const totalIntake = programRows.reduce((sum, p) => sum + toInt(p.intake), 0);

  const modeCounts = {};
  const courseTypeCounts = {};
  const durations = [];

  programRows.forEach((p) => {
    if (p.mode) modeCounts[p.mode] = (modeCounts[p.mode] || 0) + 1;
    if (p.courseType) courseTypeCounts[p.courseType] = (courseTypeCounts[p.courseType] || 0) + 1;
    const dy = toInt(p.durationYear);
    if (dy > 0) durations.push(dy);
  });

  // Reported as a range rather than an average - "1 to 3 years" is more
  // honest than "2.1 years" when durations actually vary across institutes,
  // and reads better than a decimal for a duration nobody actually offers.
  let durationRange = null;
  if (durations.length > 0) {
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    durationRange = min === max ? `${min} year${min === 1 ? '' : 's'}` : `${min} to ${max} years`;
  }

  const sortByCountDesc = (obj, totalRows) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        count,
        percent: totalRows > 0 ? Math.round((count / totalRows) * 100) : 0,
      }));

  return {
    totalIntake,
    instituteCount,
    stateCount,
    durationRange,
    modeBreakdown: sortByCountDesc(modeCounts, programRows.length),
    courseTypeBreakdown: sortByCountDesc(courseTypeCounts, programRows.length),
  };
}

function buildProgrammeDescription(programmeName, level, discipline, stats) {
  const parts = [];
  parts.push(
    `${programmeName}${level ? ` is a ${level}-level programme` : ' is a programme'}${
      discipline ? ` in ${discipline}` : ''
    }, offered by ${stats.instituteCount.toLocaleString()} institute${
      stats.instituteCount === 1 ? '' : 's'
    } across ${stats.stateCount} state${stats.stateCount === 1 ? '' : 's'} in India, as recorded in AISHE data.`
  );
  if (stats.totalIntake > 0) {
    parts.push(
      `Combined approved seat intake across all institutes offering this programme is ${stats.totalIntake.toLocaleString()} students per year.`
    );
  }
  if (stats.durationRange) {
    parts.push(`Duration is ${stats.durationRange}.`);
  }
  return parts.join(' ');
}

function buildProgrammeFaq(programmeName, stats, categoryCounts, categoryMap, disciplineNames) {
  const faqs = [];

  faqs.push({
    q: `How many institutes offer ${programmeName}?`,
    a: `${stats.instituteCount.toLocaleString()} institutes across ${stats.stateCount} state${
      stats.stateCount === 1 ? '' : 's'
    } offer ${programmeName}, according to AISHE data.`,
  });

  if (disciplineNames && disciplineNames.length > 0) {
    faqs.push({
      q: `What disciplines are offered in ${programmeName}?`,
      a: `${programmeName} falls under the following discipline${disciplineNames.length > 1 ? 's' : ''}: ${formatList(disciplineNames)}.`,
    });
  }

  if (stats.totalIntake > 0) {
    faqs.push({
      q: `What is the total seat intake for ${programmeName}?`,
      a: `The combined approved intake across all institutes offering ${programmeName} is ${stats.totalIntake.toLocaleString()} seats per year.`,
    });
  }

  const catParts = Object.keys(categoryMap)
    .filter((code) => categoryCounts[code] > 0)
    .map((code) => `${categoryCounts[code].toLocaleString()} ${categoryMap[code].label.toLowerCase()}${categoryCounts[code] === 1 ? '' : 's'}`);
  if (catParts.length > 0) {
    faqs.push({
      q: `What types of institutions offer ${programmeName}?`,
      a: `Among institutes offering ${programmeName}: ${catParts.join(', ')}.`,
    });
  }

  if (stats.durationRange) {
    faqs.push({
      q: `How long does ${programmeName} take to complete?`,
      a: `${programmeName} typically takes ${stats.durationRange} to complete, based on AISHE-reported durations across institutes.`,
    });
  }

  if (stats.modeBreakdown.length > 0) {
    faqs.push({
      q: `Is ${programmeName} available in distance/online mode?`,
      a: `${programmeName} is offered in the following mode(s): ${stats.modeBreakdown
        .map((m) => `${m.label} (${m.count} institute${m.count === 1 ? '' : 's'})`)
        .join(', ')}.`,
    });
  }

  return faqs;
}

function buildDisciplineDescription(disciplineName, stats) {
  const parts = [];
  parts.push(
    `${disciplineName} is studied at ${stats.instituteCount.toLocaleString()} institute${
      stats.instituteCount === 1 ? '' : 's'
    } across ${stats.stateCount} state${stats.stateCount === 1 ? '' : 's'} in India, as recorded in AISHE data.`
  );
  if (stats.totalIntake > 0) {
    parts.push(
      `Combined approved seat intake across all institutes offering ${disciplineName} is ${stats.totalIntake.toLocaleString()} students per year.`
    );
  }
  if (stats.durationRange) {
    parts.push(`Programmes in this discipline run ${stats.durationRange}.`);
  }
  return parts.join(' ');
}

function buildDisciplineFaq(disciplineName, stats, categoryCounts, categoryMap, programmeNames) {
  const faqs = [];

  faqs.push({
    q: `How many institutes offer ${disciplineName}?`,
    a: `${stats.instituteCount.toLocaleString()} institutes across ${stats.stateCount} state${
      stats.stateCount === 1 ? '' : 's'
    } offer programmes in ${disciplineName}, according to AISHE data.`,
  });

  if (programmeNames && programmeNames.length > 0) {
    faqs.push({
      q: `What programs are offered in ${disciplineName}?`,
      a: `${disciplineName} includes the following programme${programmeNames.length > 1 ? 's' : ''}: ${formatList(programmeNames)}.`,
    });
  }

  if (stats.totalIntake > 0) {
    faqs.push({
      q: `What is the total seat intake for ${disciplineName}?`,
      a: `The combined approved intake across all institutes offering ${disciplineName} is ${stats.totalIntake.toLocaleString()} seats per year.`,
    });
  }

  const catParts = Object.keys(categoryMap)
    .filter((code) => categoryCounts[code] > 0)
    .map((code) => `${categoryCounts[code].toLocaleString()} ${categoryMap[code].label.toLowerCase()}${categoryCounts[code] === 1 ? '' : 's'}`);
  if (catParts.length > 0) {
    faqs.push({
      q: `What types of institutions offer ${disciplineName}?`,
      a: `Among institutes offering ${disciplineName}: ${catParts.join(', ')}.`,
    });
  }

  if (stats.durationRange) {
    faqs.push({
      q: `How long do ${disciplineName} programmes take to complete?`,
      a: `Programmes in ${disciplineName} typically take ${stats.durationRange} to complete, based on AISHE-reported durations.`,
    });
  }

  return faqs;
}

module.exports = {
  buildProgrammeStats,
  buildProgrammeDescription,
  buildProgrammeFaq,
  buildDisciplineDescription,
  buildDisciplineFaq,
};

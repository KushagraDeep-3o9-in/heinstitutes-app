// All copy here is generated from the data itself via fixed templates.
// Deliberately NOT LLM-generated per-request - keeps pages fast, consistent,
// and avoids AdSense/Search-Quality risk from unreviewed generated text at scale.

const { formatList } = require('./textClean');

function safe(val, fallback = 'Not available') {
  if (val === null || val === undefined || val === '' || val === 'null') return fallback;
  return val;
}

function buildMetaDescription(inst) {
  const type = safe(inst.institutionType, 'institution');
  const loc = [inst.districtName, inst.stateName].filter(Boolean).join(', ');
  const year = inst.yearOfEstablishment ? `, established ${inst.yearOfEstablishment}` : '';
  const full = `${inst.name} is a ${type} located in ${loc}${year}. View AISHE code (${inst.aisheCode}), address, management type, courses offered, and admission details.`;
  return truncateAtWord(full, 158);
}

// Google typically truncates SERP snippets around 155-160 characters - cut
// at a word boundary instead of mid-word so it never ends on a fragment.
function truncateAtWord(str, maxLen) {
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  return cut.slice(0, cut.lastIndexOf(' ')).trim() + '...';
}

function buildTitle(inst) {
  const loc = [inst.districtName, inst.stateName].filter(Boolean).join(', ');
  return `${inst.name} - ${loc} | Courses, AISHE Code, Contact | AISHE Directory`;
}

// Summarize the linked heprograms rows into stats used both on-page and in FAQ
function summarizeProgramme(programs) {
  const levels = [...new Set(programs.map((p) => p.level).filter(Boolean))];
  const disciplineGroups = [...new Set(programs.map((p) => p.disciplineGroup).filter(Boolean))];
  const totalIntake = programs.reduce((sum, p) => sum + (parseInt(p.intake, 10) || 0), 0);
  const modes = [...new Set(programs.map((p) => p.mode).filter(Boolean))];
  const earliestYear = programs
    .map((p) => parseInt(p.yearOfStart, 10))
    .filter((y) => !Number.isNaN(y))
    .sort((a, b) => a - b)[0];

  return { levels, disciplineGroups, totalIntake, modes, earliestYear, count: programs.length };
}

function buildFaq(inst, programs, categoryContext) {
  const stats = summarizeProgramme(programs);
  const loc = [inst.districtName, inst.stateName].filter(Boolean).join(', ');
  const faqs = [];

  faqs.push({
    q: `Where is ${inst.name} located?`,
    a: `${inst.name} is located in ${loc}. Address: ${safe(inst.address1, 'address not available')}.`,
  });

  faqs.push({
    q: `What type of institution is ${inst.name}?`,
    a: `${inst.name} is classified as a "${safe(inst.institutionType)}"${
      inst.manegement ? ` under ${inst.manegement} management` : ''
    }.`,
  });

  if (categoryContext && categoryContext.districtCount > 0) {
    faqs.push({
      q: `How many other ${categoryContext.label.toLowerCase()}s are in ${inst.districtName}?`,
      a: `${inst.name} is one of ${categoryContext.districtCount.toLocaleString()} ${categoryContext.label.toLowerCase()}${
        categoryContext.districtCount === 1 ? '' : 's'
      } in ${inst.districtName} district, and one of ${categoryContext.stateCount.toLocaleString()} in ${inst.stateName} overall.`,
    });
  }

  if (inst.yearOfEstablishment) {
    faqs.push({
      q: `When was ${inst.name} established?`,
      a: `${inst.name} was established in ${inst.yearOfEstablishment}.`,
    });
  }

  if (stats.count > 0) {
    faqs.push({
      q: `What courses does ${inst.name} offer?`,
      a: `${inst.name} offers ${stats.count} program${stats.count > 1 ? 's' : ''} across ${
        stats.levels.length
      } level${stats.levels.length > 1 ? 's' : ''} (${stats.levels.join(', ')}), spanning ${
        stats.disciplineGroups.join(', ') || 'multiple disciplines'
      }.`,
    });

    if (stats.totalIntake > 0) {
      faqs.push({
        q: `What is the total student intake at ${inst.name}?`,
        a: `Across all listed programs, ${inst.name} has a combined approved intake of ${stats.totalIntake} students per year, as per AISHE data.`,
      });
    }

    const disciplineNames = [...new Set(programs.map((p) => p.discipline).filter(Boolean))];
    if (disciplineNames.length > 0) {
      faqs.push({
        q: `What disciplines are offered at ${inst.name}?`,
        a: `${inst.name} offers programmes in the following discipline${disciplineNames.length > 1 ? 's' : ''}: ${formatList(disciplineNames)}.`,
      });
    }

    const programmeNames = [...new Set(programs.map((p) => p.programme).filter(Boolean))];
    if (programmeNames.length > 0) {
      faqs.push({
        q: `What programs are offered at ${inst.name}?`,
        a: `${inst.name} offers the following programme${programmeNames.length > 1 ? 's' : ''}: ${formatList(programmeNames)}.`,
      });
    }
  } else {
    faqs.push({
      q: `What courses does ${inst.name} offer?`,
      a: `Detailed programme-level data for ${inst.name} is not yet available in our database. Check the official website for the current list of courses.`,
    });
  }

  faqs.push({
    q: `What is the AISHE code of ${inst.name}?`,
    a: `The All India Survey on Higher Education (AISHE) code for ${inst.name} is ${inst.aisheCode}.`,
  });

  if (inst.webSite) {
    faqs.push({
      q: `What is the official website of ${inst.name}?`,
      a: `The official website is ${String(inst.webSite).replace(/[[\]]/g, '').split('(').pop().replace(')', '')}.`,
    });
  }

  return faqs;
}

module.exports = { buildMetaDescription, buildTitle, buildFaq, summarizeProgramme, safe, truncateAtWord };

const express = require('express');
const router = express.Router();
const Institute = require('../models/Institute');
const Program = require('../models/Program');
const { getCategory, categoryLabel, CATEGORY_CODES, CATEGORY_MAP, buildCategoryBreakdown } = require('../utils/category');
const { buildInstituteUrl } = require('../utils/slug');
const {
  buildProgrammeStats,
  buildProgrammeDescription,
  buildProgrammeFaq,
  buildLocationDescription,
  buildLocationFaq,
} = require('../utils/programStats');
const { truncateAtWord } = require('../utils/seoContent');
const { faqSchema, breadcrumbSchema } = require('../utils/jsonld');
const { humanizeConcatenated } = require('../utils/textClean');

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE, 10) || 30;
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Shared institute-listing + category-breakdown logic used by both the
// national and location-scoped programme pages.
async function buildInstituteListing(aisheCodesScope, activeCategory, page) {
  const filter = activeCategory
    ? { $and: [{ aisheCode: { $in: aisheCodesScope } }, { aisheCode: { $regex: `^${activeCategory}`, $options: 'i' } }] }
    : { aisheCode: { $in: aisheCodesScope } };

  const total = await Institute.countDocuments(filter);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const institutes = await Institute.find(filter)
    .sort({ name: 1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const categoryCounts = {};
  for (const code of CATEGORY_CODES) {
    categoryCounts[code] = await Institute.countDocuments({
      $and: [{ aisheCode: { $in: aisheCodesScope } }, { aisheCode: { $regex: `^${code}`, $options: 'i' } }],
    });
  }

  return { total, totalPages, institutes, categoryCounts };
}

// ---------- /india-heinstitutes/programs ----------
// Hub page: every distinct programme, with how many institutes offer it
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const agg = await Program.aggregate([
      { $match: { programmeId: { $ne: null }, programme: { $ne: null } } },
      {
        $group: {
          _id: { programmeId: '$programmeId', programme: '$programme', level: '$level' },
          institutes: { $addToSet: '$aisheCode' },
        },
      },
      { $project: { _id: 0, programmeId: '$_id.programmeId', programme: '$_id.programme', level: '$_id.level', count: { $size: '$institutes' } } },
      { $sort: { count: -1, programme: 1 } },
    ]);

    const total = agg.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const pageItems = agg.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((p) => ({
      ...p,
      programme: humanizeConcatenated(p.programme),
    }));

    res.render('programs', {
      programmes: pageItems,
      page,
      totalPages,
      total,
      canonicalUrl: `${SITE_ORIGIN}/india-heinstitutes/programs${page > 1 ? `?page=${page}` : ''}`,
      title: 'Browse Institutes by Programme/Course | AISHE Directory',
      metaDescription: `Browse ${total.toLocaleString()} programmes offered across Indian higher-education institutes. Filter by University, College, or Standalone Institution.`,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/programs/:programmeId ----------
// Institutes offering a given programme nationally, filterable by category
router.get('/:programmeId', async (req, res, next) => {
  try {
    const { programmeId } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    const sampleProgram = await Program.findOne({ programmeId }).lean();
    if (!sampleProgram) return next();

    const programmeName = humanizeConcatenated(sampleProgram.programme);
    const disciplineName = humanizeConcatenated(sampleProgram.discipline);

    const allProgramRows = await Program.find({ programmeId }).lean();
    const aisheCodes = [...new Set(allProgramRows.map((p) => p.aisheCode))];
    if (aisheCodes.length === 0) return next();

    const stateCount = (await Institute.distinct('stateName', { aisheCode: { $in: aisheCodes } }))
      .filter(Boolean).length;

    const { total, totalPages, institutes, categoryCounts } = await buildInstituteListing(aisheCodes, activeCategory, page);

    const stats = buildProgrammeStats(allProgramRows, aisheCodes.length, stateCount);
    const description = buildProgrammeDescription(programmeName, sampleProgram.level, disciplineName, stats);
    const disciplineNamesForFaq = [...new Set(allProgramRows.map((p) => humanizeConcatenated(p.discipline)).filter(Boolean))];
    const faqs = buildProgrammeFaq(programmeName, stats, categoryCounts, CATEGORY_MAP, disciplineNamesForFaq);
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    // "Where Can I Study X?" - state breakdown, doubles as the crawl path
    // into the location-scoped pages below.
    const stateAgg = await Institute.aggregate([
      { $match: { aisheCode: { $in: aisheCodes }, stateName: { $ne: null } } },
      { $group: { _id: '$stateName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const drillDownLinks = stateAgg.map((s) => ({
      label: s._id,
      url: `/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(s._id)}`,
      count: s.count,
    }));
    const drillDownHeading = `Where Can I Study ${programmeName}?`;

    const basePath = `/india-heinstitutes/programs/${programmeId}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('program-detail', {
      programme: programmeName,
      programmeId,
      level: sampleProgram.level,
      discipline: disciplineName,
      disciplineUrl: sampleProgram.discipline
        ? `/india-heinstitutes/disciplines/${encodeURIComponent(sampleProgram.discipline)}`
        : null,
      locationLabel: null,
      secondaryStatLabel: 'States Covered',
      description,
      stats,
      faqs,
      categoryBreakdown,
      drillDownLinks,
      drillDownHeading,
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      page,
      totalPages,
      total,
      activeCategory,
      CATEGORY_MAP,
      categoryCounts,
      basePath,
      buildInstituteUrl,
      canonicalUrl,
      jsonLdFaq: JSON.stringify(faqSchema(faqs)),
      breadcrumbItems: [
        { name: 'Home', url: `${SITE_ORIGIN}/india-heinstitutes` },
        { name: 'Browse by Programme', url: `${SITE_ORIGIN}/india-heinstitutes/programs` },
        { name: programmeName, url: canonicalUrl },
      ],
      jsonLdBreadcrumb: JSON.stringify(
        breadcrumbSchema([
          { name: 'Home', url: SITE_ORIGIN },
          { name: 'Browse by Programme', url: `${SITE_ORIGIN}/india-heinstitutes/programs` },
          { name: programmeName, url: canonicalUrl },
        ])
      ),
      title: `${programmeName} - ${stats.instituteCount.toLocaleString()} Institutes, ${stats.totalIntake.toLocaleString()} Seats | AISHE Directory`,
      metaDescription: truncateAtWord(
        `${programmeName}${sampleProgram.level ? ` (${sampleProgram.level})` : ''}: ${stats.instituteCount.toLocaleString()} institutes across ${stats.stateCount} states, ${stats.totalIntake.toLocaleString()} total seats. Filter by University, College, or Standalone Institution.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/programs/:programmeId/:state ----------
// "Where can I study <programme> in <state>?"
router.get('/:programmeId/:state', async (req, res, next) => {
  try {
    const { programmeId, state } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    const sampleProgram = await Program.findOne({ programmeId }).lean();
    if (!sampleProgram) return next();

    const aisheCodesNational = await Program.distinct('aisheCode', { programmeId });
    if (aisheCodesNational.length === 0) return next();

    // Confirm at least one institute in this state actually offers the
    // programme - a location page with zero results is a thin page and a
    // dead end for both users and crawlers, so we 404 instead of rendering
    // an empty shell.
    const canonicalInst = await Institute.findOne({
      aisheCode: { $in: aisheCodesNational },
      stateName: new RegExp(`^${escapeRegex(state)}$`, 'i'),
    }).select('stateName');
    if (!canonicalInst) return next();

    const canonicalState = canonicalInst.stateName;
    if (canonicalState !== state) {
      return res.redirect(301, `/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}`);
    }

    const programmeName = humanizeConcatenated(sampleProgram.programme);
    const disciplineName = humanizeConcatenated(sampleProgram.discipline);

    const aisheCodesInState = await Institute.distinct('aisheCode', {
      aisheCode: { $in: aisheCodesNational },
      stateName: canonicalState,
    });

    const { total, totalPages, institutes, categoryCounts } = await buildInstituteListing(aisheCodesInState, activeCategory, page);

    const programRowsInState = await Program.find({ programmeId, aisheCode: { $in: aisheCodesInState } }).lean();
    const districtCount = (await Institute.distinct('districtName', { aisheCode: { $in: aisheCodesInState } }))
      .filter(Boolean).length;

    const stats = buildProgrammeStats(programRowsInState, aisheCodesInState.length, districtCount);
    const description = buildLocationDescription(programmeName, canonicalState, stats);
    const faqs = buildLocationFaq(programmeName, canonicalState, stats, categoryCounts, CATEGORY_MAP);
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    // Drill down one level further: districts within this state
    const districtAgg = await Institute.aggregate([
      { $match: { aisheCode: { $in: aisheCodesInState }, districtName: { $ne: null } } },
      { $group: { _id: '$districtName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const drillDownLinks = districtAgg.map((d) => ({
      label: d._id,
      url: `/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}/${encodeURIComponent(d._id)}`,
      count: d.count,
    }));
    const drillDownHeading = `Where Can I Study ${programmeName} in ${canonicalState}?`;

    const basePath = `/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('program-detail', {
      programme: programmeName,
      programmeId,
      level: sampleProgram.level,
      discipline: disciplineName,
      disciplineUrl: sampleProgram.discipline
        ? `/india-heinstitutes/disciplines/${encodeURIComponent(sampleProgram.discipline)}`
        : null,
      locationLabel: canonicalState,
      secondaryStatLabel: 'Districts Covered',
      description,
      stats,
      faqs,
      categoryBreakdown,
      drillDownLinks,
      drillDownHeading,
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      page,
      totalPages,
      total,
      activeCategory,
      CATEGORY_MAP,
      categoryCounts,
      basePath,
      buildInstituteUrl,
      canonicalUrl,
      jsonLdFaq: JSON.stringify(faqSchema(faqs)),
      breadcrumbItems: [
        { name: 'Home', url: `${SITE_ORIGIN}/india-heinstitutes` },
        { name: 'Browse by Programme', url: `${SITE_ORIGIN}/india-heinstitutes/programs` },
        { name: programmeName, url: `${SITE_ORIGIN}/india-heinstitutes/programs/${programmeId}` },
        { name: canonicalState, url: canonicalUrl },
      ],
      jsonLdBreadcrumb: JSON.stringify(
        breadcrumbSchema([
          { name: 'Home', url: SITE_ORIGIN },
          { name: 'Browse by Programme', url: `${SITE_ORIGIN}/india-heinstitutes/programs` },
          { name: programmeName, url: `${SITE_ORIGIN}/india-heinstitutes/programs/${programmeId}` },
          { name: canonicalState, url: canonicalUrl },
        ])
      ),
      title: `${programmeName} Colleges in ${canonicalState} - ${stats.instituteCount.toLocaleString()} Institutes | AISHE Directory`,
      metaDescription: truncateAtWord(
        `Where to study ${programmeName} in ${canonicalState}: ${stats.instituteCount.toLocaleString()} institutes across ${districtCount} districts, ${stats.totalIntake.toLocaleString()} total seats.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/programs/:programmeId/:state/:district ----------
// "Where can I study <programme> in <district>, <state>?"
router.get('/:programmeId/:state/:district', async (req, res, next) => {
  try {
    const { programmeId, state, district } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    const sampleProgram = await Program.findOne({ programmeId }).lean();
    if (!sampleProgram) return next();

    const aisheCodesNational = await Program.distinct('aisheCode', { programmeId });
    if (aisheCodesNational.length === 0) return next();

    const canonicalInst = await Institute.findOne({
      aisheCode: { $in: aisheCodesNational },
      stateName: new RegExp(`^${escapeRegex(state)}$`, 'i'),
      districtName: new RegExp(`^${escapeRegex(district)}$`, 'i'),
    }).select('stateName districtName');
    if (!canonicalInst) return next();

    const canonicalState = canonicalInst.stateName;
    const canonicalDistrict = canonicalInst.districtName;
    if (canonicalState !== state || canonicalDistrict !== district) {
      return res.redirect(
        301,
        `/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalDistrict)}`
      );
    }

    const programmeName = humanizeConcatenated(sampleProgram.programme);
    const disciplineName = humanizeConcatenated(sampleProgram.discipline);

    const aisheCodesInDistrict = await Institute.distinct('aisheCode', {
      aisheCode: { $in: aisheCodesNational },
      stateName: canonicalState,
      districtName: canonicalDistrict,
    });

    const { total, totalPages, institutes, categoryCounts } = await buildInstituteListing(aisheCodesInDistrict, activeCategory, page);

    const programRowsInDistrict = await Program.find({ programmeId, aisheCode: { $in: aisheCodesInDistrict } }).lean();
    const stats = buildProgrammeStats(programRowsInDistrict, aisheCodesInDistrict.length, 1);

    const locationLabel = `${canonicalDistrict}, ${canonicalState}`;
    const description = buildLocationDescription(programmeName, locationLabel, stats);
    const faqs = buildLocationFaq(programmeName, locationLabel, stats, categoryCounts, CATEGORY_MAP);
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    const basePath = `/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalDistrict)}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('program-detail', {
      programme: programmeName,
      programmeId,
      level: sampleProgram.level,
      discipline: disciplineName,
      disciplineUrl: sampleProgram.discipline
        ? `/india-heinstitutes/disciplines/${encodeURIComponent(sampleProgram.discipline)}`
        : null,
      locationLabel,
      secondaryStatLabel: null,
      description,
      stats,
      faqs,
      categoryBreakdown,
      drillDownLinks: [],
      drillDownHeading: null,
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      page,
      totalPages,
      total,
      activeCategory,
      CATEGORY_MAP,
      categoryCounts,
      basePath,
      buildInstituteUrl,
      canonicalUrl,
      jsonLdFaq: JSON.stringify(faqSchema(faqs)),
      breadcrumbItems: [
        { name: 'Home', url: `${SITE_ORIGIN}/india-heinstitutes` },
        { name: 'Browse by Programme', url: `${SITE_ORIGIN}/india-heinstitutes/programs` },
        { name: programmeName, url: `${SITE_ORIGIN}/india-heinstitutes/programs/${programmeId}` },
        { name: canonicalState, url: `${SITE_ORIGIN}/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}` },
        { name: canonicalDistrict, url: canonicalUrl },
      ],
      jsonLdBreadcrumb: JSON.stringify(
        breadcrumbSchema([
          { name: 'Home', url: SITE_ORIGIN },
          { name: 'Browse by Programme', url: `${SITE_ORIGIN}/india-heinstitutes/programs` },
          { name: programmeName, url: `${SITE_ORIGIN}/india-heinstitutes/programs/${programmeId}` },
          { name: canonicalState, url: `${SITE_ORIGIN}/india-heinstitutes/programs/${programmeId}/${encodeURIComponent(canonicalState)}` },
          { name: canonicalDistrict, url: canonicalUrl },
        ])
      ),
      title: `${programmeName} Colleges in ${canonicalDistrict}, ${canonicalState} - ${stats.instituteCount.toLocaleString()} Institutes | AISHE Directory`,
      metaDescription: truncateAtWord(
        `Where to study ${programmeName} in ${canonicalDistrict}, ${canonicalState}: ${stats.instituteCount.toLocaleString()} institutes, ${stats.totalIntake.toLocaleString()} total seats.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

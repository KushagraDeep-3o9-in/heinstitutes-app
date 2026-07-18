const express = require('express');
const router = express.Router();
const Institute = require('../models/Institute');
const Program = require('../models/Program');
const { getCategory, categoryLabel, CATEGORY_CODES, CATEGORY_MAP, buildCategoryBreakdown } = require('../utils/category');
const { buildInstituteUrl } = require('../utils/slug');
const { buildProgrammeStats, buildProgrammeDescription, buildProgrammeFaq } = require('../utils/programStats');
const { truncateAtWord } = require('../utils/seoContent');
const { faqSchema, breadcrumbSchema } = require('../utils/jsonld');
const { humanizeConcatenated } = require('../utils/textClean');

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE, 10) || 30;
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

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
// Institutes offering a given programme, filterable by category
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

    // All rows for this programme (not just distinct institutes) - needed to
    // compute seat totals, mode/funding breakdowns, duration, etc. Programme
    // row counts are small enough (one row per institute-offering) that
    // fetching them all is cheap even for a popular programme.
    const allProgramRows = await Program.find({ programmeId }).lean();
    const aisheCodes = [...new Set(allProgramRows.map((p) => p.aisheCode))];
    if (aisheCodes.length === 0) return next();

    const stateCount = (await Institute.distinct('stateName', { aisheCode: { $in: aisheCodes } }))
      .filter(Boolean).length;

    const filter = activeCategory
      ? { $and: [{ aisheCode: { $in: aisheCodes } }, { aisheCode: { $regex: `^${activeCategory}`, $options: 'i' } }] }
      : { aisheCode: { $in: aisheCodes } };

    const total = await Institute.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

    const institutes = await Institute.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    // Counts per category, for the filter links (always computed unfiltered so counts don't shift as you filter)
    const categoryCounts = {};
    for (const code of CATEGORY_CODES) {
      categoryCounts[code] = await Institute.countDocuments({
        $and: [{ aisheCode: { $in: aisheCodes } }, { aisheCode: { $regex: `^${code}`, $options: 'i' } }],
      });
    }

    const stats = buildProgrammeStats(allProgramRows, aisheCodes.length, stateCount);
    const description = buildProgrammeDescription(programmeName, sampleProgram.level, disciplineName, stats);
    const disciplineNamesForFaq = [...new Set(allProgramRows.map((p) => humanizeConcatenated(p.discipline)).filter(Boolean))];
    const faqs = buildProgrammeFaq(programmeName, stats, categoryCounts, CATEGORY_MAP, disciplineNamesForFaq);
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    const basePath = `/india-heinstitutes/programs/${programmeId}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('program-detail', {
      programme: programmeName,
      level: sampleProgram.level,
      discipline: disciplineName,
      disciplineUrl: sampleProgram.discipline
        ? `/india-heinstitutes/disciplines/${encodeURIComponent(sampleProgram.discipline)}`
        : null,
      description,
      stats,
      faqs,
      categoryBreakdown,
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

module.exports = router;

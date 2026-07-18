const express = require('express');
const router = express.Router();
const Institute = require('../models/Institute');
const Program = require('../models/Program');
const { getCategory, CATEGORY_CODES, CATEGORY_MAP, buildCategoryBreakdown } = require('../utils/category');
const { buildInstituteUrl } = require('../utils/slug');
const { buildProgrammeStats, buildDisciplineDescription, buildDisciplineFaq } = require('../utils/programStats');
const { faqSchema, breadcrumbSchema } = require('../utils/jsonld');
const { humanizeConcatenated } = require('../utils/textClean');
const { truncateAtWord } = require('../utils/seoContent');

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE, 10) || 30;
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- /india-heinstitutes/disciplines ----------
// Hub page: every distinct discipline, with how many institutes offer it
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const agg = await Program.aggregate([
      { $match: { discipline: { $nin: [null, ''] } } },
      { $group: { _id: '$discipline', institutes: { $addToSet: '$aisheCode' } } },
      { $project: { _id: 0, discipline: '$_id', count: { $size: '$institutes' } } },
      { $sort: { count: -1, discipline: 1 } },
    ]);

    const total = agg.length;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const pageItems = agg.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((d) => ({
      raw: d.discipline,
      display: humanizeConcatenated(d.discipline),
      count: d.count,
    }));

    res.render('disciplines', {
      disciplines: pageItems,
      page,
      totalPages,
      total,
      canonicalUrl: `${SITE_ORIGIN}/india-heinstitutes/disciplines${page > 1 ? `?page=${page}` : ''}`,
      title: 'Browse Institutes by Discipline | AISHE Directory',
      metaDescription: truncateAtWord(
        `Browse ${total.toLocaleString()} disciplines offered across Indian higher-education institutes. Filter by University, College, or Standalone Institution.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/disciplines/:disciplineSlug ----------
// Institutes offering programmes in a given discipline, filterable by category
router.get('/:disciplineSlug', async (req, res, next) => {
  try {
    const disciplineParam = req.params.disciplineSlug; // Express already decoded this
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    // Exact match first (this is what our own links produce)
    let sampleProgram = await Program.findOne({ discipline: disciplineParam }).lean();

    // Fallback: case-insensitive, for hand-typed/older URLs - then 301 to the
    // canonical-cased slug so we don't split ranking signal across variants.
    if (!sampleProgram) {
      sampleProgram = await Program.findOne({
        discipline: new RegExp(`^${escapeRegex(disciplineParam)}$`, 'i'),
      }).lean();
      if (sampleProgram) {
        return res.redirect(301, `/india-heinstitutes/disciplines/${encodeURIComponent(sampleProgram.discipline)}`);
      }
      return next();
    }

    const disciplineRaw = sampleProgram.discipline;
    const disciplineName = humanizeConcatenated(disciplineRaw);

    const allProgramRows = await Program.find({ discipline: disciplineRaw }).lean();
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

    const categoryCounts = {};
    for (const code of CATEGORY_CODES) {
      categoryCounts[code] = await Institute.countDocuments({
        $and: [{ aisheCode: { $in: aisheCodes } }, { aisheCode: { $regex: `^${code}`, $options: 'i' } }],
      });
    }

    // Distinct programmes taught within this discipline - real internal
    // links back into the Programme section, and useful context for readers.
    const allRelatedProgrammes = [
      ...new Map(
        allProgramRows
          .filter((p) => p.programmeId && p.programme)
          .map((p) => [p.programmeId, { programmeId: p.programmeId, programme: humanizeConcatenated(p.programme) }])
      ).values(),
    ];
    const relatedProgrammes = allRelatedProgrammes.slice(0, 15);

    const stats = buildProgrammeStats(allProgramRows, aisheCodes.length, stateCount);
    const description = buildDisciplineDescription(disciplineName, stats);
    const faqs = buildDisciplineFaq(
      disciplineName,
      stats,
      categoryCounts,
      CATEGORY_MAP,
      allRelatedProgrammes.map((p) => p.programme)
    );
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    const basePath = `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('discipline-detail', {
      discipline: disciplineName,
      description,
      stats,
      faqs,
      relatedProgrammes,
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      categoryBreakdown,
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
          { name: 'Browse by Discipline', url: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
          { name: disciplineName, url: canonicalUrl },
        ])
      ),
      title: `${disciplineName} - ${stats.instituteCount.toLocaleString()} Institutes, ${stats.totalIntake.toLocaleString()} Seats | AISHE Directory`,
      metaDescription: truncateAtWord(
        `${disciplineName}: ${stats.instituteCount.toLocaleString()} institutes across ${stats.stateCount} states, ${stats.totalIntake.toLocaleString()} total seats. Filter by University, College, or Standalone Institution.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

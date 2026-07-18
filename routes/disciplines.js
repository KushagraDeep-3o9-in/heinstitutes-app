const express = require('express');
const router = express.Router();
const Institute = require('../models/Institute');
const Program = require('../models/Program');
const { getCategory, CATEGORY_CODES, CATEGORY_MAP, buildCategoryBreakdown } = require('../utils/category');
const { buildInstituteUrl } = require('../utils/slug');
const {
  buildProgrammeStats,
  buildDisciplineDescription,
  buildDisciplineFaq,
  buildLocationDescription,
  buildLocationFaq,
} = require('../utils/programStats');
const { faqSchema, breadcrumbSchema } = require('../utils/jsonld');
const { humanizeConcatenated } = require('../utils/textClean');
const { truncateAtWord } = require('../utils/seoContent');

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE, 10) || 30;
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

// ---------- /india-heinstitutes/disciplines ----------
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
router.get('/:disciplineSlug', async (req, res, next) => {
  try {
    const disciplineParam = req.params.disciplineSlug;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    let sampleProgram = await Program.findOne({ discipline: disciplineParam }).lean();

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

    const { total, totalPages, institutes, categoryCounts } = await buildInstituteListing(aisheCodes, activeCategory, page);

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

    const stateAgg = await Institute.aggregate([
      { $match: { aisheCode: { $in: aisheCodes }, stateName: { $ne: null } } },
      { $group: { _id: '$stateName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const drillDownLinks = stateAgg.map((s) => ({
      label: s._id,
      url: `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(s._id)}`,
      count: s.count,
    }));
    const drillDownHeading = `Where Can I Study ${disciplineName}?`;

    const basePath = `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('discipline-detail', {
      discipline: disciplineName,
      disciplineRaw,
      locationLabel: null,
      secondaryStatLabel: 'States Covered',
      description,
      stats,
      faqs,
      relatedProgrammes,
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      categoryBreakdown,
      drillDownLinks,
      drillDownHeading,
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
        { name: 'Browse by Discipline', url: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
        { name: disciplineName, url: canonicalUrl },
      ],
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

// ---------- /india-heinstitutes/disciplines/:disciplineSlug/:state ----------
// "Where can I study <discipline> in <state>?"
router.get('/:disciplineSlug/:state', async (req, res, next) => {
  try {
    const disciplineParam = req.params.disciplineSlug;
    const { state } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    const sampleProgram = await Program.findOne({ discipline: disciplineParam }).lean();
    if (!sampleProgram) return next();
    const disciplineRaw = sampleProgram.discipline;
    const disciplineName = humanizeConcatenated(disciplineRaw);

    const aisheCodesNational = await Program.distinct('aisheCode', { discipline: disciplineRaw });
    if (aisheCodesNational.length === 0) return next();

    const canonicalInst = await Institute.findOne({
      aisheCode: { $in: aisheCodesNational },
      stateName: new RegExp(`^${escapeRegex(state)}$`, 'i'),
    }).select('stateName');
    if (!canonicalInst) return next();

    const canonicalState = canonicalInst.stateName;
    if (canonicalState !== state) {
      return res.redirect(
        301,
        `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}`
      );
    }

    const aisheCodesInState = await Institute.distinct('aisheCode', {
      aisheCode: { $in: aisheCodesNational },
      stateName: canonicalState,
    });

    const { total, totalPages, institutes, categoryCounts } = await buildInstituteListing(aisheCodesInState, activeCategory, page);

    const programRowsInState = await Program.find({ discipline: disciplineRaw, aisheCode: { $in: aisheCodesInState } }).lean();
    const districtCount = (await Institute.distinct('districtName', { aisheCode: { $in: aisheCodesInState } }))
      .filter(Boolean).length;

    const stats = buildProgrammeStats(programRowsInState, aisheCodesInState.length, districtCount);
    const description = buildLocationDescription(disciplineName, canonicalState, stats);
    const faqs = buildLocationFaq(disciplineName, canonicalState, stats, categoryCounts, CATEGORY_MAP);
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    const districtAgg = await Institute.aggregate([
      { $match: { aisheCode: { $in: aisheCodesInState }, districtName: { $ne: null } } },
      { $group: { _id: '$districtName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const drillDownLinks = districtAgg.map((d) => ({
      label: d._id,
      url: `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}/${encodeURIComponent(d._id)}`,
      count: d.count,
    }));
    const drillDownHeading = `Where Can I Study ${disciplineName} in ${canonicalState}?`;

    const basePath = `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('discipline-detail', {
      discipline: disciplineName,
      disciplineRaw,
      locationLabel: canonicalState,
      secondaryStatLabel: 'Districts Covered',
      description,
      stats,
      faqs,
      relatedProgrammes: [],
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      categoryBreakdown,
      drillDownLinks,
      drillDownHeading,
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
        { name: 'Browse by Discipline', url: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
        { name: disciplineName, url: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}` },
        { name: canonicalState, url: canonicalUrl },
      ],
      jsonLdBreadcrumb: JSON.stringify(
        breadcrumbSchema([
          { name: 'Home', url: SITE_ORIGIN },
          { name: 'Browse by Discipline', url: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
          { name: disciplineName, url: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}` },
          { name: canonicalState, url: canonicalUrl },
        ])
      ),
      title: `${disciplineName} Colleges in ${canonicalState} - ${stats.instituteCount.toLocaleString()} Institutes | AISHE Directory`,
      metaDescription: truncateAtWord(
        `Where to study ${disciplineName} in ${canonicalState}: ${stats.instituteCount.toLocaleString()} institutes across ${districtCount} districts, ${stats.totalIntake.toLocaleString()} total seats.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/disciplines/:disciplineSlug/:state/:district ----------
// "Where can I study <discipline> in <district>, <state>?"
router.get('/:disciplineSlug/:state/:district', async (req, res, next) => {
  try {
    const disciplineParam = req.params.disciplineSlug;
    const { state, district } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const categoryParam = (req.query.category || '').toUpperCase();
    const activeCategory = CATEGORY_CODES.includes(categoryParam) ? categoryParam : null;

    const sampleProgram = await Program.findOne({ discipline: disciplineParam }).lean();
    if (!sampleProgram) return next();
    const disciplineRaw = sampleProgram.discipline;
    const disciplineName = humanizeConcatenated(disciplineRaw);

    const aisheCodesNational = await Program.distinct('aisheCode', { discipline: disciplineRaw });
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
        `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalDistrict)}`
      );
    }

    const aisheCodesInDistrict = await Institute.distinct('aisheCode', {
      aisheCode: { $in: aisheCodesNational },
      stateName: canonicalState,
      districtName: canonicalDistrict,
    });

    const { total, totalPages, institutes, categoryCounts } = await buildInstituteListing(aisheCodesInDistrict, activeCategory, page);

    const programRowsInDistrict = await Program.find({ discipline: disciplineRaw, aisheCode: { $in: aisheCodesInDistrict } }).lean();
    const stats = buildProgrammeStats(programRowsInDistrict, aisheCodesInDistrict.length, 1);

    const locationLabel = `${canonicalDistrict}, ${canonicalState}`;
    const description = buildLocationDescription(disciplineName, locationLabel, stats);
    const faqs = buildLocationFaq(disciplineName, locationLabel, stats, categoryCounts, CATEGORY_MAP);
    const categoryBreakdown = buildCategoryBreakdown(categoryCounts);

    const basePath = `/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalDistrict)}`;
    const canonicalUrl = `${SITE_ORIGIN}${basePath}${activeCategory ? `?category=${activeCategory}` : ''}${page > 1 ? `${activeCategory ? '&' : '?'}page=${page}` : ''}`;

    res.render('discipline-detail', {
      discipline: disciplineName,
      disciplineRaw,
      locationLabel,
      secondaryStatLabel: null,
      description,
      stats,
      faqs,
      relatedProgrammes: [],
      institutes,
      institutesWithCategory: institutes.map((i) => ({ ...i, category: getCategory(i.aisheCode) })),
      categoryBreakdown,
      drillDownLinks: [],
      drillDownHeading: null,
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
        { name: 'Browse by Discipline', url: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
        { name: disciplineName, url: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}` },
        { name: canonicalState, url: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}` },
        { name: canonicalDistrict, url: canonicalUrl },
      ],
      jsonLdBreadcrumb: JSON.stringify(
        breadcrumbSchema([
          { name: 'Home', url: SITE_ORIGIN },
          { name: 'Browse by Discipline', url: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
          { name: disciplineName, url: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}` },
          { name: canonicalState, url: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(disciplineRaw)}/${encodeURIComponent(canonicalState)}` },
          { name: canonicalDistrict, url: canonicalUrl },
        ])
      ),
      title: `${disciplineName} Colleges in ${canonicalDistrict}, ${canonicalState} - ${stats.instituteCount.toLocaleString()} Institutes | AISHE Directory`,
      metaDescription: truncateAtWord(
        `Where to study ${disciplineName} in ${canonicalDistrict}, ${canonicalState}: ${stats.instituteCount.toLocaleString()} institutes, ${stats.totalIntake.toLocaleString()} total seats.`,
        158
      ),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

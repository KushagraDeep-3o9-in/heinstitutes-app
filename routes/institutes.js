const express = require('express');
const router = express.Router();
const Institute = require('../models/Institute');
const Program = require('../models/Program');
const {
  buildInstituteUrl,
  buildStateUrl,
  buildDistrictUrl,
  parseAisheCodeFromSlug,
} = require('../utils/slug');
const { buildMetaDescription, buildTitle, buildFaq } = require('../utils/seoContent');
const { collegeSchema, breadcrumbSchema, faqSchema } = require('../utils/jsonld');
const { categoryLabel, getCategory } = require('../utils/category');
const { humanizeConcatenated } = require('../utils/textClean');

const PAGE_SIZE = parseInt(process.env.PAGE_SIZE, 10) || 30;
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

// ---------- /india-heinstitutes ----------
// State-level hub page (top of the SEO funnel)
router.get('/', async (req, res, next) => {
  try {
    const states = await Institute.aggregate([
      { $group: { _id: '$stateName', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      { $sort: { _id: 1 } },
    ]);

    res.render('home', {
      states,
      buildStateUrl,
      canonicalUrl: `${SITE_ORIGIN}/india-heinstitutes`,
      title: 'Higher Education Institutes in India - Browse by State | AISHE Directory',
      metaDescription:
        'Browse verified higher-education institutes across every Indian state, sourced from AISHE data. Find courses, AISHE codes, and contact details.',
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/:state ----------
// District-level hub page
router.get('/:state', async (req, res, next) => {
  try {
    const stateName = req.params.state;

    const districts = await Institute.aggregate([
      { $match: { stateName: new RegExp(`^${escapeRegex(stateName)}$`, 'i') } },
      { $group: { _id: '$districtName', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      { $sort: { _id: 1 } },
    ]);

    if (districts.length === 0) return next();

    // Canonicalize casing if the URL didn't exactly match stored stateName
    const canonicalState = await Institute.findOne({
      stateName: new RegExp(`^${escapeRegex(stateName)}$`, 'i'),
    }).select('stateName');

    if (canonicalState && canonicalState.stateName !== stateName) {
      return res.redirect(301, buildStateUrl(canonicalState.stateName));
    }

    res.render('state', {
      stateName,
      districts,
      buildDistrictUrl,
      canonicalUrl: `${SITE_ORIGIN}${buildStateUrl(stateName)}`,
      title: `Higher Education Institutes in ${stateName} - Browse by District | AISHE Directory`,
      metaDescription: `Explore higher-education institutes in ${stateName} by district. AISHE codes, courses, and contact details for every listed institute.`,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/:state/:district ----------
// Institute listing page for a district, paginated
router.get('/:state/:district', async (req, res, next) => {
  try {
    const { state, district } = req.params;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const filter = {
      stateName: new RegExp(`^${escapeRegex(state)}$`, 'i'),
      districtName: new RegExp(`^${escapeRegex(district)}$`, 'i'),
    };

    const total = await Institute.countDocuments(filter);
    if (total === 0) return next();

    const canonicalDoc = await Institute.findOne(filter).select('stateName districtName');
    if (
      canonicalDoc &&
      (canonicalDoc.stateName !== state || canonicalDoc.districtName !== district)
    ) {
      return res.redirect(301, buildDistrictUrl(canonicalDoc.stateName, canonicalDoc.districtName));
    }

    const institutes = await Institute.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    const totalPages = Math.ceil(total / PAGE_SIZE);

    res.render('district', {
      stateName: state,
      districtName: district,
      institutes,
      page,
      totalPages,
      buildInstituteUrl,
      buildDistrictUrl,
      buildStateUrl,
      canonicalUrl: `${SITE_ORIGIN}${buildDistrictUrl(state, district)}${page > 1 ? `?page=${page}` : ''}`,
      title: `Higher Education Institutes in ${district}, ${state} | AISHE Directory`,
      metaDescription: `List of ${total} higher-education institutes in ${district}, ${state}, with AISHE codes, courses and contact details.`,
    });
  } catch (err) {
    next(err);
  }
});

// ---------- /india-heinstitutes/:state/:district/:slug ----------
// Individual institute detail page - the main SEO/AdSense revenue page
router.get('/:state/:district/:slug', async (req, res, next) => {
  try {
    const { state, district, slug } = req.params;
    const aisheCode = parseAisheCodeFromSlug(slug);

    if (!aisheCode) return next();

    const inst = await Institute.findOne({
      aisheCode: new RegExp(`^${escapeRegex(aisheCode)}$`, 'i'),
    }).lean();

    if (!inst) return next();

    const canonicalUrlPath = buildInstituteUrl(inst);
    const requestedUrlPath = req.originalUrl.split('?')[0];

    // If the name/state/district on file has since changed, 301 to the canonical
    // URL - but the AISHE-code lookup above means the OLD indexed URL still
    // resolves (200 -> 301 -> 200) instead of 404ing.
    if (decodeURIComponent(requestedUrlPath) !== decodeURI(canonicalUrlPath)) {
      return res.redirect(301, canonicalUrlPath);
    }

    const programsRaw = await Program.find({
      aisheCode: new RegExp(`^${escapeRegex(aisheCode)}$`, 'i'),
    }).lean();

    // AISHE sometimes strips spaces from discipline/programme names
    // (e.g. "ArtificialIntelligenceandMachineLearning") - fix at render time.
    const programs = programsRaw.map((p) => ({
      ...p,
      programme: humanizeConcatenated(p.programme),
      discipline: humanizeConcatenated(p.discipline),
      disciplineGroup: humanizeConcatenated(p.disciplineGroup),
      disciplineUrl: p.discipline
        ? `/india-heinstitutes/disciplines/${encodeURIComponent(p.discipline)}`
        : null,
    }));

    const relatedInstitutes = await getRelatedInstitutes(inst);

    // "1 of 12 Universities in this district" style context - genuinely new
    // information for the reader, not just a repeat of the institute's own type.
    const instCategory = getCategory(inst.aisheCode);
    const [categoryCountDistrict, categoryCountState] = await Promise.all([
      Institute.countDocuments({
        stateName: inst.stateName,
        districtName: inst.districtName,
        aisheCode: { $regex: `^${instCategory.code}`, $options: 'i' },
      }),
      Institute.countDocuments({
        stateName: inst.stateName,
        aisheCode: { $regex: `^${instCategory.code}`, $options: 'i' },
      }),
    ]);
    const categoryContext = {
      label: instCategory.label,
      districtCount: categoryCountDistrict,
      stateCount: categoryCountState,
    };

    const faqs = buildFaq(inst, programs, categoryContext);
    const canonicalUrl = `${SITE_ORIGIN}${canonicalUrlPath}`;

    res.render('institute', {
      inst,
      programs,
      faqs,
      relatedInstitutes,
      categoryContext,
      title: buildTitle(inst),
      metaDescription: buildMetaDescription(inst),
      canonicalUrl,
      buildStateUrl,
      buildDistrictUrl,
      buildInstituteUrl,
      categoryLabel,
      jsonLdCollege: JSON.stringify(collegeSchema(inst, canonicalUrl)),
      jsonLdBreadcrumb: JSON.stringify(
        breadcrumbSchema([
          { name: 'Home', url: SITE_ORIGIN },
          { name: 'Institutes', url: `${SITE_ORIGIN}/india-heinstitutes` },
          { name: inst.stateName, url: `${SITE_ORIGIN}${buildStateUrl(inst.stateName)}` },
          {
            name: inst.districtName,
            url: `${SITE_ORIGIN}${buildDistrictUrl(inst.stateName, inst.districtName)}`,
          },
          { name: inst.name, url: canonicalUrl },
        ])
      ),
      jsonLdFaq: JSON.stringify(faqSchema(faqs)),
    });
  } catch (err) {
    next(err);
  }
});

// Random sample of 8 nearby institutes for internal linking - same district
// first (most relevant to the reader, strengthens district hub-page linking),
// topped up from the same state if the district doesn't have enough.
async function getRelatedInstitutes(inst, count = 8) {
  const sameDistrict = await Institute.aggregate([
    {
      $match: {
        stateName: inst.stateName,
        districtName: inst.districtName,
        aisheCode: { $ne: inst.aisheCode },
      },
    },
    { $sample: { size: count } },
    { $project: { name: 1, aisheCode: 1, stateName: 1, districtName: 1, institutionType: 1 } },
  ]);

  if (sameDistrict.length >= count) return sameDistrict;

  const topUp = await Institute.aggregate([
    {
      $match: {
        stateName: inst.stateName,
        districtName: { $ne: inst.districtName },
        aisheCode: { $ne: inst.aisheCode },
      },
    },
    { $sample: { size: count - sameDistrict.length } },
    { $project: { name: 1, aisheCode: 1, stateName: 1, districtName: 1, institutionType: 1 } },
  ]);

  return [...sameDistrict, ...topUp];
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;

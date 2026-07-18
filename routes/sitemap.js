const express = require('express');
const router = express.Router();
const NodeCache = require('node-cache');
const Institute = require('../models/Institute');
const Program = require('../models/Program');
const { buildInstituteUrl, buildStateUrl, buildDistrictUrl } = require('../utils/slug');

const SITE_ORIGIN = process.env.SITE_ORIGIN || '';
// Sitemaps don't need to be real-time fresh - cache for 6 hours to keep DB load low.
const cache = new NodeCache({ stdTTL: 6 * 60 * 60 });

function xmlEscape(str) {
  return String(str).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])
  );
}

function urlsetXml(urls) {
  const body = urls
    .map((u) => `<url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

// ---------- /sitemap.xml : the index ----------
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const cached = cache.get('sitemap-index');
    if (cached) {
      res.type('application/xml');
      return res.send(cached);
    }

    const states = await Institute.distinct('stateName');
    const today = new Date().toISOString().slice(0, 10);

    const sitemaps = [
      `<sitemap><loc>${SITE_ORIGIN}/india-heinstitutes/sitemap-hub.xml</loc><lastmod>${today}</lastmod></sitemap>`,
      `<sitemap><loc>${SITE_ORIGIN}/india-heinstitutes/sitemap-programs.xml</loc><lastmod>${today}</lastmod></sitemap>`,
      `<sitemap><loc>${SITE_ORIGIN}/india-heinstitutes/sitemap-disciplines.xml</loc><lastmod>${today}</lastmod></sitemap>`,
      ...states
        .filter(Boolean)
        .map(
          (s) =>
            `<sitemap><loc>${SITE_ORIGIN}/india-heinstitutes/sitemap-state-${encodeURIComponent(
              s
            )}.xml</loc><lastmod>${today}</lastmod></sitemap>`
        ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.join(
      ''
    )}</sitemapindex>`;

    cache.set('sitemap-index', xml);
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

// ---------- Hub pages (home + state + district listing pages) ----------
router.get('/sitemap-hub.xml', async (req, res, next) => {
  try {
    const cached = cache.get('sitemap-hub');
    if (cached) {
      res.type('application/xml');
      return res.send(cached);
    }

    const pairs = await Institute.aggregate([
      { $match: { stateName: { $ne: null }, districtName: { $ne: null } } },
      { $group: { _id: { state: '$stateName', district: '$districtName' } } },
    ]);
    const states = [...new Set(pairs.map((p) => p._id.state))];

    const urls = [
      { loc: `${SITE_ORIGIN}/india-heinstitutes` },
      { loc: `${SITE_ORIGIN}/india-heinstitutes/programs` },
      { loc: `${SITE_ORIGIN}/india-heinstitutes/disciplines` },
      ...states.map((s) => ({ loc: `${SITE_ORIGIN}${buildStateUrl(s)}` })),
      ...pairs.map((p) => ({ loc: `${SITE_ORIGIN}${buildDistrictUrl(p._id.state, p._id.district)}` })),
    ];

    const xml = urlsetXml(urls);
    cache.set('sitemap-hub', xml);
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

// ---------- Per-programme pages ("browse by programme") ----------
router.get('/sitemap-programs.xml', async (req, res, next) => {
  try {
    const cached = cache.get('sitemap-programs');
    if (cached) {
      res.type('application/xml');
      return res.send(cached);
    }

    const programmeIds = await Program.distinct('programmeId', { programmeId: { $ne: null } });
    const urls = programmeIds.map((id) => ({
      loc: `${SITE_ORIGIN}/india-heinstitutes/programs/${encodeURIComponent(id)}`,
    }));

    const xml = urlsetXml(urls);
    cache.set('sitemap-programs', xml);
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

// ---------- Per-discipline pages ("browse by discipline") ----------
router.get('/sitemap-disciplines.xml', async (req, res, next) => {
  try {
    const cached = cache.get('sitemap-disciplines');
    if (cached) {
      res.type('application/xml');
      return res.send(cached);
    }

    const disciplines = await Program.distinct('discipline', { discipline: { $nin: [null, ''] } });
    const urls = disciplines.map((d) => ({
      loc: `${SITE_ORIGIN}/india-heinstitutes/disciplines/${encodeURIComponent(d)}`,
    }));

    const xml = urlsetXml(urls);
    cache.set('sitemap-disciplines', xml);
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

// ---------- Per-state institute-page sitemap ----------
router.get('/sitemap-state-:state.xml', async (req, res, next) => {
  try {
    const stateName = decodeURIComponent(req.params.state);
    const cacheKey = `sitemap-state-${stateName}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      res.type('application/xml');
      return res.send(cached);
    }

    const institutes = await Institute.find({ stateName }).select(
      'name aisheCode stateName districtName'
    ).lean();

    if (institutes.length === 0) return next();

    const urls = institutes.map((i) => ({ loc: `${SITE_ORIGIN}${buildInstituteUrl(i)}` }));
    const xml = urlsetXml(urls);
    cache.set(cacheKey, xml);
    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

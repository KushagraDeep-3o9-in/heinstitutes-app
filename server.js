require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3001;
const SITE_ORIGIN = process.env.SITE_ORIGIN || '';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // sitting behind nginx

app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false, // AdSense/GSC scripts need a hand-tuned CSP; leave open here, tune at nginx/CDN layer
  })
)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
// Served under /india-heinstitutes so it lands inside the path nginx
// actually proxies to this app - serving at the bare root (the old way)
// meant requests for /css/style.css never reached this process at all,
// since nginx's location block only matches /india-heinstitutes/*.
app.use('/india-heinstitutes', express.static(path.join(__dirname, 'public'), { maxAge: '7d', etag: true }));

// Basic abuse protection - generous limit since this serves real search traffic
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Locals available in every view
app.use((req, res, next) => {
  res.locals.SITE_ORIGIN = SITE_ORIGIN;
  res.locals.ADSENSE_CLIENT_ID = process.env.ADSENSE_CLIENT_ID || '';
  res.locals.ADSENSE_SLOT_ID = process.env.ADSENSE_SLOT_ID || '';
  res.locals.GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || '';
  res.locals.GSC_VERIFICATION = process.env.GSC_VERIFICATION || '';
  next();
});

// NOTE: nginx only proxies /india-heinstitutes/* to this app, so this route
// is only reachable when running the app standalone (e.g. local dev hitting
// port 3019 directly). In production, https://nearme.3o9.in/robots.txt is
// served by your LEGACY app - add the Sitemap line below to that app's
// robots.txt manually so crawlers find it from the domain-root file.
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/india-heinstitutes/sitemap.xml\n`
  );
});

app.use('/india-heinstitutes', require('./routes/sitemap'));
// Must come before routes/institutes.js - otherwise its /:state route
// would treat "programs"/"disciplines" as a state name and swallow this path.
app.use('/india-heinstitutes/programs', require('./routes/programs'));
app.use('/india-heinstitutes/disciplines', require('./routes/disciplines'));
app.use('/india-heinstitutes', require('./routes/institutes'));

app.get('/', (req, res) => res.redirect(301, '/india-heinstitutes'));

// 404
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Institute Not Found | AISHE Directory',
    canonicalUrl: `${SITE_ORIGIN}${req.originalUrl}`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong. Please try again.');
});

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] heinstitutes-app listening on :${PORT}`));
  })
  .catch((err) => {
    console.error('[server] failed to start:', err);
    process.exit(1);
  });

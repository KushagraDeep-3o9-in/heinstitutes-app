const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in the environment');
  }

  mongoose.set('strictQuery', true);

  const opts = {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 8000,
  };

  // Belt-and-suspenders: if MONGODB_URI has no /<dbname> path segment, the
  // driver falls back to whatever's after the credentials (often "admin",
  // which your user usually can't run queries against). MONGODB_DBNAME lets
  // you pin the target db explicitly without touching the URI.
  if (process.env.MONGODB_DBNAME) {
    opts.dbName = process.env.MONGODB_DBNAME;
  }

  await mongoose.connect(uri, opts);

  console.log('[db] connected to HE institutes cluster');

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });
}

module.exports = connectDB;

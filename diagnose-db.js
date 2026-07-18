require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGODB_URI;
  const opts = {};
  if (process.env.MONGODB_DBNAME) opts.dbName = process.env.MONGODB_DBNAME;

  await mongoose.connect(uri, opts);
  const dbName = mongoose.connection.db.databaseName;
  console.log('Connected to database:', dbName);

  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Collections in this database:');
  for (const c of collections) {
    const count = await mongoose.connection.db.collection(c.name).countDocuments();
    console.log(`  - ${c.name}: ${count} documents`);
  }

  process.exit(0);
})().catch((err) => {
  console.error('Diagnostic failed:', err.message);
  process.exit(1);
});

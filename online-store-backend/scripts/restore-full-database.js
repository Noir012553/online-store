const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const getArgument = name => {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
};

const getDatabaseName = uri => {
  const databaseName = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, '').split('/')[0] || '');
  if (!databaseName) throw new Error('MongoDB URI must include a database name in its path');
  return databaseName;
};

const run = async () => {
  const archivePath = getArgument('archive');
  const sourceDatabase = getArgument('source-db');
  const targetDatabase = getArgument('target-db');
  const confirmation = getArgument('confirm-empty-target');
  const dryRun = process.argv.includes('--dry-run');
  const apply = process.argv.includes('--apply');
  const sourceUri = process.env.MONGO_URI;

  if (!archivePath || !sourceDatabase || !targetDatabase || !confirmation) {
    throw new Error('Usage: npm run restore:full-database -- --archive=<file> --source-db=<db> --target-db=<new-test-db> --confirm-empty-target=<target-db> --dry-run|--apply');
  }
  if (dryRun === apply) {
    throw new Error('Choose exactly one: --dry-run to validate without writing, or --apply to restore');
  }
  if (!sourceUri) throw new Error('MONGO_URI is not configured in online-store-backend/.env');
  if (!/^[a-zA-Z0-9_-]+$/.test(sourceDatabase) || !/^[a-zA-Z0-9_-]+$/.test(targetDatabase)) {
    throw new Error('Database names may contain only letters, numbers, underscores, and hyphens');
  }
  if (getDatabaseName(sourceUri) !== sourceDatabase) {
    throw new Error('Database in MONGO_URI must match --source-db');
  }
  if (sourceDatabase === targetDatabase) throw new Error('Restore target must be a different database from the source');
  if (!targetDatabase.endsWith('_restore_test')) throw new Error('Target database name must end with _restore_test');
  if (confirmation !== targetDatabase) throw new Error('Confirmation must exactly match --target-db');

  const uri = sourceUri;

  const resolvedArchive = path.resolve(process.cwd(), archivePath);
  if (!fs.existsSync(resolvedArchive) || fs.statSync(resolvedArchive).size === 0) {
    throw new Error(`Backup archive is missing or empty: ${resolvedArchive}`);
  }
  let connected = false;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    connected = true;
    const targetDb = mongoose.connection.useDb(targetDatabase).db;
    const existingCollections = await targetDb.listCollections({}, { nameOnly: true }).toArray();
    if (existingCollections.length > 0) {
      throw new Error(`Target database is not empty (${existingCollections.length} collections found); restore stopped`);
    }
  } finally {
    if (connected) await mongoose.disconnect();
  }

  const configPath = path.join(os.tmpdir(), `mongorestore-${process.pid}-${Date.now()}.yaml`);
  fs.writeFileSync(configPath, `uri: ${JSON.stringify(uri)}\n`, { encoding: 'utf8', mode: 0o600 });

  try {
    const result = spawnSync(process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore', [
      '--config', configPath,
      `--archive=${resolvedArchive}`,
      '--gzip',
      `--nsFrom=${sourceDatabase}.*`,
      `--nsTo=${targetDatabase}.*`,
      ...(dryRun ? ['--dryRun', '--verbose'] : []),
    ], { stdio: 'inherit' });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`mongorestore failed with exit code ${result.status}`);
    console.log(dryRun
      ? `Dry-run completed; no data written to ${targetDatabase}`
      : `Restore completed into empty staging database: ${targetDatabase}`);
  } finally {
    fs.rmSync(configPath, { force: true });
  }
};

run().catch(error => {
  console.error(`[restore:full-database] ${error.message}`);
  process.exitCode = 1;
});

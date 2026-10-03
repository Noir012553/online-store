const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const archiver = require('archiver');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const getDatabaseName = uri => {
  const databaseName = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, '').split('/')[0] || '');
  if (!databaseName) {
    throw new Error('MONGO_URI must include a database name in its path');
  }
  return databaseName;
};

const getBackupModels = () => [
  require('../src/models/Product'),
  require('../src/models/ProductCatalogTranslationCache'),
  require('../src/models/LiveTranslationCache'),
  require('../src/models/TranslationQualityLog'),
  ...Object.values(require('../src/models/RetranslationProgress')),
];

const writeZip = (sourceDir, zipPath, rootName) => new Promise((resolve, reject) => {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 0 } });

  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  archive.directory(sourceDir, rootName);
  archive.finalize();
});

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not configured in online-store-backend/.env');

  const databaseName = getDatabaseName(uri);
  const collections = [...new Set(getBackupModels().map(model => model.collection.name))];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backendRoot = path.resolve(__dirname, '..');
  const backupDirectory = path.join(backendRoot, 'backups');
  const rawDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'online-store-backup-'));
  const rawDatabaseDirectory = path.join(rawDirectory, databaseName);
  const zipPath = path.join(backupDirectory, `online-store-backup-${timestamp}.zip`);
  const configPath = path.join(os.tmpdir(), `mongodump-${process.pid}-${Date.now()}.yaml`);
  let zipped = false;

  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.writeFileSync(configPath, `uri: ${JSON.stringify(uri)}\n`, { encoding: 'utf8', mode: 0o600 });

  try {
    for (const collection of collections) {
      console.log(`Dumping ${databaseName}.${collection}...`);
      const result = spawnSync(process.platform === 'win32' ? 'mongodump.exe' : 'mongodump', [
        '--config', configPath,
        '--db', databaseName,
        '--collection', collection,
        '--gzip',
        '--out', rawDirectory,
      ], { stdio: 'inherit' });

      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`mongodump failed for ${collection} with exit code ${result.status}`);
      }

      const dumpPath = path.join(rawDatabaseDirectory, `${collection}.bson.gz`);
      if (!fs.existsSync(dumpPath) || fs.statSync(dumpPath).size === 0) {
        throw new Error(`Dump output is missing or empty for ${collection}`);
      }
    }

    await writeZip(rawDatabaseDirectory, zipPath, databaseName);
    if (!fs.existsSync(zipPath) || fs.statSync(zipPath).size === 0) {
      throw new Error('ZIP output is missing or empty');
    }
    zipped = true;

    console.log(`Backup ZIP: ${zipPath}`);
    console.log(`Size: ${fs.statSync(zipPath).size} bytes`);
    console.log('Collections:');
    console.table(collections.map(collection => ({
      collection,
      bytes: fs.statSync(path.join(rawDatabaseDirectory, `${collection}.bson.gz`)).size,
    })));
  } finally {
    fs.rmSync(configPath, { force: true });
    if (zipped) {
      fs.rmSync(rawDirectory, { recursive: true, force: true });
    } else {
      fs.rmSync(zipPath, { force: true });
      console.error(`Incomplete dump files retained for diagnosis: ${rawDirectory}`);
    }
  }
};

run().catch(error => {
  console.error(`[backup:retranslation] ${error.message}`);
  process.exitCode = 1;
});

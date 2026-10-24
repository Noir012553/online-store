const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const getDatabaseName = uri => {
  const databaseName = decodeURIComponent(new URL(uri).pathname.replace(/^\/+/, '').split('/')[0] || '');
  if (!databaseName) throw new Error('MONGO_URI must include a database name in its path');
  return databaseName;
};

const run = () => {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not configured in online-store-backend/.env');

  const databaseName = getDatabaseName(uri);
  const backendRoot = path.resolve(__dirname, '..');
  const backupDirectory = path.join(backendRoot, 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivePath = path.join(backupDirectory, `${databaseName}-full-backup-${timestamp}.archive.gz`);
  const configPath = path.join(os.tmpdir(), `mongodump-full-${process.pid}-${Date.now()}.yaml`);
  let complete = false;

  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.writeFileSync(configPath, `uri: ${JSON.stringify(uri)}\n`, { encoding: 'utf8', mode: 0o600 });

  try {
    const result = spawnSync(process.platform === 'win32' ? 'mongodump.exe' : 'mongodump', [
      '--config', configPath,
      '--db', databaseName,
      `--archive=${archivePath}`,
      '--gzip',
    ], { stdio: 'inherit' });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`mongodump failed with exit code ${result.status}`);
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
      throw new Error('Full database archive is missing or empty');
    }

    complete = true;
    console.log(`Full database backup: ${archivePath}`);
    console.log(`Database: ${databaseName}`);
    console.log(`Size: ${fs.statSync(archivePath).size} bytes`);
  } finally {
    fs.rmSync(configPath, { force: true });
    if (!complete) fs.rmSync(archivePath, { force: true });
  }
};

try {
  run();
} catch (error) {
  console.error(`[backup:full-database] ${error.message}`);
  process.exitCode = 1;
}

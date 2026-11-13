'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') throw new Error('Heartbeat key provisioning is supported only by the Windows installer.');
const programData = process.env.ProgramData;
if (!programData || !path.win32.isAbsolute(programData) || programData.startsWith('\\\\')) {
  throw new Error('Windows ProgramData path is not valid.');
}
const root = path.win32.join(programData, 'LaptopStore');
const privateDirectory = path.win32.join(root, 'services', 'LaptopStoreSettingsApplyWorker');
const privatePath = path.win32.join(privateDirectory, 'heartbeat-private.pem');
const publicPath = path.win32.join(privateDirectory, 'settings-worker-heartbeat-public.pem');

const directoryStat = fs.lstatSync(privateDirectory);
if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Restricted worker service directory is invalid.');
if (fs.existsSync(privatePath) || fs.existsSync(publicPath)) throw new Error('Worker heartbeat keys already exist; refusing replacement.');
try {
  const pair = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(privatePath, pair.privateKey, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(publicPath, pair.publicKey, { flag: 'wx', mode: 0o600 });
} catch (error) {
  try { fs.unlinkSync(privatePath); } catch {}
  try { fs.unlinkSync(publicPath); } catch {}
  throw error;
}

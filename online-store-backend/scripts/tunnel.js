'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const config = path.join(backendRoot, '.cloudflared', isWindows ? 'config.windows.yml' : 'config.yaml');

const hasWindowsExecutableHeader = (filePath) => {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(2);
    return fs.readSync(descriptor, header, 0, header.length, 0) === 2
      && header.toString('ascii') === 'MZ';
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
};

const isGitLfsPointer = (filePath) => {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(64);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    return header.subarray(0, bytesRead).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1');
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
};

const resolveExecutable = () => {
  if (!isWindows) return 'cloudflared';

  const configuredPath = process.env.CLOUDFLARED_BIN?.trim();
  const searchDirectories = (process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .filter(Boolean);
  const candidates = [
    configuredPath && (path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(backendRoot, configuredPath)),
    path.join(backendRoot, 'cloudflared.exe'),
    path.join(os.homedir(), '.cloudflared', 'cloudflared.exe'),
    ...searchDirectories.map(directory => path.join(directory, 'cloudflared.exe')),
  ].filter(Boolean);
  const executable = candidates.find(hasWindowsExecutableHeader);
  if (executable) return executable;

  const bundledExecutable = path.join(backendRoot, 'cloudflared.exe');
  const bundledLfsPointer = isGitLfsPointer(bundledExecutable);
  const reason = bundledLfsPointer
    ? 'The bundled cloudflared.exe is a Git LFS pointer, not a Windows executable. '
    : '';
  throw new Error(
    `${reason}Install a valid cloudflared.exe, set CLOUDFLARED_BIN to its path, or add it to PATH.`,
  );
};

const startTunnel = () => {
  const executable = resolveExecutable();
  const tokenFile = process.env.CLOUDFLARED_TUNNEL_TOKEN_FILE?.trim()
    || (isWindows ? path.join(os.homedir(), '.cloudflared', 'online-store.token') : null);
  const tokenFromFile = tokenFile && fs.existsSync(tokenFile)
    ? fs.readFileSync(tokenFile, 'utf8').trim()
    : '';
  const token = process.env.CLOUDFLARED_TUNNEL_TOKEN?.trim() || tokenFromFile;

  if (isWindows && !token) {
    throw new Error(`Cloudflare tunnel token not found. Create ${tokenFile} or set CLOUDFLARED_TUNNEL_TOKEN`);
  }

  const args = token
    ? ['tunnel', 'run', '--token', token]
    : ['tunnel', '--protocol', 'auto', '--ha-connections', '2', '--config', config, 'run'];

  if (!token && !fs.existsSync(config)) {
    throw new Error(`Cloudflare tunnel config not found: ${config}`);
  }

  const childEnv = { ...process.env };
  delete childEnv.CLOUDFLARED_TUNNEL_TOKEN;

  const child = spawn(executable, args, {
    cwd: backendRoot,
    env: childEnv,
    stdio: 'inherit',
  });

  child.on('error', error => {
    console.error(`Unable to start cloudflared: ${error.message}`);
    process.exitCode = 1;
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 1;
  });
};

if (require.main === module) {
  try {
    startTunnel();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { hasWindowsExecutableHeader, isGitLfsPointer, resolveExecutable, startTunnel };

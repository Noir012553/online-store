'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const runnerServiceId = 'LaptopStoreDeploymentRunner';
const runnerServiceAccount = `NT SERVICE\\${runnerServiceId}`;
const runnerIdPattern = /^[A-Za-z0-9._-]{1,128}$/;
const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--install') options.install = true;
  else if (['--winsw', '--sha256', '--router-url', '--runner-id'].includes(arg)) {
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${arg}.`);
    options[arg.slice(2)] = args[++index];
  } else {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

const run = (command, commandArgs, settings = {}) => execFileSync(command, commandArgs, {
  encoding: 'utf8', windowsHide: true, ...settings,
});

const runPowerShell = (script, settings = {}) => run('powershell.exe', [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
], settings);

const escapeXml = value => String(value).replace(/[<>&'\"]/g, character => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
})[character]);

const promptAndProtectSecret = (prompt, minLength, maxLength) => {
  const encodedPrompt = Buffer.from(prompt, 'utf8').toString('base64');
  const script = `
Add-Type -AssemblyName System.Security
$prompt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPrompt}'))
$secure = Read-Host -Prompt $prompt -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$plain = $null
$bytes = $null
$protected = $null
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plain.Length -lt ${minLength} -or $plain.Length -gt ${maxLength}) { throw 'Secret length is invalid.' }
  $bytes = [Text.Encoding]::UTF8.GetBytes($plain)
  $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  [Console]::Out.Write([Convert]::ToBase64String($protected))
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
  if ($protected) { [Array]::Clear($protected, 0, $protected.Length) }
  if ($secure) { $secure.Dispose() }
  $plain = $null
}
`;
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script,
  ], { encoding: 'utf8', windowsHide: false, stdio: ['inherit', 'pipe', 'inherit'] });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Secret input was cancelled or invalid; no installation changes were made.');
  const protectedSecret = Buffer.from(result.stdout.trim(), 'base64');
  if (!protectedSecret.length) throw new Error('Windows DPAPI returned an empty protected secret.');
  return protectedSecret;
};

const invokeIcacls = args => {
  const result = spawnSync('icacls.exe', args, { encoding: 'utf8', windowsHide: true, stdio: 'ignore' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`icacls failed (${result.status}): ${args.join(' ')}`);
};

const serviceExists = serviceId => {
  const result = spawnSync('sc.exe', ['query', serviceId], { windowsHide: true, stdio: 'ignore' });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  if (result.status === 1060 || result.status === 1) return false;
  throw new Error(`Could not determine whether service ${serviceId} exists.`);
};

const setRestrictedDirectoryAcl = directory => invokeIcacls([
  directory, '/inheritance:r', '/grant:r', '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F',
]);

const setServiceRunnerRights = (serviceId, account) => {
  const encodedAccount = Buffer.from(account, 'utf8').toString('base64');
  const script = [
    'Add-Type -AssemblyName System.Security',
    `$account = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedAccount}'))`,
    '$sid = ([Security.Principal.NTAccount]$account).Translate([Security.Principal.SecurityIdentifier])',
    `$serviceId = '${serviceId}'`,
    '$output = & sc.exe sdshow $serviceId',
    'if ($LASTEXITCODE -ne 0) { throw "Could not read service permissions: $serviceId" }',
    '$sddl = @($output | ForEach-Object { $_.Trim() } | Where-Object { $_ -match "^(O:|G:|D:|S:)" } | Select-Object -Last 1)[0]',
    'if (-not $sddl) { throw "Could not parse service permissions: $serviceId" }',
    '$descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($sddl)',
    'if (-not $descriptor.DiscretionaryAcl) { throw "Refusing to modify a null DACL: $serviceId" }',
    '$ace = [Security.AccessControl.CommonAce]::new([Security.AccessControl.AceFlags]::None, [Security.AccessControl.AceQualifier]::AccessAllowed, 0x35, $sid, $false, $null)',
    '$descriptor.DiscretionaryAcl.InsertAce($descriptor.DiscretionaryAcl.Count, $ace)',
    '$updated = $descriptor.GetSddlForm([Security.AccessControl.AccessControlSections]::All)',
    '& sc.exe sdset $serviceId $updated | Out-Null',
    'if ($LASTEXITCODE -ne 0) { throw "Could not set service permissions: $serviceId" }',
  ].join('; ');
  runPowerShell(script);
};

const parseWinSWPath = value => {
  if (!value) throw new Error('Pass --winsw <path-to-WinSW.exe>.');
  const source = path.resolve(value);
  if (!fs.statSync(source).isFile()) throw new Error('WinSW path must point to a file.');
  return source;
};

const runInstaller = async () => {
  if (process.platform !== 'win32') throw new Error('Run this installer on the Windows host.');
  const backendRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(backendRoot, '..');
  const frontendRoot = path.join(projectRoot, 'online-store-frontend');
  const programDataRoot = path.join(process.env.ProgramData || 'C:\\ProgramData', 'LaptopStore');
  const serviceRoot = path.join(programDataRoot, 'services');
  const logRoot = path.join(programDataRoot, 'logs');
  const secretRoot = path.join(programDataRoot, 'secrets');
  const tunnelSecretRoot = path.join(secretRoot, 'tunnel');
  const runnerSecretRoot = path.join(secretRoot, 'runner');
  const tunnelTokenPath = path.join(tunnelSecretRoot, 'tunnel-token.dpapi');
  const runnerTokenPath = path.join(runnerSecretRoot, 'runner-token.dpapi');
  const runnerId = options['runner-id'] || 'laptop-store-windows-01';
  if (!runnerIdPattern.test(runnerId)) throw new Error('Runner ID is invalid.');

  let routerOrigin;
  if (options.install) {
    let routerUrl;
    try { routerUrl = new URL(options['router-url']); } catch { throw new Error('Pass --router-url <Worker-HTTPS-origin> when installing.'); }
    if (routerUrl.protocol !== 'https:' || routerUrl.username || routerUrl.password || routerUrl.pathname !== '/' || routerUrl.search || routerUrl.hash) {
      throw new Error('Router URL must be an HTTPS origin.');
    }
    routerOrigin = routerUrl.origin;
  }

  const winswSource = parseWinSWPath(options.winsw);
  const hashLines = run('certutil.exe', ['-hashfile', winswSource, 'SHA256']).split(/\r?\n/);
  const winswHash = hashLines.find(line => /^[\da-f\s]{64,}$/i.test(line))?.replace(/\s/g, '').toUpperCase();
  if (!winswHash) throw new Error('Could not read the WinSW SHA-256 checksum.');
  if (options.sha256 && winswHash !== options.sha256.toUpperCase()) throw new Error('WinSW SHA-256 checksum does not match.');
  if (options.install && !options.sha256) throw new Error('Pass --sha256 with the verified WinSW release checksum before installation.');

  const nodePath = process.execPath;
  const cloudflaredSource = run('where.exe', ['cloudflared.exe']).split(/\r?\n/).find(Boolean);
  if (!cloudflaredSource) throw new Error('cloudflared.exe was not found on PATH.');
  if (!fs.existsSync(path.join(backendRoot, 'node_modules', 'express'))) throw new Error('Backend dependencies are not installed.');
  if (!fs.existsSync(path.join(frontendRoot, '.next', 'BUILD_ID'))) throw new Error('Frontend production build is missing.');
  if (!fs.existsSync(path.join(backendRoot, '.env'))) throw new Error('Backend .env is missing; service configuration needs review.');
  if (fs.existsSync(programDataRoot)) throw new Error(`Refusing to modify existing service data directory: ${programDataRoot}`);
  const frontendEnvFiles = fs.readdirSync(frontendRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && (entry.name === '.env' || entry.name.startsWith('.env.')));
  if (frontendEnvFiles.length) throw new Error('Frontend root contains .env files; remove or relocate them before granting the frontend service access.');

  const services = [
    { id: 'LaptopStoreBackend', name: 'Laptop Store Backend', executable: nodePath, arguments: '--max-old-space-size=1024 src/app.js', workingDirectory: backendRoot, logPath: path.join(logRoot, 'backend'), readPath: backendRoot, writePaths: ['uploads', '.retranslate-progress', 'reports'].map(name => path.join(backendRoot, name)) },
    { id: 'LaptopStoreFrontend', name: 'Laptop Store Frontend', executable: nodePath, arguments: 'node_modules/next/dist/bin/next start', workingDirectory: frontendRoot, logPath: path.join(logRoot, 'frontend'), readPath: frontendRoot, writePaths: [path.join(frontendRoot, '.next', 'cache')] },
    { id: 'LaptopStoreTunnel', name: 'Laptop Store Cloudflare Tunnel', executable: nodePath, arguments: 'tunnel.js', workingDirectory: path.join(serviceRoot, 'LaptopStoreTunnel'), logPath: path.join(logRoot, 'tunnel'), readPath: path.join(serviceRoot, 'LaptopStoreTunnel'), writePaths: [], tunnel: true },
    { id: runnerServiceId, name: 'Laptop Store Deployment Runner', executable: nodePath, arguments: 'deployment-runner.js', workingDirectory: path.join(serviceRoot, runnerServiceId), logPath: path.join(logRoot, 'runner'), readPath: path.join(serviceRoot, runnerServiceId), writePaths: [], runner: true },
  ];

  for (const service of services) {
    try {
      run('sc.exe', ['query', service.id], { stdio: 'ignore' });
      throw new Error(`Service ${service.id} already exists; refusing to replace it.`);
    } catch (error) {
      if (error.message.startsWith('Service ')) throw error;
      if (error.status !== 1060 && error.status !== 1) throw error;
    }
  }

  const netstat = run('netstat.exe', ['-ano', '-p', 'tcp']);
  const listeners = netstat.split(/\r?\n/).map(line => {
    const match = line.match(/^\s*TCP\s+(\S+):(3000|5000)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    return match && { address: match[1], port: Number(match[2]), pid: Number(match[3]) };
  }).filter(Boolean);

  console.log('Preflight passed; no files, services, or running processes have been changed.');
  console.log(`Backend: ${backendRoot}\nFrontend: ${frontendRoot}\nNode: ${nodePath}\ncloudflared: ${cloudflaredSource}`);
  console.log(`WinSW SHA-256: ${winswHash}\nTunnel DPAPI token path: ${tunnelTokenPath}`);
  console.log('Existing .env and Tunnel token contents were not read or printed.');
  if (listeners.length) console.log('Ports 3000/5000 are occupied; existing listeners will not be stopped.', listeners);
  if (!options.install) {
    console.log('Dry run only. Add --install during an approved maintenance window.');
    return;
  }

  try {
    run('net.exe', ['session'], { stdio: 'ignore' });
  } catch {
    throw new Error('Run with Administrator privileges to install services.');
  }

  const protectedTunnelToken = promptAndProtectSecret('Paste the Cloudflare Tunnel token', 1, 8192);
  let protectedRunnerToken;
  try {
    protectedRunnerToken = promptAndProtectSecret('Paste the existing DEPLOYMENT_RUNNER_TOKEN', 16, 2048);
  } catch (error) {
    protectedTunnelToken.fill(0);
    throw error;
  }

  const aclBackupDirectory = path.join(os.tmpdir(), `LaptopStoreAcl-${require('node:crypto').randomUUID().replace(/-/g, '')}`);
  const backendAclBackup = path.join(aclBackupDirectory, 'backend.acl');
  const frontendAclBackup = path.join(aclBackupDirectory, 'frontend.acl');
  const createdServices = [];
  const serviceSecurityBackups = new Map();
  let createdProgramData = false;

  try {
    fs.mkdirSync(aclBackupDirectory, { recursive: true });
    invokeIcacls([backendRoot, '/save', backendAclBackup, '/T', '/C']);
    invokeIcacls([frontendRoot, '/save', frontendAclBackup, '/T', '/C']);
    fs.mkdirSync(programDataRoot, { recursive: true });
    createdProgramData = true;
    for (const directory of [serviceRoot, logRoot, secretRoot, tunnelSecretRoot, runnerSecretRoot]) fs.mkdirSync(directory, { recursive: true });
    for (const directory of [programDataRoot, serviceRoot, logRoot, secretRoot, tunnelSecretRoot, runnerSecretRoot]) setRestrictedDirectoryAcl(directory);
    fs.writeFileSync(tunnelTokenPath, protectedTunnelToken);
    invokeIcacls([tunnelTokenPath, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F']);
    fs.writeFileSync(runnerTokenPath, protectedRunnerToken);

    const envFiles = fs.readdirSync(backendRoot, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.startsWith('.env'))
      .map(entry => path.join(backendRoot, entry.name));
    const operatorAccount = run('whoami.exe', []).trim();

    for (const service of services) {
      const directory = path.join(serviceRoot, service.id);
      fs.mkdirSync(directory, { recursive: true });
      fs.mkdirSync(service.logPath, { recursive: true });
      const exePath = path.join(directory, `${service.id}.exe`);
      const xmlPath = path.join(directory, `${service.id}.xml`);
      fs.copyFileSync(winswSource, exePath);
      let serviceEnvironment = '';

      if (service.runner) {
        fs.copyFileSync(path.join(__dirname, 'deployment-runner.js'), path.join(directory, 'deployment-runner.js'));
        fs.copyFileSync(path.join(__dirname, 'deployment-windows.js'), path.join(directory, 'deployment-windows.js'));
        serviceEnvironment = [
          `  <env name="DEPLOYMENT_ROUTER_URL" value="${escapeXml(routerOrigin)}" />`,
          `  <env name="DEPLOYMENT_RUNNER_ID" value="${escapeXml(runnerId)}" />`,
          `  <env name="DEPLOYMENT_RUNNER_TOKEN_DPAPI_FILE" value="${escapeXml(runnerTokenPath)}" />`,
        ].join('\n');
      }
      if (service.tunnel) {
        fs.copyFileSync(path.join(__dirname, 'tunnel.js'), path.join(directory, 'tunnel.js'));
        fs.copyFileSync(path.join(__dirname, 'deployment-windows.js'), path.join(directory, 'deployment-windows.js'));
        const cloudflaredServicePath = path.join(directory, 'cloudflared.exe');
        fs.copyFileSync(cloudflaredSource, cloudflaredServicePath);
        serviceEnvironment = [
          `  <env name="CLOUDFLARED_BIN" value="${escapeXml(cloudflaredServicePath)}" />`,
          `  <env name="LAPTOP_STORE_BACKEND_ROOT" value="${escapeXml(backendRoot)}" />`,
          `  <env name="CLOUDFLARED_TUNNEL_TOKEN_DPAPI_FILE" value="${escapeXml(tunnelTokenPath)}" />`,
        ].join('\n');
      }
      if (service.id === 'LaptopStoreBackend') serviceEnvironment = `  <env name="PORT" value="5000" />\n${serviceEnvironment}`;

      const xml = `<service>\n  <id>${service.id}</id>\n  <name>${escapeXml(service.name)}</name>\n  <description>Managed by WinSW.</description>\n  <executable>${escapeXml(service.executable)}</executable>\n  <arguments>${escapeXml(service.arguments)}</arguments>\n  <workingdirectory>${escapeXml(service.workingDirectory)}</workingdirectory>\n  <startmode>Manual</startmode>\n  <logpath>${escapeXml(service.logPath)}</logpath>\n  <log mode="roll" />\n${serviceEnvironment}\n</service>\n`;
      fs.writeFileSync(xmlPath, xml, 'utf8');
      setRestrictedDirectoryAcl(directory);
      setRestrictedDirectoryAcl(service.logPath);
      createdServices.push({ id: service.id, exePath, xmlPath });
      run(exePath, ['install', xmlPath], { stdio: 'ignore' });
      run('sc.exe', ['config', service.id, 'obj=', `NT SERVICE\\${service.id}`, 'password=', ''], { stdio: 'ignore' });
      run('sc.exe', ['config', service.id, 'start=', 'demand'], { stdio: 'ignore' });
      run('sc.exe', ['sidtype', service.id, 'unrestricted'], { stdio: 'ignore' });

      const account = `NT SERVICE\\${service.id}`;
      for (const [aclPath, grant] of [
        [programDataRoot, '(RX)'], [serviceRoot, '(RX)'], [logRoot, '(RX)'],
        [directory, '(OI)(CI)RX'], [service.logPath, '(OI)(CI)M'], [exePath, 'RX'], [xmlPath, 'R'],
      ]) invokeIcacls([aclPath, '/grant', `${account}:${grant}`]);
      invokeIcacls([service.readPath, '/grant', `${account}:(OI)(CI)RX`, '/T', '/C']);
      for (const writePath of service.writePaths) {
        fs.mkdirSync(writePath, { recursive: true });
        invokeIcacls([writePath, '/grant', `${account}:(OI)(CI)M`, '/T', '/C']);
      }
      if (service.tunnel) {
        invokeIcacls([secretRoot, '/grant', `${account}:(RX)`]);
        invokeIcacls([tunnelSecretRoot, '/grant', `${account}:(OI)(CI)RX`]);
        invokeIcacls([tunnelTokenPath, '/grant', `${account}:R`]);
      }
      if (service.runner) {
        invokeIcacls([secretRoot, '/grant', `${account}:(RX)`]);
        invokeIcacls([runnerSecretRoot, '/grant', `${account}:(OI)(CI)RX`]);
        invokeIcacls([runnerTokenPath, '/grant', `${account}:R`]);
      }
      if (service.id === 'LaptopStoreBackend') {
        for (const envFile of envFiles) {
          invokeIcacls([envFile, '/inheritance:r', '/grant:r', '*S-1-5-18:F', '*S-1-5-32-544:F', `${operatorAccount}:R`, `${account}:R`]);
        }
      }
    }

    const runnerSid = runPowerShell("([Security.Principal.NTAccount]'NT SERVICE\\LaptopStoreDeploymentRunner').Translate([Security.Principal.SecurityIdentifier]).Value").trim();
    for (const serviceId of ['LaptopStoreBackend', 'LaptopStoreFrontend']) {
      const originalSddl = run('sc.exe', ['sdshow', serviceId]).split(/\r?\n/).map(line => line.trim()).filter(line => /^(O:|G:|D:|S:)/.test(line)).at(-1);
      if (!originalSddl) throw new Error(`Could not read service permissions: ${serviceId}`);
      serviceSecurityBackups.set(serviceId, originalSddl);
      setServiceRunnerRights(serviceId, 'NT SERVICE\\LaptopStoreDeploymentRunner');
      if (!runnerSid) throw new Error('Could not resolve the runner service SID.');
    }
  } catch (error) {
    const rollbackFailures = [];
    const aclRestoreFailures = [];
    for (const service of createdServices.reverse()) {
      try {
        run(service.exePath, ['uninstall', service.xmlPath], { stdio: 'ignore' });
        try { run('sc.exe', ['query', service.id], { stdio: 'ignore' }); throw new Error(`WinSW service ${service.id} remains installed.`); } catch (queryError) {
          if (queryError.message.includes('remains installed')) throw queryError;
          if (queryError.status !== 1060 && queryError.status !== 1) throw queryError;
        }
      } catch {
        rollbackFailures.push(service.id);
        console.warn(`Could not remove ${service.id}; preserving its files and ACLs for manual recovery.`);
      }
    }
    for (const [serviceId, sddl] of serviceSecurityBackups) {
      try {
        if (serviceExists(serviceId)) run('sc.exe', ['sdset', serviceId, sddl], { stdio: 'ignore' });
      } catch {
        aclRestoreFailures.push(serviceId);
        console.warn(`Could not restore the original service permissions for ${serviceId}.`);
      }
    }
    if (!rollbackFailures.length && !aclRestoreFailures.length) {
      if (fs.existsSync(backendAclBackup)) spawnSync('icacls.exe', [backendRoot, '/restore', backendAclBackup, '/C'], { stdio: 'ignore' });
      if (fs.existsSync(frontendAclBackup)) spawnSync('icacls.exe', [frontendRoot, '/restore', frontendAclBackup, '/C'], { stdio: 'ignore' });
      if (createdProgramData && fs.existsSync(programDataRoot)) fs.rmSync(programDataRoot, { recursive: true, force: true });
    } else {
      console.warn(`Manual recovery required for: ${[...rollbackFailures, ...aclRestoreFailures].join(', ')}. Service files and current ACLs were preserved.`);
    }
    throw error;
  } finally {
    protectedTunnelToken.fill(0);
    protectedRunnerToken.fill(0);
  }

  console.log('Four WinSW services are installed with Manual startup and remain stopped; current listeners on ports 3000/5000 were not stopped.');
  console.log('After migrating existing app processes, start the app/Tunnel services and verify health before starting the runner service.');
  console.log(`ACL backups are retained at: ${aclBackupDirectory}`);
  console.log('After reviewing service status and ACLs, schedule a separate maintenance-window cutover to stop old consoles and start the services.');
  console.log('No .env content or Tunnel token was printed.');
};

runInstaller().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

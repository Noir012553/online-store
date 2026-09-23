#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');

const runStep = (label, script, args = []) => {
  console.log(`\n🚀 ${label}`);
  console.log('='.repeat(label.length + 4));

  const result = spawnSync(
    process.execPath,
    [path.join(backendRoot, script), ...args],
    {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

runStep('RUNNING TRANSLATION SEEDER...', 'src/seeds/index.js', ['--i18n-only']);
runStep('RUNNING I18N DIAGNOSTIC...', 'src/scripts/diagnose-i18n.js');

console.log('\n✨ All done! Check footer in browser now.');

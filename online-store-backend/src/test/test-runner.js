#!/usr/bin/env node

/**
 * Unified Test Runner
 * 
 * Cách dùng:
 * npm run test                               # Run all tests
 * npm run test -- --list                     # List all test suites  
 * npm run test -- --suite=i18n               # Run only i18n tests
 * npm run test -- --suites=i18n,products     # Run i18n + products tests
 * npm run test -- --tags=payments            # Run tests tagged with "payments"
 * npm run test -- --verbose                  # Verbose output
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { 
  TEST_SUITES, 
  listSuites, 
  resolveTestFiles, 
  filterByTags 
} = require('./testRegistry');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  
  return {
    list: args.includes('--list'),
    suite: args.find(a => a.startsWith('--suite='))?.replace('--suite=', ''),
    suites: args.find(a => a.startsWith('--suites='))?.replace('--suites=', '')?.split(',').map(s => s.trim()),
    tags: args.find(a => a.startsWith('--tags='))?.replace('--tags=', '')?.split(',').map(t => t.trim()),
    skip: args.find(a => a.startsWith('--skip='))?.replace('--skip=', '')?.split(',').map(s => s.trim()),
    verbose: args.includes('--verbose'),
    seed: args.includes('--seed'),
    seedOnly: args.find(a => a.startsWith('--seed='))?.replace('--seed=', ''),
  };
}

/**
 * Run seeder before tests (optional)
 */
async function runSeeder(seedMode) {
  return new Promise((resolve, reject) => {
    console.log(`\n🌱 Seeding database (mode: ${seedMode || 'all'})...\n`);

    const args = seedMode ? [`--${seedMode}`] : [];
    const seedPath = path.resolve(__dirname, '../seeds/index.js');
    const seeder = spawn('node', [seedPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    seeder.on('close', code => {
      if (code === 0) {
        console.log('\n✅ Seeding completed!\n');
        resolve();
      } else {
        console.error('\n❌ Seeding failed!\n');
        reject(new Error('Seed failed'));
      }
    });
  });
}

/**
 * Run a single test file
 */
function runTestFile(filePath) {
  return new Promise((resolve, reject) => {
    console.log(`▶️  ${path.basename(filePath)}`);

    const isMochaTest = fs.readFileSync(filePath, 'utf8').includes('describe(');
    const command = isMochaTest ? 'npx' : 'node';
    const args = isMochaTest ? ['mocha', filePath] : [filePath];
    const test = spawn(command, args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    test.on('close', code => {
      if (code === 0) {
        console.log(`✅ ${path.basename(filePath)}\n`);
        resolve();
      } else {
        console.error(`❌ ${path.basename(filePath)} failed\n`);
        reject(new Error(`Test failed: ${filePath}`));
      }
    });
  });
}

/**
 * Main runner
 */
async function main() {
  const cliArgs = parseArgs();

  // Handle --list
  if (cliArgs.list) {
    listSuites();
    process.exit(0);
  }

  console.log('\n🧪 Unified Test Runner\n');

  // Resolve which suites to run
  let suitesToRun = [];

  if (cliArgs.suite) {
    suitesToRun = [cliArgs.suite];
    console.log(`📦 Running suite: ${cliArgs.suite}\n`);
  } else if (cliArgs.suites) {
    suitesToRun = cliArgs.suites;
    console.log(`📦 Running suites: ${suitesToRun.join(', ')}\n`);
  } else if (cliArgs.tags) {
    suitesToRun = filterByTags(cliArgs.tags);
    console.log(`🏷️  Running suites with tags [${cliArgs.tags.join(', ')}]: ${suitesToRun.join(', ')}\n`);
  } else {
    suitesToRun = Object.keys(TEST_SUITES);
    console.log(`📦 Running ALL test suites\n`);
  }

  // Filter out skipped suites
  if (cliArgs.skip) {
    suitesToRun = suitesToRun.filter(s => !cliArgs.skip.includes(s));
    console.log(`⏭️  Skipped: ${cliArgs.skip.join(', ')}\n`);
  }

  const unknownSuites = suitesToRun.filter(suite => !TEST_SUITES[suite]);
  if (unknownSuites.length > 0) {
    console.error(`❌ Unknown test suite(s): ${unknownSuites.join(', ')}`);
    process.exit(1);
  }

  // Show which tests will run
  console.log('📋 Tests to run:\n');
  suitesToRun.forEach(suite => {
    const s = TEST_SUITES[suite];
    console.log(`  - ${suite}: ${s.name}`);
    s.files.forEach(file => {
      console.log(`    └─ ${path.basename(file)}`);
    });
  });
  console.log();

  try {
    // Run seeder if requested
    if (cliArgs.seed) {
      await runSeeder(cliArgs.seedOnly);
    }

    // Resolve test files
    const testFiles = resolveTestFiles(suitesToRun);

    if (testFiles.length === 0) {
      console.warn('⚠️ No test files found');
      process.exit(1);
    }

    console.log(`\n🧪 Running ${testFiles.length} test file(s)...\n`);

    // Run tests sequentially
    let failedTests = [];
    for (const testFile of testFiles) {
      try {
        await runTestFile(testFile);
      } catch (error) {
        failedTests.push(testFile);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    if (failedTests.length === 0) {
      console.log('✅ All tests passed!\n');
      process.exit(0);
    } else {
      console.log(`❌ ${failedTests.length} test file(s) failed:\n`);
      failedTests.forEach(file => {
        console.log(`  - ${path.basename(file)}`);
      });
      console.log();
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test runner error:', error.message);
    process.exit(1);
  }
}

main();

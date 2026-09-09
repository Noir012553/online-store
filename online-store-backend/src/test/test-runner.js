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
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const {
  TEST_SUITES,
  listSuites,
  resolveTestFiles,
  filterByTags,
  getSuiteFiles,
} = require('./test-registry');
const { getRunnerForFile } = require('./test-config');

const TEST_ERROR_REPORT = path.resolve(__dirname, '../../reports/test/npm-test-errors.json');

function stripAnsi(value) {
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');
}

function extractFailureBlocks(output) {
  const lines = stripAnsi(output).split(/\r?\n/);
  const mochaBlocks = [];
  let currentMochaBlock = [];

  const flushMochaBlock = () => {
    const block = currentMochaBlock.join('\n').trim();
    if (block) mochaBlocks.push(block);
    currentMochaBlock = [];
  };

  lines.forEach(line => {
    if (/^\s*\d+\)\s/.test(line)) {
      flushMochaBlock();
      currentMochaBlock = [line];
    } else if (currentMochaBlock.length > 0 && /^\s*\d+\s+(passing|failing)/i.test(line)) {
      flushMochaBlock();
    } else if (currentMochaBlock.length > 0) {
      currentMochaBlock.push(line);
    }
  });
  flushMochaBlock();
  if (mochaBlocks.length > 0) {
    const failurePattern = /AssertionError|Error|Exception|TypeError|ReferenceError|SyntaxError|RangeError|expected .* to|actual .*|\b(?:invalid scheme|not configured|econnrefused|enoent)\b|❌|\bfailed\s*$/i;
    return mochaBlocks.filter(block => failurePattern.test(block));
  }

  const errorStart = /(?:AssertionError|Error|Exception|TypeError|ReferenceError|SyntaxError|RangeError):|\b(?:invalid scheme|not configured|econnrefused|enoent)\b|❌|\bfailed\s*$/i;
  const continuation = /^\s*(?:at\s|[+-]\s|expected\b|actual\b)/i;
  const fallbackBlocks = [];
  let currentBlock = [];

  const flushFallbackBlock = () => {
    const block = currentBlock.join('\n').trim();
    if (block) fallbackBlocks.push(block);
    currentBlock = [];
  };

  lines.forEach(line => {
    if (errorStart.test(line)) {
      flushFallbackBlock();
      currentBlock = [line];
    } else if (currentBlock.length > 0 && continuation.test(line)) {
      currentBlock.push(line);
    } else if (currentBlock.length > 0 && line.trim() === '') {
      flushFallbackBlock();
    } else if (currentBlock.length > 0) {
      flushFallbackBlock();
    }
  });
  flushFallbackBlock();

  return fallbackBlocks;
}

function redactSensitive(value) {
  return value.replace(
    /(password|secret|token|api[_-]?key|authorization)(\s*[:=]\s*)([^\s,;]+)/gi,
    '$1$2[REDACTED]'
  );
}

function errorSignature(errorText) {
  const firstErrorLine = errorText.split('\n').find(line => line.trim()) || errorText;
  return firstErrorLine.replace(/\s+/g, ' ').trim();
}

function addFailureToReport(errorMap, filePath, output) {
  const blocks = extractFailureBlocks(output);
  const details = blocks.length > 0 ? blocks : [`Test failed: ${path.basename(filePath)}`];

  details.forEach(rawMessage => {
    const message = redactSensitive(rawMessage);
    const signature = errorSignature(message);
    const existing = errorMap.get(signature);
    if (existing) {
      if (!existing.files.includes(path.basename(filePath))) existing.files.push(path.basename(filePath));
      return;
    }
    errorMap.set(signature, {
      message,
      files: [path.basename(filePath)],
    });
  });
}

function writeErrorReport(failedTests, errorMap) {
  fs.mkdirSync(path.dirname(TEST_ERROR_REPORT), { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    failedFiles: failedTests.map(file => path.basename(file)),
    errors: [...errorMap.values()],
  };
  fs.writeFileSync(TEST_ERROR_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`${CLI_SYMBOLS.report} Error report saved to ${TEST_ERROR_REPORT}`);
}

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
    console.log(`\n${CLI_SYMBOLS.seed} Seeding database (mode: ${seedMode || 'all'})...\n`);

    const args = seedMode ? [`--${seedMode}`] : [];
    const seedPath = path.resolve(__dirname, '../seeds/index.js');
    const seeder = spawn('node', [seedPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    seeder.on('close', code => {
      if (code === 0) {
        console.log(`\n${CLI_SYMBOLS.success} Seeding completed!\n`);
        resolve();
      } else {
        console.error(`\n${CLI_SYMBOLS.error} Seeding failed!\n`);
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
    console.log(`${CLI_SYMBOLS.run}  ${path.basename(filePath)}`);

    const command = process.execPath;
    const args = getRunnerForFile(filePath) === 'mocha'
      ? [require.resolve('mocha/bin/_mocha'), filePath]
      : [filePath];
    const test = spawn(command, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    let output = '';

    test.stdout.on('data', chunk => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    test.stderr.on('data', chunk => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });

    test.on('error', error => {
      error.testOutput = output;
      reject(error);
    });

    test.on('close', code => {
      if (code === 0) {
        console.log(`${CLI_SYMBOLS.success} ${path.basename(filePath)}\n`);
        resolve();
      } else {
        console.error(`${CLI_SYMBOLS.error} ${path.basename(filePath)} failed\n`);
        const error = new Error(`Test failed: ${filePath}`);
        error.testOutput = output;
        reject(error);
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

  console.log(`\n${CLI_SYMBOLS.test} Unified Test Runner\n`);

  // Resolve which suites to run
  let suitesToRun = [];

  if (cliArgs.suite) {
    suitesToRun = [cliArgs.suite];
    console.log(`${CLI_SYMBOLS.package} Running suite: ${cliArgs.suite}\n`);
  } else if (cliArgs.suites) {
    suitesToRun = cliArgs.suites;
    console.log(`${CLI_SYMBOLS.package} Running suites: ${suitesToRun.join(', ')}\n`);
  } else if (cliArgs.tags) {
    suitesToRun = filterByTags(cliArgs.tags);
    console.log(`${CLI_SYMBOLS.tag}  Running suites with tags [${cliArgs.tags.join(', ')}]: ${suitesToRun.join(', ')}\n`);
  } else {
    suitesToRun = ['all'];
    console.log(`${CLI_SYMBOLS.package} Running all discovered test modules\n`);
  }

  // Filter out skipped suites
  if (cliArgs.skip) {
    suitesToRun = suitesToRun.filter(s => !cliArgs.skip.includes(s));
    console.log(`${CLI_SYMBOLS.skip}  Skipped: ${cliArgs.skip.join(', ')}\n`);
  }

  const unknownSuites = suitesToRun.filter(suite => !TEST_SUITES[suite]);
  if (unknownSuites.length > 0) {
    console.error(`${CLI_SYMBOLS.error} Unknown test suite(s): ${unknownSuites.join(', ')}`);
    process.exit(1);
  }

  // Show which tests will run
  console.log(`${CLI_SYMBOLS.list} Tests to run:\n`);
  suitesToRun.forEach(suite => {
    const s = TEST_SUITES[suite];
    console.log(`  - ${suite}: ${s.name}`);
    getSuiteFiles(suite).forEach(file => {
      console.log(`    ${CLI_SYMBOLS.lastBranch} ${path.basename(file)}`);
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
      console.warn(`${CLI_SYMBOLS.warning} No test files found`);
      process.exit(1);
    }

    console.log(`\n${CLI_SYMBOLS.test} Running ${testFiles.length} test file(s)...\n`);

    // Run tests sequentially
    const failedTests = [];
    const errorMap = new Map();
    for (const testFile of testFiles) {
      try {
        await runTestFile(testFile);
      } catch (error) {
        failedTests.push(testFile);
        addFailureToReport(errorMap, testFile, error.testOutput || error.message);
      }
    }
    writeErrorReport(failedTests, errorMap);

    // Summary
    console.log('\n' + '='.repeat(60));
    if (failedTests.length === 0) {
      console.log(`${CLI_SYMBOLS.success} All tests passed!\n`);
      process.exit(0);
    } else {
      console.log(`${CLI_SYMBOLS.error} ${failedTests.length} test file(s) failed:\n`);
      failedTests.forEach(file => {
        console.log(`  - ${path.basename(file)}`);
      });
      console.log();
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Test runner error:`, error.message);
    process.exit(1);
  }
}

main();

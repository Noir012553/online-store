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
const util = require('util');
const { CLI_SYMBOLS } = require('../utils/cliSymbols');
const testLogEntries = [];
const {
  TEST_SUITES,
  listSuites,
  resolveTestFiles,
  filterByTags,
  getSuiteFiles,
} = require('./test-registry');
const { getRunnerForFile } = require('./test-config');

const REPORT_DIR = path.resolve(__dirname, '../../reports/test');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const REPORT_STARTED_AT = new Date();
const REPORT_TIMESTAMP = REPORT_STARTED_AT.toISOString().replace(/[.:]/g, '-');
const TEST_SUMMARY_REPORT = path.join(REPORT_DIR, `npm-test-summary-${REPORT_TIMESTAMP}.json`);
const TEST_FULL_REPORT = path.join(REPORT_DIR, `npm-test-full-${REPORT_TIMESTAMP}.json`);
const TEST_LOG_REPORT = path.join(REPORT_DIR, `npm-test-logs-${REPORT_TIMESTAMP}.json`);

function stripAnsi(value) {
  return value.replace(/[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g, '');
}

function extractFailureBlocks(output) {
  const lines = stripAnsi(output).split(/\r?\n/);
  const mochaBlocks = [];
  let currentMochaBlock = [];
  const failurePattern = /(?:[A-Za-z]+Error|Exception):|expected .* to|actual .*|Timeout of \d+ms exceeded|\b(?:invalid scheme|not configured|econnrefused|enoent)\b/i;

  const flushMochaBlock = () => {
    const title = currentMochaBlock.find(line => /^\s*\d+\)\s/.test(line));
    const failureIndex = currentMochaBlock.findIndex(line => failurePattern.test(line));
    if (failureIndex >= 0) {
      const details = currentMochaBlock
        .slice(failureIndex)
        .filter(line => !/^\s*[✔✓✅]\s/.test(line));
      mochaBlocks.push([title, ...details].filter(Boolean).join('\n').trim());
    }
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
  if (mochaBlocks.length > 0) return mochaBlocks;

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

function recordTestLog(stream, chunk, filePath = 'test-runner') {
  testLogEntries.push({
    timestamp: new Date().toISOString(),
    file: path.basename(filePath),
    stream,
    content: redactSensitive(chunk.toString()),
  });
}

function captureRunnerConsole() {
  ['log', 'warn', 'error'].forEach(method => {
    const original = console[method].bind(console);
    const stream = method === 'error' ? 'stderr' : 'stdout';
    console[method] = (...args) => {
      recordTestLog(stream, util.format(...args));
      original(...args);
    };
  });
}

function errorSignature(errorText) {
  const lines = errorText.split('\n');
  const firstErrorLine = lines.find(line => /(?:[A-Za-z]+Error|Exception):|expected .* to|actual .*|Timeout of \d+ms exceeded|\b(?:invalid scheme|not configured|econnrefused|enoent)\b/i.test(line))
    || lines.find(line => line.trim())
    || errorText;
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

function buildReportMetadata({ cliArgs, suitesToRun, testFiles, testResults, failedTests, startedAt, finishedAt }) {
  return {
    generatedAt: finishedAt.toISOString(),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    status: failedTests.length === 0 ? 'passed' : 'failed',
    arguments: process.argv.slice(2),
    options: cliArgs,
    suites: suitesToRun,
    totals: {
      discovered: testFiles.length,
      passed: testResults.filter(result => result.status === 'passed').length,
      failed: failedTests.length,
    },
    failedFiles: failedTests.map(file => path.basename(file)),
  };
}

function writeReports({ cliArgs, suitesToRun, testFiles, testResults, failedTests, errors, startedAt, finishedAt }) {
  const metadata = buildReportMetadata({
    cliArgs,
    suitesToRun,
    testFiles,
    testResults,
    failedTests,
    startedAt,
    finishedAt,
  });
  const reports = {
    summary: path.basename(TEST_SUMMARY_REPORT),
    full: path.basename(TEST_FULL_REPORT),
    logs: path.basename(TEST_LOG_REPORT),
  };
  const summary = {
    ...metadata,
    reports,
  };
  const full = {
    ...metadata,
    testResults,
    errors,
    reports,
  };
  const logs = {
    ...metadata,
    logs: testLogEntries,
    reports,
  };

  fs.writeFileSync(TEST_SUMMARY_REPORT, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  fs.writeFileSync(TEST_FULL_REPORT, `${JSON.stringify(full, null, 2)}\n`, 'utf8');
  console.log(`${CLI_SYMBOLS.report} Summary report saved to ${TEST_SUMMARY_REPORT}`);
  console.log(`${CLI_SYMBOLS.report} Full report saved to ${TEST_FULL_REPORT}`);
  fs.writeFileSync(TEST_LOG_REPORT, `${JSON.stringify(logs, null, 2)}\n`, 'utf8');
  console.log(`${CLI_SYMBOLS.report} Log report saved to ${TEST_LOG_REPORT}`);
  fs.writeFileSync(TEST_LOG_REPORT, `${JSON.stringify(logs, null, 2)}\n`, 'utf8');
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
      recordTestLog('stdout', chunk, filePath);
      process.stdout.write(chunk);
    });
    test.stderr.on('data', chunk => {
      output += chunk.toString();
      recordTestLog('stderr', chunk, filePath);
      process.stderr.write(chunk);
    });

    test.on('error', error => {
      error.testOutput = output;
      reject(error);
    });

    test.on('close', code => {
      if (code === 0) {
        console.log(`${CLI_SYMBOLS.success} ${path.basename(filePath)}\n`);
        resolve({ output });
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
    const startedAt = REPORT_STARTED_AT;
    const testResults = [];
    const failedTests = [];
    const errorMap = new Map();
    for (const testFile of testFiles) {
      const testStartedAt = new Date();
      try {
        const result = await runTestFile(testFile);
        testResults.push({
          file: path.basename(testFile),
          runner: getRunnerForFile(testFile),
          status: 'passed',
          durationMs: Date.now() - testStartedAt.getTime(),
          output: redactSensitive(result.output),
        });
      } catch (error) {
        failedTests.push(testFile);
        const output = error.testOutput || error.message;
        addFailureToReport(errorMap, testFile, output);
        testResults.push({
          file: path.basename(testFile),
          runner: getRunnerForFile(testFile),
          status: 'failed',
          durationMs: Date.now() - testStartedAt.getTime(),
          output: redactSensitive(output),
        });
      }
    }
    const finishedAt = new Date();
    console.log('\n' + '='.repeat(60));
    if (failedTests.length === 0) {
      console.log(`${CLI_SYMBOLS.success} All tests passed!\n`);
    } else {
      console.log(`${CLI_SYMBOLS.error} ${failedTests.length} test file(s) failed:\n`);
      failedTests.forEach(file => {
        console.log(`  - ${path.basename(file)}`);
      });
      console.log();
    }

    writeReports({
      cliArgs,
      suitesToRun,
      testFiles,
      testResults,
      failedTests,
      errors: [...errorMap.values()],
      startedAt,
      finishedAt,
    });

    process.exit(failedTests.length === 0 ? 0 : 1);
  } catch (error) {
    console.error(`\n${CLI_SYMBOLS.error} Test runner error:`, error.message);
    process.exit(1);
  }
}

captureRunnerConsole();
main();

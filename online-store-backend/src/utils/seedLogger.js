/**
 * Seed Logger - Ghi log seeding vào file report
 * Tạo file báo cáo .md và .txt sau khi seed hoàn thành
 */

const fs = require('fs');
const path = require('path');
const { CLI_SYMBOLS } = require('./cliSymbols');

class SeedLogger {
  constructor() {
    this.logs = [];
    this.startTime = new Date();
    this.reportDir = path.join(process.cwd(), 'seed-reports');
    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    this.ensureReportDir();
    this.interceptConsole();
  }

  ensureReportDir() {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  interceptConsole() {
    console.log = (...args) => {
      const message = args.join(' ');
      this.addLog(message);
      this.originalConsole.log(...args);
    };

    console.warn = (...args) => {
      const message = args.join(' ');
      this.addLog(`${CLI_SYMBOLS.warning} ${message}`);
      this.originalConsole.warn(...args);
    };

    console.error = (...args) => {
      const message = args.join(' ');
      this.addLog(`${CLI_SYMBOLS.error} ${message}`);
      this.originalConsole.error(...args);
    };
  }

  addLog(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);
  }

  log(message) {
    this.addLog(message);
    this.originalConsole.log(message);
  }

  warn(message) {
    this.addLog(`${CLI_SYMBOLS.warning} ${message}`);
    this.originalConsole.warn(`${CLI_SYMBOLS.warning} ${message}`);
  }

  error(message) {
    this.addLog(`${CLI_SYMBOLS.error} ${message}`);
    this.originalConsole.error(`${CLI_SYMBOLS.error} ${message}`);
  }

  generateReports() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const baseName = `seed-report-${timestamp}`;

    // Generate Markdown report
    const mdContent = this.generateMarkdown();
    const mdPath = path.join(this.reportDir, `${baseName}.md`);
    fs.writeFileSync(mdPath, mdContent);
    this.originalConsole.log(`\n${CLI_SYMBOLS.report} Markdown report saved: ${mdPath}`);

    // Generate Text report
    const txtContent = this.generateText();
    const txtPath = path.join(this.reportDir, `${baseName}.txt`);
    fs.writeFileSync(txtPath, txtContent);
    this.originalConsole.log(`${CLI_SYMBOLS.report} Text report saved: ${txtPath}`);

    return { mdPath, txtPath };
  }

  generateMarkdown() {
    const duration = ((new Date() - this.startTime) / 1000).toFixed(2);

    let markdown = `# Seed Database Report\n\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
    markdown += `**Duration:** ${duration} seconds\n\n`;
    markdown += `## Execution Log\n\n`;
    markdown += `\`\`\`\n`;
    markdown += this.logs.join('\n');
    markdown += `\n\`\`\`\n`;

    return markdown;
  }

  generateText() {
    const duration = ((new Date() - this.startTime) / 1000).toFixed(2);

    let text = `================================================================================\n`;
    text += `SEED DATABASE REPORT\n`;
    text += `================================================================================\n\n`;
    text += `Generated: ${new Date().toISOString()}\n`;
    text += `Duration: ${duration} seconds\n`;
    text += `Status: COMPLETED\n\n`;
    text += `================================================================================\n`;
    text += `EXECUTION LOG\n`;
    text += `================================================================================\n\n`;
    text += this.logs.join('\n');
    text += `\n\n`;
    text += `================================================================================\n`;
    text += `END OF REPORT\n`;
    text += `================================================================================\n`;

    return text;
  }
}

module.exports = new SeedLogger();

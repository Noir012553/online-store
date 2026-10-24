/**
 * Initialize uploads directory structure
 * Run: npm run init:uploads
 */
const fs = require('fs');
const path = require('path');
const { CLI_SYMBOLS } = require('../src/utils/cliSymbols');

const uploadDir = path.join(__dirname, '../uploads');
const userDir = path.join(uploadDir, 'users');
const reviewersDir = path.join(uploadDir, 'reviewers');

// Create directories
[uploadDir, userDir, reviewersDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`${CLI_SYMBOLS.check} Created: ${dir}`);
  } else {
    console.log(`${CLI_SYMBOLS.check} Exists: ${dir}`);
  }
});

// Create .gitkeep files
[uploadDir, userDir, reviewersDir].forEach(dir => {
  const gitkeep = path.join(dir, '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, '');
    console.log(`${CLI_SYMBOLS.check} Created: ${gitkeep}`);
  }
});

console.log(`\n${CLI_SYMBOLS.success} Uploads directory structure initialized!`);

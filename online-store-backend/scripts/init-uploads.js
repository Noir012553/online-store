/**
 * Initialize uploads directory structure
 * Run: npm run init:uploads
 */
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');
const userDir = path.join(uploadDir, 'users');
const reviewersDir = path.join(uploadDir, 'reviewers');

// Create directories
[uploadDir, userDir, reviewersDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created: ${dir}`);
  } else {
    console.log(`✓ Exists: ${dir}`);
  }
});

// Create .gitkeep files
[uploadDir, userDir, reviewersDir].forEach(dir => {
  const gitkeep = path.join(dir, '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, '');
    console.log(`✓ Created: ${gitkeep}`);
  }
});

console.log('\n✅ Uploads directory structure initialized!');

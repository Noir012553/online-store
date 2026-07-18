const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (file.endsWith('.tsx')) {
      callback(filePath);
    }
  });
}

const adminDir = 'online-store-frontend/src/pages/admin';

if (!fs.existsSync(adminDir)) {
  console.error(`Directory not found: ${adminDir}`);
  process.exit(1);
}

let fixedCount = 0;

walkDir(adminDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Replace t('key', fallback) with t('key')
  // Handles both single quotes, double quotes, and backticks for fallback
  content = content.replace(/t\(['"]([^'"]+)['"]\s*,\s*(?:`[^`]*`|'[^']*'|"[^"]*"|\$\{[^}]+\}|\$\{[^}]+\}(?:`[^`]*`|'[^']*'|"[^"]*"))\)/g, "t('$1')");
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Fixed: ${path.relative(process.cwd(), filePath)}`);
    fixedCount++;
  }
});

console.log(`\n✓ Fixed ${fixedCount} files!`);

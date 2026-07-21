const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const sourceDirectories = ['src/components', 'src/pages', 'src/lib'];
const excludedFiles = new Set([
  'src/lib/i18n/localeMetadata.ts',
  'src/lib/uiEmoji.ts',
]);
const emojiPattern = /[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/u;

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === 'test' ? [] : collectSourceFiles(entryPath);
    }

    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function findEmojiLiterals(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const findings = [];

  function inspect(node) {
    const text = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)
      ? node.text
      : null;

    if (text && emojiPattern.test(text)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      findings.push(`${filePath}:${position.line + 1}`);
    }

    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);
  return findings;
}

const findings = sourceDirectories
  .flatMap(collectSourceFiles)
  .filter((filePath) => !excludedFiles.has(filePath))
  .flatMap(findEmojiLiterals);

if (findings.length > 0) {
  console.error('Emoji UI phải được tham chiếu từ src/lib/uiEmoji.ts:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Không tìm thấy emoji UI hard-code ngoài src/lib/uiEmoji.ts.');

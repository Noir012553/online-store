const sanitizeHtml = require('sanitize-html');

const STRUCTURAL_TAG_PATTERN = /<\s*\/?\s*(?:br|hr|p|div|li|tr|section|article|h[1-6]|ul|ol|table|thead|tbody|dl|dt|dd)\b[^>]*>/gi;
const DANGEROUS_BLOCK_PATTERN = /<\s*(script|style|iframe|object|embed|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

const decodeCodePoint = value => {
  const codePoint = Number(value);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : '';
};

const decodeHtmlEntities = value => String(value)
  .replace(/&nbsp;/gi, ' ')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => decodeCodePoint(code))
  .replace(/&#x([0-9a-f]+);/gi, (_, code) => decodeCodePoint(parseInt(code, 16)));

const sanitizeToText = (value, preserveBreaks = false) => {
  if (value === null || value === undefined) return '';

  const withBreaks = decodeHtmlEntities(value)
    .replace(DANGEROUS_BLOCK_PATTERN, preserveBreaks ? '\n' : ' ')
    .replace(STRUCTURAL_TAG_PATTERN, preserveBreaks ? '\n' : ' ');
  const withoutTags = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });

  if (!preserveBreaks) return withoutTags.replace(/\s+/g, ' ').trim();

  return withoutTags
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const sanitizePlainText = value => sanitizeToText(value, false);
const sanitizeDescriptionText = value => sanitizeToText(value, true);

module.exports = {
  sanitizePlainText,
  sanitizeDescriptionText,
};

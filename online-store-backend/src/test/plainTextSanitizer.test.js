const { expect } = require('chai');
const {
  sanitizePlainText,
  sanitizeDescriptionText,
} = require('../utils/plainTextSanitizer');

describe('Plain text sanitizer', () => {
  it('removes tags and decodes entities for plain fields', () => {
    expect(sanitizePlainText('<b>Logitech</b><hr>&amp;')).to.equal('Logitech &');
  });

  it('preserves structural breaks in descriptions without rendering markup', () => {
    expect(sanitizeDescriptionText('<p>Thông tin</p><hr><ul><li>Wi-Fi</li></ul>'))
      .to.equal('Thông tin\n\nWi-Fi');
  });

  it('removes dangerous blocks and encoded tags', () => {
    expect(sanitizeDescriptionText('&lt;script&gt;alert(1)&lt;/script&gt;&lt;hr&gt;An toàn'))
      .to.equal('An toàn');
  });
});

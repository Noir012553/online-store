'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { UI_EMOJI, DESCRIPTION_EMOJI } from '@/lib/uiEmoji';

interface Props {
  text?: string;
  className?: string;
  maxLines?: number;
  specs?: Record<string, string | number>;
  specLabels?: Record<string, string>;
}

/**
 * Hàm làm sạch văn bản mô tả sản phẩm
 * - Loại bỏ các thẻ HTML/XML
 * - Loại bỏ các khối mã AI (Prompt leaks)
 * - Loại bỏ các từ khóa thừa
 */
const sanitizeDescription = (text: string): string => {
  if (!text) return "";

  let cleaned = text;

  // 1. Loại bỏ các khối mã (Code blocks) thường gặp từ AI leak
  cleaned = cleaned.replace(/```[a-z]*[\s\S]*?```/gi, '');

  // 2. Loại bỏ các từ khóa Prompt của AI
  const promptKeywords = [
    /STRICT RULES:/gi,
    /CONTENT TO TRANSLATE:/gi,
    /DO NOT add any explanations/gi,
    /Maintain all HTML tags/gi,
    /Professional and technical tone/gi,
    /Here is the translation/gi,
    /Translation:/gi
  ];

  promptKeywords.forEach(regex => {
    cleaned = cleaned.replace(regex, '');
  });

  // 3. Decode entities before removing encoded tags
  cleaned = cleaned
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

  // 4. Convert structural tags to line breaks and remove all remaining tags
  cleaned = cleaned
    .replace(/<\s*(script|style|iframe|object|embed|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(?:br|hr|p|div|li|tr|section|article|h[1-6]|ul|ol|table|thead|tbody|dl|dt|dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
};

/**
 * Component để hiển thị mô tả sản phẩm với xuống dòng tự động
 * - Xuống dòng SAU dấu "."
 * - Xuống dòng TRƯỚC icon/emoji
 * - Thay thế "##" bằng emoji 📌
 * - Chức năng "Xem chi tiết" / "Thu lại"
 */
export const ProductDescriptionFormatter: React.FC<Props> = ({
  text,
  className = "mb-4",
  maxLines,
  specs,
  specLabels,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  const sanitizedText = sanitizeDescription(text || "");
  const embeddedSpecsPattern = /(?:^|\n)\s*(?:Thông số|Specifications?)\s*:\s*\{[\s\S]*?\}(?=\s|$)/i;
  const specEntries = Object.entries(specs || {});
  const hasEmbeddedSpecs = embeddedSpecsPattern.test(sanitizedText) && specEntries.length > 0;
  const descriptionIntro = sanitizedText.replace(embeddedSpecsPattern, '').trim();

  if (hasEmbeddedSpecs) {

    return (
      <div className={className}>
        {descriptionIntro && (
          <p className="mb-4 leading-relaxed text-gray-700">{descriptionIntro}</p>
        )}
        <section className="rounded-xl border border-red-100 bg-red-50/50 p-4 sm:p-5">
          <h4 className="mb-4 flex items-center gap-2 text-base font-bold text-gray-900 sm:text-lg">
            <span className="h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
            {t('tab_specs', 'products')}
          </h4>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {specEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {specLabels?.[key] || key}
                </dt>
                <dd className="space-y-0.5 break-words text-sm font-semibold leading-5 text-gray-900">
                  {String(value).split(';').map((item, index) => (
                    <span key={`${item}-${index}`} className="block">
                      {item.trim()}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    );
  }

  if (!sanitizedText) {
    return <p className={className}>{t('no_description', 'products')}</p>;
  }

  // Thay thế "##" bằng emoji 📌
  let processedText = sanitizedText.replace(/##/g, UI_EMOJI.descriptionMarker);

  const symbols = DESCRIPTION_EMOJI;

  const isEmoji = (char: string): boolean => {
    if (symbols.has(char)) return true;
    const code = char.charCodeAt(0);
    if (code >= 0x1F300 && code <= 0x1F9FF) return true;
    if (code >= 0x2600 && code <= 0x26FF) return true;
    if (code >= 0x2700 && code <= 0x27BF) return true;
    return false;
  };

  // Tìm tất cả break positions
  const breakPositions: number[] = [];
  
  let previousChar = '';

  for (let i = 0; i < processedText.length;) {
    const char = String.fromCodePoint(processedText.codePointAt(i)!);

    // Break sau dấu "."
    if (char === '.' && i < processedText.length - 1) {
      if (processedText[i + 1] === ' ') {
        breakPositions.push(i + 2);
      } else {
        breakPositions.push(i + 1);
      }
    }

    // Break trước emoji
    if (isEmoji(char) && i > 0 && !isEmoji(previousChar)) {
      breakPositions.push(i);
    }

    previousChar = char;
    i += char.length;
  }

  // Nếu không có break points, hiển thị text bình thường
  if (breakPositions.length === 0) {
    return <p className={className}>{processedText}</p>;
  }

  // Sắp xếp và loại bỏ duplicate
  const uniquePositions = [...new Set(breakPositions)].sort((a, b) => a - b);

  // Tạo tất cả các dòng
  const lines: string[] = [];
  let lastPos = 0;

  uniquePositions.forEach((breakPos) => {
    const part = processedText.substring(lastPos, breakPos).trim();
    if (part) {
      lines.push(part);
    }
    lastPos = breakPos;
  });

  // Thêm phần còn lại
  const remaining = processedText.substring(lastPos).trim();
  if (remaining) {
    lines.push(remaining);
  }

  // Kiểm tra có cần expand/collapse không
  const needsExpand = maxLines !== undefined && lines.length > maxLines;
  const visibleLines = isExpanded || maxLines === undefined ? lines : lines.slice(0, maxLines);

  return (
    <div className={className}>
      <p className="whitespace-pre-line leading-relaxed text-gray-700">
        {visibleLines.join('\n')}
      </p>
      {needsExpand && (
        <>
          <br />
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-red-600 hover:text-red-800 hover:underline font-medium mt-2 inline-block"
          >
            {isExpanded ? t('show_less', 'common') : t('show_more', 'common')}
          </button>
        </>
      )}
    </div>
  );
};

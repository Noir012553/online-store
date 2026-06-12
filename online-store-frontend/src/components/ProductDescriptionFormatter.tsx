'use client';

import React, { useState } from 'react';
import { useTranslation } from '@/lib/i18n';

interface Props {
  text?: string;
  className?: string;
  maxLines?: number;
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

  // 3. Loại bỏ các thẻ HTML/XML (như <br>, <div>, v.v.)
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');

  // 4. Decode một số thực thể HTML cơ bản
  cleaned = cleaned
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  // 5. Làm sạch các khoảng trắng thừa
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

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
  maxLines = 10
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { t } = useTranslation();

  // Làm sạch text trước khi xử lý
  const sanitizedText = sanitizeDescription(text || "");

  if (!sanitizedText) {
    return <p className={className}>{t('no_description')}</p>;
  }

  // Thay thế "##" bằng emoji 📌
  let processedText = sanitizedText.replace(/##/g, '📌');

  // Danh sách ký hiệu/emoji
  const symbols = new Set([
    '✔', '✓', '✅', '❌', '⚠️', '🔥', '💡', '📱', '💻', '🎁', '📌',
  ]);

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
  
  for (let i = 0; i < processedText.length; i++) {
    // Break sau dấu "."
    if (processedText[i] === '.' && i < processedText.length - 1) {
      if (processedText[i + 1] === ' ') {
        breakPositions.push(i + 2);
      } else {
        breakPositions.push(i + 1);
      }
    }
    
    // Break trước emoji
    if (isEmoji(processedText[i]) && i > 0 && !isEmoji(processedText[i - 1])) {
      breakPositions.push(i);
    }
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
  const needsExpand = lines.length > maxLines;
  const visibleLines = isExpanded ? lines : lines.slice(0, maxLines);

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
            {isExpanded ? t('show_less') : t('show_more')}
          </button>
        </>
      )}
    </div>
  );
};

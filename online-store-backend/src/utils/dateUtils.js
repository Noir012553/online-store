/**
 * Utility functions for date formatting
 * Đặc biệt cho múi giờ Việt Nam (+7)
 */

/**
 * Convert UTC datetime string sang múi giờ Việt Nam (+7)
 * @param {string|Date} utcDateString - UTC datetime (e.g. "2026-02-01T16:59:59Z")
 * @returns {Date} - Date object trong múi giờ Việt Nam
 * @example
 * const utcTime = "2026-02-01T16:59:59Z";
 * const vnTime = convertUTCtoVietnamTime(utcTime);
 * // Kết quả: 2026-02-02 (ngày hôm sau vì +7 giờ)
 */
function convertUTCtoVietnamTime(utcDateString) {
  if (!utcDateString) return null;

  // Parse UTC string thành Date object
  const utcDate = new Date(utcDateString);
  if (isNaN(utcDate.getTime())) {
    console.error('[dateUtils] Invalid UTC date string:', utcDateString);
    return null;
  }

  // Múi giờ Việt Nam là UTC+7
  const vietnamOffset = 7; // giờ
  const vietnamTime = new Date(utcDate.getTime() + vietnamOffset * 60 * 60 * 1000);

  return vietnamTime;
}

/**
 * Format date thành string dạng "DD/MM/YYYY HH:mm" (múi giờ VN)
 * @param {string|Date} dateInput - UTC datetime string hoặc Date object
 * @returns {string} - Formatted date string (e.g. "02/02/2026 23:59")
 */
function formatDateVietnam(dateInput) {
  if (!dateInput) return '';

  const vietnamTime = convertUTCtoVietnamTime(dateInput);
  if (!vietnamTime) return '';

  const day = String(vietnamTime.getDate()).padStart(2, '0');
  const month = String(vietnamTime.getMonth() + 1).padStart(2, '0');
  const year = vietnamTime.getFullYear();
  const hours = String(vietnamTime.getHours()).padStart(2, '0');
  const minutes = String(vietnamTime.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format date thành ISO string nhưng với múi giờ Việt Nam
 * @param {string|Date} dateInput - UTC datetime string hoặc Date object
 * @returns {string} - ISO-like format (e.g. "2026-02-02 23:59")
 */
function formatDateVietnamISO(dateInput) {
  if (!dateInput) return '';

  const vietnamTime = convertUTCtoVietnamTime(dateInput);
  if (!vietnamTime) return '';

  const year = vietnamTime.getFullYear();
  const month = String(vietnamTime.getMonth() + 1).padStart(2, '0');
  const day = String(vietnamTime.getDate()).padStart(2, '0');
  const hours = String(vietnamTime.getHours()).padStart(2, '0');
  const minutes = String(vietnamTime.getMinutes()).padStart(2, '0');
  const seconds = String(vietnamTime.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
  convertUTCtoVietnamTime,
  formatDateVietnam,
  formatDateVietnamISO,
};

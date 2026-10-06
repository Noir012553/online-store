const path = require('path');

const getReportTimestamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-');

const timestampedFilename = (prefix, extension = 'json', date = new Date()) => {
  const normalizedExtension = String(extension).replace(/^\./, '');
  return `${prefix}-${getReportTimestamp(date)}.${normalizedExtension}`;
};

const timestampedPath = (directory, prefix, extension = 'json', date = new Date()) => (
  path.join(directory, timestampedFilename(prefix, extension, date))
);

module.exports = {
  getReportTimestamp,
  timestampedFilename,
  timestampedPath,
};

const fs = require('fs');
const path = require('path');
const { CLI_SYMBOLS } = require('./cliSymbols');

/**
 * Delete old file safely
 * Used for avatar cleanup when user uploads new profile/review image
 * @param {string} filePath - Relative path to file (e.g., /uploads/users/filename.jpg)
 * @returns {boolean} - true if deleted or didn't exist, false if error occurred
 */
const deleteOldFile = async (filePath) => {
  if (!filePath) return true;

  try {
    const absolutePath = path.resolve(process.cwd(), filePath);
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const relativePath = path.relative(uploadsDir, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      console.warn(`${CLI_SYMBOLS.warning} File deletion blocked: ${filePath} is outside uploads directory`);
      return false;
    }

    await fs.promises.unlink(absolutePath);
    console.log(`${CLI_SYMBOLS.check} Deleted old file: ${filePath}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    console.error(`${CLI_SYMBOLS.error} Error deleting file ${filePath}:`, error.message);
    return false;
  }
};

module.exports = {
  deleteOldFile,
};

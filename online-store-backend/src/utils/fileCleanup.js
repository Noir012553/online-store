const fs = require('fs');
const path = require('path');
const { CLI_SYMBOLS } = require('./cliSymbols');

/**
 * Delete old file safely
 * Used for avatar cleanup when user uploads new profile/review image
 * @param {string} filePath - Relative path to file (e.g., /uploads/users/filename.jpg)
 * @returns {boolean} - true if deleted or didn't exist, false if error occurred
 */
const deleteOldFile = (filePath) => {
  if (!filePath) return true;

  try {
    // Convert relative path to absolute path
    const absolutePath = path.join(process.cwd(), filePath);

    // Security check: ensure file is within uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!absolutePath.startsWith(uploadsDir)) {
      console.warn(`${CLI_SYMBOLS.warning} File deletion blocked: ${filePath} is outside uploads directory`);
      return false;
    }

    // Check if file exists before attempting delete
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      console.log(`${CLI_SYMBOLS.check} Deleted old file: ${filePath}`);
      return true;
    }

    return true; // File doesn't exist, that's fine
  } catch (error) {
    console.error(`${CLI_SYMBOLS.error} Error deleting file ${filePath}:`, error.message);
    return false;
  }
};

module.exports = {
  deleteOldFile,
};

const mongoose = require('mongoose');

const providerDirectoryEntrySchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['email', 'payment', 'shipping', 'deployment', 'storage'],
    required: true,
    immutable: true,
  },
  code: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    immutable: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  },
  managementUrl: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

providerDirectoryEntrySchema.index({ category: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.ProviderDirectoryEntry || mongoose.model('ProviderDirectoryEntry', providerDirectoryEntrySchema);

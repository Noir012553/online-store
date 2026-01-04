const mongoose = require('mongoose');

const wardSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      index: true,
    },
    nameEN: String,
    fullName: String,
    fullNameEN: String,
    codeName: String,
    districtCode: {
      type: String,
      required: true,
      index: true,
    },
    provinceCode: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index để tìm nhanh wards theo districtCode
wardSchema.index({ districtCode: 1, code: 1 }, { unique: true });

const Ward = mongoose.model('Ward', wardSchema);

module.exports = Ward;

const mongoose = require('mongoose');

const districtSchema = mongoose.Schema(
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

// Compound index để tìm nhanh districts theo provinceCode
districtSchema.index({ provinceCode: 1, code: 1 }, { unique: true });

const District = mongoose.model('District', districtSchema);

module.exports = District;

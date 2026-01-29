const mongoose = require('mongoose');

const ProvinceSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['ghn'],
      required: true,
    },
    provinceId: {
      type: Number,
      required: true,
    },
    provinceName: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

ProvinceSchema.index({ provider: 1, provinceId: 1 }, { unique: true });

const DistrictSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['ghn'],
      required: true,
    },
    provinceId: {
      type: Number,
      required: true,
    },
    districtId: {
      type: Number,
      required: true,
    },
    districtName: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

DistrictSchema.index({ provider: 1, districtId: 1 }, { unique: true });
DistrictSchema.index({ provider: 1, provinceId: 1 });

const WardSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['ghn'],
      required: true,
    },
    districtId: {
      type: Number,
      required: true,
    },
    wardCode: {
      type: String,
      required: true,
      trim: true,
    },
    wardName: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

WardSchema.index({ provider: 1, wardCode: 1 }, { unique: true });
WardSchema.index({ provider: 1, districtId: 1 });

const Province = mongoose.model('Province', ProvinceSchema);
const District = mongoose.model('District', DistrictSchema);
const Ward = mongoose.model('Ward', WardSchema);

module.exports = {
  Province,
  District,
  Ward,
};

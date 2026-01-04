const mongoose = require('mongoose');

const provinceSchema = mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
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
    adminCode: String,
    adminCodeName: String,
  },
  {
    timestamps: true,
  }
);

const Province = mongoose.model('Province', provinceSchema);

module.exports = Province;

const mongoose = require('mongoose');

const adminUserGovernanceSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  version: { type: Number, default: 0, min: 0 },
}, { timestamps: false });

module.exports = mongoose.model('AdminUserGovernance', adminUserGovernanceSchema);

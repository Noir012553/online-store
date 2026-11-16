const mongoose = require('mongoose');
const { backendPlatforms, frontendPlatforms } = require('../config/deploymentTargets');

const deploymentTargetsSchema = new mongoose.Schema({
  key: { type: String, default: 'primary', immutable: true, unique: true },
  backend: { type: String, enum: backendPlatforms.map(platform => platform.code), required: true },
  frontend: { type: String, enum: frontendPlatforms.map(platform => platform.code), required: true },
}, { timestamps: true });

module.exports = mongoose.models.DeploymentTargets || mongoose.model('DeploymentTargets', deploymentTargetsSchema);

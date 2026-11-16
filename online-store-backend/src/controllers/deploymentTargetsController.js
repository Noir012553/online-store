const asyncHandler = require('express-async-handler');
const DeploymentTargets = require('../models/DeploymentTargets');
const { backendPlatforms, frontendPlatforms, defaultDeploymentTargets } = require('../config/deploymentTargets');

const backendCodes = new Set(backendPlatforms.map(platform => platform.code));
const frontendCodes = new Set(frontendPlatforms.map(platform => platform.code));

const getDeploymentTargets = asyncHandler(async (_req, res) => {
  const saved = await DeploymentTargets.findOne({ key: 'primary' }).lean();
  res.set({ 'Cache-Control': 'no-store, private', Pragma: 'no-cache' });
  res.status(200).json({
    success: true,
    data: {
      targets: saved ? { backend: saved.backend, frontend: saved.frontend } : defaultDeploymentTargets,
      saved: Boolean(saved),
    },
  });
});

const updateDeploymentTargets = asyncHandler(async (req, res) => {
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !backendCodes.has(input.backend) || !frontendCodes.has(input.frontend)) {
    return res.status(400).json({ success: false, code: 'DEPLOYMENT_TARGETS_INVALID', message: 'Deployment targets are invalid.' });
  }

  const targets = { backend: input.backend, frontend: input.frontend };
  const saved = await DeploymentTargets.findOneAndUpdate(
    { key: 'primary' },
    { $set: targets },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return res.status(200).json({
    success: true,
    data: { targets: { backend: saved.backend, frontend: saved.frontend }, saved: true },
  });
});

module.exports = { getDeploymentTargets, updateDeploymentTargets };

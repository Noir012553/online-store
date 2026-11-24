const asyncHandler = require('express-async-handler');
const DeploymentAudit = require('../models/DeploymentAudit');
const { callDeploymentRouter } = require('../services/deploymentRouterService');

const noStore = (res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
const allowedModes = new Set(['tunnel', 'vercel-render']);

const audit = async (req, action, outcome, { mode = null, jobId = null } = {}) => {
  if (process.env.DEPLOYMENT_CANDIDATE_READ_ONLY === 'true') return;
  await DeploymentAudit.create({
    action,
    actorId: req.user._id,
    actorName: String(req.user.name || req.user.username || req.user.email || req.user._id).slice(0, 160),
    mode,
    jobId,
    outcome,
  });
};

const relay = async (req, res, action, path, options = {}, fields = {}) => {
  noStore(res);
  try {
    const result = await callDeploymentRouter(path, options);
    await audit(req, action, result.data?.status || (result.data?.passed === false ? 'failed' : result.status < 300 ? 'success' : 'rejected'), {
      mode: fields.mode || result.data?.mode || null,
      jobId: result.data?.id || fields.jobId || null,
    });
    return res.status(result.status).json(result.data);
  } catch (error) {
    await audit(req, action, error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 'not-configured' : 'unavailable', fields);
    return res.status(error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 503 : 502).json({
      success: false,
      code: error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' : 'DEPLOYMENT_ROUTER_UNAVAILABLE',
    });
  }
};

exports.getStatus = asyncHandler(async (req, res) => {
  const enabled = process.env.DEPLOYMENT_SWITCH_ENABLED === 'true';
  noStore(res);
  try {
    const result = await callDeploymentRouter('/__deployment/status');
    await audit(req, 'status', result.status < 300 ? 'success' : 'rejected', { mode: result.data?.mode || null });
    return res.status(result.status).json({ ...result.data, switchEnabled: enabled });
  } catch (error) {
    await audit(req, 'status', error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 'not-configured' : 'unavailable');
    return res.status(error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 503 : 502).json({
      success: false,
      code: error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' : 'DEPLOYMENT_ROUTER_UNAVAILABLE',
      switchEnabled: enabled,
    });
  }
});

const switchingDisabled = async (req, res, action) => {
  if (process.env.DEPLOYMENT_SWITCH_ENABLED === 'true') return false;
  noStore(res);
  await audit(req, action, 'disabled');
  res.status(503).json({ success: false, code: 'DEPLOYMENT_SWITCH_DISABLED' });
  return true;
};

exports.preflight = asyncHandler(async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || !allowedModes.has(body.mode)) {
    noStore(res);
    return res.status(400).json({ success: false, code: 'INVALID_DEPLOYMENT_MODE' });
  }
  return relay(req, res, 'preflight', '/__deployment/preflight', {
    method: 'POST', body: { mode: body.mode, actorId: String(req.user._id) },
  }, { mode: body.mode });
});

exports.startCutover = asyncHandler(async (req, res) => {
  if (await switchingDisabled(req, res, 'cutover')) return;
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 1 || body.confirmed !== true) {
    noStore(res);
    return res.status(400).json({ success: false, code: 'CUTOVER_CONFIRMATION_REQUIRED' });
  }
  return relay(req, res, 'cutover', '/__deployment/cutover', {
    method: 'POST', body: { mode: 'vercel-render', confirmed: true, actorId: String(req.user._id) },
  }, { mode: 'vercel-render' });
});

exports.rollback = asyncHandler(async (req, res) => {
  if (await switchingDisabled(req, res, 'rollback')) return;
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).length !== 2 || body.confirmed !== true || body.renderStopped !== true) {
    noStore(res);
    return res.status(400).json({ success: false, code: 'ROLLBACK_CONFIRMATION_REQUIRED' });
  }
  return relay(req, res, 'rollback', '/__deployment/rollback', {
    method: 'POST', body: { confirmed: true, renderStopped: true, actorId: String(req.user._id) },
  }, { mode: 'tunnel' });
});

exports.getJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  noStore(res);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    return res.status(400).json({ success: false, code: 'INVALID_DEPLOYMENT_JOB_ID' });
  }
  try {
    const result = await callDeploymentRouter(`/__deployment/jobs/${jobId}`);
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 503 : 502).json({
      success: false,
      code: error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' : 'DEPLOYMENT_ROUTER_UNAVAILABLE',
    });
  }
});

exports.getAudit = asyncHandler(async (req, res) => {
  noStore(res);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const events = await DeploymentAudit.find().sort({ createdAt: -1 }).limit(limit).lean();
  let controlPlaneEvents = [];
  try {
    const response = await callDeploymentRouter('/__deployment/audit');
    controlPlaneEvents = response.data?.events || [];
  } catch {}
  res.json({ success: true, data: events, controlPlaneEvents });
});

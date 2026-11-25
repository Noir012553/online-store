const asyncHandler = require('express-async-handler');
const DeploymentAudit = require('../models/DeploymentAudit');
const ProviderRuntimeAudit = require('../models/ProviderRuntimeAudit');
const User = require('../models/User');
const { callDeploymentRouter } = require('../services/deploymentRouterService');
const { getDeploymentRouterConfigStatus, saveDeploymentRouterConfig } = require('../services/deploymentRouterConfigService');

const noStore = (res) => res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
const allowedModes = new Set(['tunnel', 'vercel-render']);
const deploymentRouterErrorCode = (error) => {
  if (error.message === 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE') return error.message;
  return error.message === 'DEPLOYMENT_ROUTER_NOT_CONFIGURED' ? error.message : 'DEPLOYMENT_ROUTER_UNAVAILABLE';
};

exports.getConfig = asyncHandler(async (req, res) => {
  noStore(res);
  try {
    return res.json({ success: true, data: await getDeploymentRouterConfigStatus() });
  } catch (error) {
    return res.status(error.message === 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE' ? 503 : 500).json({
      success: false,
      code: error.message === 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE' ? error.message : 'DEPLOYMENT_ROUTER_CONFIG_UNAVAILABLE',
    });
  }
});

exports.updateConfig = asyncHandler(async (req, res) => {
  noStore(res);
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some((key) => !['routerUrl', 'controlToken', 'password'].includes(key))
    || typeof body.routerUrl !== 'string'
    || (Object.hasOwn(body, 'controlToken') && typeof body.controlToken !== 'string')
    || typeof body.password !== 'string') {
    return res.status(400).json({ success: false, code: 'INVALID_DEPLOYMENT_ROUTER_CONFIG' });
  }

  const user = await User.findById(req.user._id);
  if (!user || !(await user.matchPassword(body.password))) {
    return res.status(401).json({ success: false, code: 'REAUTHENTICATION_FAILED' });
  }

  try {
    const saved = await saveDeploymentRouterConfig({
      routerUrl: body.routerUrl,
      controlToken: body.controlToken,
      updatedBy: req.user._id,
    });
    await ProviderRuntimeAudit.create({
      providerCode: 'deployment_router',
      action: 'update',
      changedFields: ['DEPLOYMENT_ROUTER_URL', ...(saved.controlTokenUpdated ? ['DEPLOYMENT_CONTROL_TOKEN'] : [])],
      userId: req.user._id,
      userName: String(req.user.name || req.user.username || req.user.email || req.user._id).slice(0, 160),
    });
    return res.json({ success: true, data: { version: saved.version, routerUrl: saved.routerUrl, controlTokenUpdated: saved.controlTokenUpdated } });
  } catch (error) {
    const knownErrors = ['DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE', 'INVALID_DEPLOYMENT_ROUTER_URL', 'INVALID_DEPLOYMENT_CONTROL_TOKEN', 'DEPLOYMENT_CONTROL_TOKEN_REQUIRED'];
    const code = knownErrors.includes(error.message) ? error.message : 'DEPLOYMENT_ROUTER_CONFIG_SAVE_FAILED';
    const status = code === 'DEPLOYMENT_ROUTER_CONFIG_STORE_UNAVAILABLE' ? 503 : knownErrors.includes(code) ? 400 : 500;
    return res.status(status).json({ success: false, code });
  }
});

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
    const code = deploymentRouterErrorCode(error);
    await audit(req, action, code === 'DEPLOYMENT_ROUTER_UNAVAILABLE' ? 'unavailable' : 'not-configured', fields);
    return res.status(code === 'DEPLOYMENT_ROUTER_UNAVAILABLE' ? 502 : 503).json({ success: false, code });
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
    const code = deploymentRouterErrorCode(error);
    await audit(req, 'status', code === 'DEPLOYMENT_ROUTER_UNAVAILABLE' ? 'unavailable' : 'not-configured');
    return res.status(code === 'DEPLOYMENT_ROUTER_UNAVAILABLE' ? 502 : 503).json({ success: false, code, switchEnabled: enabled });
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
    const code = deploymentRouterErrorCode(error);
    return res.status(code === 'DEPLOYMENT_ROUTER_UNAVAILABLE' ? 502 : 503).json({ success: false, code });
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

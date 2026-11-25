const createDeploymentCandidateReadOnlyMiddleware = (candidateReadOnly) => (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const deploymentControlPath = /^\/admin\/deployment\/(preflight|cutover|rollback)$/.test(req.path);
  const paymentWebhookPath = /^\/payments\/(?:webhook|vnpay-api\/webhook)\//.test(req.path);
  const allowedReadOnlyRequest = ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    || (req.method === 'POST' && deploymentControlPath);

  if (candidateReadOnly && (paymentWebhookPath || !allowedReadOnlyRequest)) {
    return res.status(503).json({ success: false, code: 'CANDIDATE_READ_ONLY' });
  }

  return next();
};

module.exports = { createDeploymentCandidateReadOnlyMiddleware };

const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const ExportJob = require('../models/ExportJob');

const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 5000;
const EXPORT_LEASE_MS = 10 * 60 * 1000;
const EXPORT_DIR = path.resolve(
  process.env.EXPORT_JOB_DIR || path.join(os.tmpdir(), 'online-store-export-jobs'),
);

let timer = null;
let isProcessing = false;

const createJobError = (statusCode, code, details = {}) => {
  const error = new Error(code);
  error.statusCode = statusCode;
  error.errorCode = code;
  error.details = details;
  return error;
};

const assertJobId = (jobId) => {
  if (!mongoose.Types.ObjectId.isValid(jobId)) {
    throw createJobError(400, 'EXPORT_JOB_ID_INVALID');
  }
};

const getDownloadUrl = (jobId) => `/api/products/admin/export-jobs/${jobId}/download`;

const toJobResponse = (job) => ({
  jobId: job._id.toString(),
  status: job.status,
  attempts: job.attempts,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  errorMessage: job.status === 'failed' ? job.errorMessage : null,
  downloadUrl: job.status === 'ready' ? getDownloadUrl(job._id) : null,
});

const enqueueExportJob = async ({ request, userId = null }) => {
  const job = await ExportJob.create({ request, userId });
  return toJobResponse(job);
};

const claimNextExportJob = () => {
  const now = new Date();
  return ExportJob.findOneAndUpdate(
    {
      cancelRequested: false,
      $or: [
        { status: 'queued', nextAttemptAt: { $lte: now } },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + EXPORT_LEASE_MS),
        errorMessage: null,
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after', sort: { createdAt: 1 } },
  );
};

const isCancelRequested = async (jobId) => {
  const job = await ExportJob.findOne({ _id: jobId }).select('status cancelRequested').lean();
  return !job || job.status === 'cancelled' || job.cancelRequested;
};

const markCancelled = async (job) => {
  await ExportJob.updateOne(
    { _id: job._id, status: 'processing', leaseExpiresAt: job.leaseExpiresAt },
    {
      $set: {
        status: 'cancelled',
        cancelRequested: false,
        finishedAt: new Date(),
        filePath: null,
        leaseExpiresAt: null,
      },
    },
  );
};

const processExportJob = async (job) => {
  const { createExportPayload, writeExportZipFile } = require('../controllers/productImportController');
  const filePath = path.join(EXPORT_DIR, `${job._id.toString()}-${job.attempts}.zip`);
  let fileCreated = false;

  try {
    if (await isCancelRequested(job._id)) {
      await markCancelled(job);
      return;
    }

    const request = { ...job.request, async: false };
    const payload = await createExportPayload(
      { aborted: false, destroyed: false },
      request,
    );

    if (await isCancelRequested(job._id)) {
      await markCancelled(job);
      return;
    }

    await writeExportZipFile(filePath, payload, request.contentFormat);
    fileCreated = true;

    const result = await ExportJob.updateOne(
      { _id: job._id, status: 'processing', cancelRequested: false, leaseExpiresAt: job.leaseExpiresAt },
      {
        $set: {
          status: 'ready',
          filePath,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      },
    );

    if (result.modifiedCount !== 1) {
      await fs.promises.unlink(filePath).catch(() => {});
      if (await isCancelRequested(job._id)) await markCancelled(job);
    }
  } catch (error) {
    if (fileCreated) await fs.promises.unlink(filePath).catch(() => {});
    const cancelled = await isCancelRequested(job._id);
    const retryable = job.attempts < MAX_ATTEMPTS;
    await ExportJob.updateOne(
      { _id: job._id, status: 'processing', leaseExpiresAt: job.leaseExpiresAt },
      {
        $set: {
          status: cancelled ? 'cancelled' : retryable ? 'queued' : 'failed',
          cancelRequested: false,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + (retryable ? 1000 * 2 ** job.attempts : 0)),
          errorMessage: error.message,
          finishedAt: retryable && !cancelled ? null : new Date(),
          filePath: null,
        },
      },
    );
  }
};

const recoverExpiredExportJobs = async () => {
  const now = new Date();
  const expiredJobs = await ExportJob.find({
    status: 'processing',
    leaseExpiresAt: { $lte: now },
  }).select('_id attempts cancelRequested').lean();

  await Promise.all(expiredJobs.map(job => ExportJob.updateOne(
    { _id: job._id, status: 'processing', leaseExpiresAt: { $lte: now } },
    {
      $set: {
        status: job.cancelRequested
          ? 'cancelled'
          : job.attempts >= MAX_ATTEMPTS ? 'failed' : 'queued',
        cancelRequested: false,
        leaseExpiresAt: null,
        nextAttemptAt: now,
        finishedAt: job.cancelRequested || job.attempts >= MAX_ATTEMPTS ? now : null,
        errorMessage: job.cancelRequested ? null : 'Export worker lease expired',
      },
    },
  )));
};

const processExportJobs = async () => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    await recoverExpiredExportJobs();
    let job = await claimNextExportJob();
    while (job) {
      await processExportJob(job);
      job = await claimNextExportJob();
    }
  } finally {
    isProcessing = false;
  }
};

const startExportJobWorker = () => {
  if (timer) return;
  processExportJobs().catch(error => console.error('[EXPORT_JOB_WORKER]', error));
  timer = setInterval(() => {
    processExportJobs().catch(error => console.error('[EXPORT_JOB_WORKER]', error));
  }, POLL_INTERVAL_MS);
  timer.unref();
};

const getExportJob = async (jobId) => {
  assertJobId(jobId);
  const job = await ExportJob.findById(jobId).lean();
  if (!job) throw createJobError(404, 'EXPORT_JOB_NOT_FOUND');
  return toJobResponse(job);
};

const cancelExportJob = async (jobId) => {
  assertJobId(jobId);
  let job = await ExportJob.findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    {
      $set: {
        status: 'cancelled',
        finishedAt: new Date(),
        cancelRequested: false,
        leaseExpiresAt: null,
      },
    },
    { returnDocument: 'after' },
  );

  if (!job) {
    job = await ExportJob.findOneAndUpdate(
      { _id: jobId, status: 'processing' },
      { $set: { cancelRequested: true } },
      { returnDocument: 'after' },
    );
  }

  if (!job) throw createJobError(404, 'EXPORT_JOB_NOT_FOUND');
  return toJobResponse(job);
};

const retryExportJob = async (jobId) => {
  assertJobId(jobId);
  const job = await ExportJob.findOneAndUpdate(
    { _id: jobId, status: { $in: ['failed', 'cancelled'] }, attempts: { $lt: MAX_ATTEMPTS } },
    {
      $set: {
        status: 'queued',
        nextAttemptAt: new Date(),
        cancelRequested: false,
        errorMessage: null,
        finishedAt: null,
        filePath: null,
        leaseExpiresAt: null,
      },
    },
    { returnDocument: 'after' },
  );

  if (!job) throw createJobError(409, 'EXPORT_JOB_NOT_RETRYABLE');
  return toJobResponse(job);
};

const downloadExportJob = async (jobId, res, next) => {
  assertJobId(jobId);
  const job = await ExportJob.findOne({ _id: jobId, status: 'ready' }).lean();
  if (!job || !job.filePath) throw createJobError(404, 'EXPORT_FILE_NOT_READY');

  res.download(job.filePath, `products-export-${job._id}.zip`, (error) => {
    if (error && !res.headersSent) next(error);
  });
};

module.exports = {
  enqueueExportJob,
  getExportJob,
  cancelExportJob,
  retryExportJob,
  downloadExportJob,
  processExportJobs,
  startExportJobWorker,
};

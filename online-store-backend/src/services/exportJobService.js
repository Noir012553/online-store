const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const ExportJob = require('../models/ExportJob');
const {
  EXPORT_DIR,
  STORAGE_MODE,
  assertStorageConfigured,
  isManagedStoragePath,
  putFile,
  deleteFile,
  downloadFile,
} = require('./exportStorage');
const { recordExportEvent } = require('./exportMetrics');

const MAX_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 5000;
const EXPORT_LEASE_MS = 10 * 60 * 1000;
const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const EXPORT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const EXPORT_LEASE_HEARTBEAT_MS = Math.max(1000, Math.floor(EXPORT_LEASE_MS / 3));
let timer = null;
let isProcessing = false;
let lastCleanupAt = 0;

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
  assertStorageConfigured();
  const job = await ExportJob.create({ request, userId });
  recordExportEvent('enqueued');
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

const isManagedExportPath = filePath => isManagedStoragePath(filePath);

const cleanupExpiredExportFiles = async (cutoff) => {
  if (STORAGE_MODE !== 'local') return;
  let entries;
  try {
    entries = await fs.promises.readdir(EXPORT_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  await Promise.all(entries
    .filter(entry => entry.isFile() && path.extname(entry.name) === '.zip')
    .map(async (entry) => {
      const filePath = path.join(EXPORT_DIR, entry.name);
      const stats = await fs.promises.stat(filePath).catch(() => null);
      if (stats && stats.mtime <= cutoff) await fs.promises.unlink(filePath).catch(() => {});
    }));
};

const cleanupExpiredExportJobs = async () => {
  const cutoff = new Date(Date.now() - EXPORT_RETENTION_MS);
  await cleanupExpiredExportFiles(cutoff);

  const staleJobs = ExportJob.find({
    status: { $in: ['ready', 'failed', 'cancelled'] },
    finishedAt: { $ne: null, $lte: cutoff },
  }).select('_id filePath status finishedAt').lean().cursor();

  for await (const job of staleJobs) {
    if (job.filePath) await deleteFile(job.filePath);
    await ExportJob.deleteOne({
      _id: job._id,
      status: job.status,
      finishedAt: { $lte: cutoff },
    });
  }
};

const maybeCleanupExpiredExportJobs = async () => {
  if (Date.now() - lastCleanupAt < EXPORT_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = Date.now();
  try {
    await cleanupExpiredExportJobs();
    recordExportEvent('cleanupRuns');
  } catch (error) {
    recordExportEvent('cleanupErrors');
    console.error('[EXPORT_JOB_CLEANUP_ERROR]', { message: error.message, stack: error.stack });
  }
};

const startExportJobLeaseHeartbeat = (job) => {
  const heartbeatTimer = setInterval(async () => {
    const nextLeaseExpiresAt = new Date(Date.now() + EXPORT_LEASE_MS);
    try {
      const result = await ExportJob.updateOne(
        { _id: job._id, status: 'processing', leaseExpiresAt: job.leaseExpiresAt },
        { $set: { leaseExpiresAt: nextLeaseExpiresAt } },
      );
      if (result.modifiedCount === 1) job.leaseExpiresAt = nextLeaseExpiresAt;
    } catch (error) {
      console.error('[EXPORT_JOB_HEARTBEAT_ERROR]', { jobId: job._id.toString(), message: error.message });
    }
  }, EXPORT_LEASE_HEARTBEAT_MS);
  heartbeatTimer.unref();
  return () => clearInterval(heartbeatTimer);
};

const processExportJob = async (job) => {
  const { createStreamingExportPayload, writeExportZipFile } = require('../controllers/productImportController');
  const filePath = path.join(EXPORT_DIR, `${job._id.toString()}-${job.attempts}.zip`);
  let storedPath = null;
  let fileCreated = false;
  let stopLeaseHeartbeat = () => {};
  const startedAt = Date.now();

  try {
    recordExportEvent('started');
    console.info('[EXPORT_JOB_STARTED]', { jobId: job._id.toString(), attempt: job.attempts });
    if (await isCancelRequested(job._id)) {
      await markCancelled(job);
      return;
    }

    stopLeaseHeartbeat = startExportJobLeaseHeartbeat(job);
    const request = { ...job.request, async: false };
    const fakeReq = {
      aborted: false,
      destroyed: false,
      user: job.userId ? { _id: job.userId } : null,
    };
    const payload = await createStreamingExportPayload(fakeReq, request);

    if (await isCancelRequested(job._id)) {
      await markCancelled(job);
      return;
    }

    await writeExportZipFile(filePath, payload, request.contentFormat);
    fileCreated = true;
    storedPath = await putFile(filePath, `${job._id.toString()}-${job.attempts}.zip`);

    const result = await ExportJob.updateOne(
      { _id: job._id, status: 'processing', cancelRequested: false, leaseExpiresAt: job.leaseExpiresAt },
      {
        $set: {
          status: 'ready',
          filePath: storedPath,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      },
    );

    if (result.modifiedCount !== 1) {
      await deleteFile(storedPath || filePath);
      if (await isCancelRequested(job._id)) await markCancelled(job);
    } else {
      const durationMs = Date.now() - startedAt;
      recordExportEvent('succeeded', durationMs);
      console.info('[EXPORT_JOB_READY]', {
        jobId: job._id.toString(),
        durationMs,
      });
    }
  } catch (error) {
    if (storedPath) await deleteFile(storedPath);
    else if (fileCreated || await fs.promises.stat(filePath).catch(() => null)) {
      await fs.promises.unlink(filePath).catch(() => {});
    }
    const cancelled = await isCancelRequested(job._id);
    const retryable = job.attempts < MAX_ATTEMPTS;
    const durationMs = Date.now() - startedAt;
    recordExportEvent(cancelled ? 'cancelled' : 'failed', durationMs);
    console.error('[EXPORT_JOB_FAILED]', {
      jobId: job._id.toString(),
      attempt: job.attempts,
      durationMs,
      message: error.message,
      stack: error.stack,
    });
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
  } finally {
    stopLeaseHeartbeat();
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
  if (mongoose.connection.readyState !== 1) return;
  if (isProcessing) return;
  isProcessing = true;

  try {
    await maybeCleanupExpiredExportJobs();
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
  if (job.status === 'cancelled') recordExportEvent('cancelled');
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
  recordExportEvent('retried');
  return toJobResponse(job);
};

const downloadExportJob = async (jobId, res, next) => {
  assertJobId(jobId);
  const job = await ExportJob.findOne({ _id: jobId, status: 'ready' }).lean();
  if (!job || !job.filePath || !isManagedExportPath(job.filePath)) {
    throw createJobError(404, 'EXPORT_FILE_NOT_READY');
  }

  await downloadFile(job.filePath, res, next, `products-export-${job._id}.zip`);
};

module.exports = {
  enqueueExportJob,
  getExportJob,
  cancelExportJob,
  retryExportJob,
  downloadExportJob,
  processExportJobs,
  processExportJob,
  startExportJobWorker,
  isManagedExportPath,
  cleanupExpiredExportJobs,
  EXPORT_DIR,
};

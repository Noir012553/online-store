const { expect } = require('chai');
const sinon = require('sinon');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const ExportJob = require('../models/ExportJob');
const productImportController = require('../controllers/productImportController');
const exportJobService = require('../services/exportJobService');

const exportDirectory = path.resolve(
  process.env.EXPORT_JOB_DIR || path.join(os.tmpdir(), 'online-store-export-jobs'),
);

const createLeanQuery = value => ({
  select: () => ({
    lean: async () => value,
  }),
});

describe('Export job workflow', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('accepts only paths inside the managed export directory', () => {
    const managedPath = path.join(exportDirectory, 'job.zip');
    const outsidePath = path.join(exportDirectory, '..', 'job.zip');

    expect(exportJobService.isManagedExportPath(managedPath)).to.equal(true);
    expect(exportJobService.isManagedExportPath(exportDirectory)).to.equal(false);
    expect(exportJobService.isManagedExportPath(outsidePath)).to.equal(false);
    expect(exportJobService.isManagedExportPath(null)).to.equal(false);
  });

  it('removes expired ZIP files and stale terminal jobs', async () => {
    await fs.promises.mkdir(exportDirectory, { recursive: true });
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const expiredPath = path.join(exportDirectory, `expired-${suffix}.zip`);
    const freshPath = path.join(exportDirectory, `fresh-${suffix}.zip`);
    await fs.promises.writeFile(expiredPath, 'expired');
    await fs.promises.writeFile(freshPath, 'fresh');
    const oldTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await fs.promises.utimes(expiredPath, oldTime, oldTime);

    const staleJob = {
      _id: new mongoose.Types.ObjectId(),
      filePath: expiredPath,
      status: 'ready',
      finishedAt: oldTime,
    };
    const cursor = {
      async *[Symbol.asyncIterator]() {
        yield staleJob;
      },
    };
    sinon.stub(ExportJob, 'find').returns({
      select: () => ({
        lean: () => ({ cursor: () => cursor }),
      }),
    });
    const deleteOne = sinon.stub(ExportJob, 'deleteOne').resolves({ deletedCount: 1 });

    try {
      await exportJobService.cleanupExpiredExportJobs();

      expect(fs.existsSync(expiredPath)).to.equal(false);
      expect(fs.existsSync(freshPath)).to.equal(true);
      expect(deleteOne.calledOnceWith({
        _id: staleJob._id,
        status: staleJob.status,
        finishedAt: { $lte: sinon.match.date },
      })).to.equal(true);
    } finally {
      await fs.promises.unlink(freshPath).catch(() => {});
    }
  });

  it('processes a claimed job into a downloadable ZIP', async () => {
    const jobId = new mongoose.Types.ObjectId();
    const leaseExpiresAt = new Date(Date.now() + 60_000);
    const job = {
      _id: jobId,
      attempts: 1,
      request: { contentFormat: 'json' },
      userId: null,
      leaseExpiresAt,
    };
    const filePath = path.join(exportDirectory, `${jobId.toString()}-1.zip`);

    sinon.stub(productImportController, 'createExportPayload').resolves({
      products: [{ productId: 'product-id' }],
    });
    sinon.stub(ExportJob, 'findOne').returns(createLeanQuery({
      status: 'processing',
      cancelRequested: false,
    }));
    const updateOne = sinon.stub(ExportJob, 'updateOne').resolves({ modifiedCount: 1 });

    try {
      await exportJobService.processExportJob(job);
      const archive = await fs.promises.readFile(filePath);

      expect(archive.subarray(0, 2).toString()).to.equal('PK');
      expect(updateOne.calledOnce).to.equal(true);
      expect(updateOne.firstCall.args[0]).to.deep.include({
        _id: jobId,
        status: 'processing',
        cancelRequested: false,
        leaseExpiresAt,
      });
      expect(updateOne.firstCall.args[1].$set).to.include({
        status: 'ready',
        filePath,
      });
    } finally {
      await fs.promises.unlink(filePath).catch(() => {});
    }
  });

  it('cancels a queued job and retries a failed job', async () => {
    const jobId = new mongoose.Types.ObjectId();
    const cancelledJob = {
      _id: jobId,
      status: 'cancelled',
      attempts: 0,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: new Date(),
      errorMessage: null,
    };
    const retriedJob = { ...cancelledJob, status: 'queued', finishedAt: null };
    const findOneAndUpdate = sinon.stub(ExportJob, 'findOneAndUpdate')
      .onFirstCall().resolves(cancelledJob)
      .onSecondCall().resolves(retriedJob);

    const cancelled = await exportJobService.cancelExportJob(jobId.toString());
    const retried = await exportJobService.retryExportJob(jobId.toString());

    expect(cancelled.status).to.equal('cancelled');
    expect(retried.status).to.equal('queued');
    expect(findOneAndUpdate.firstCall.args[0]).to.deep.equal({ _id: jobId.toString(), status: 'queued' });
    expect(findOneAndUpdate.secondCall.args[0]).to.deep.equal({
      _id: jobId.toString(),
      status: { $in: ['failed', 'cancelled'] },
      attempts: { $lt: 3 },
    });
  });

  it('enqueues, polls, and downloads a ready job', async () => {
    const jobId = new mongoose.Types.ObjectId();
    const filePath = path.join(exportDirectory, `${jobId.toString()}-1.zip`);
    const queuedJob = {
      _id: jobId,
      status: 'queued',
      attempts: 0,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
    };
    const readyJob = {
      ...queuedJob,
      status: 'ready',
      finishedAt: new Date(),
      filePath,
    };

    sinon.stub(ExportJob, 'create').resolves(queuedJob);
    const enqueued = await exportJobService.enqueueExportJob({
      request: { contentFormat: 'json' },
      userId: null,
    });
    expect(enqueued).to.include({ jobId: jobId.toString(), status: 'queued' });

    sinon.stub(ExportJob, 'findById').returns({ lean: async () => readyJob });
    const polled = await exportJobService.getExportJob(jobId.toString());
    expect(polled).to.include({ jobId: jobId.toString(), status: 'ready' });
    expect(polled.downloadUrl).to.equal(`/api/products/admin/export-jobs/${jobId}/download`);

    sinon.stub(ExportJob, 'findOne').returns({ lean: async () => readyJob });
    const response = { download: sinon.spy() };
    await exportJobService.downloadExportJob(jobId.toString(), response, sinon.spy());
    expect(response.download.calledOnce).to.equal(true);
    expect(response.download.firstCall.args[0]).to.equal(filePath);
    expect(response.download.firstCall.args[1]).to.equal(`products-export-${jobId}.zip`);
    expect(response.download.firstCall.args[2]).to.be.a('function');
  });
});

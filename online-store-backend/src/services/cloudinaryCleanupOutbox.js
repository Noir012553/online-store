const CloudinaryCleanupOutbox = require('../models/CloudinaryCleanupOutbox');
const { deleteFromCloudinary } = require('./cloudinaryService');

const MAX_ATTEMPTS = 8;
const LEASE_MS = 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;
let timer = null;
let isProcessing = false;

const enqueueCloudinaryCleanup = async (publicId) => {
  if (!publicId) return null;

  return CloudinaryCleanupOutbox.findOneAndUpdate(
    { publicId },
    {
      $set: { status: 'pending', nextAttemptAt: new Date(), leaseExpiresAt: null, lastError: null },
      $setOnInsert: { attempts: 0 },
    },
    { upsert: true, returnDocument: 'after' }
  );
};

const claimNextCleanup = () => {
  const now = new Date();
  return CloudinaryCleanupOutbox.findOneAndUpdate(
    {
      attempts: { $lt: MAX_ATTEMPTS },
      $or: [
        { status: 'pending', nextAttemptAt: { $lte: now } },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after', sort: { nextAttemptAt: 1 } }
  );
};

const processCloudinaryCleanupOutbox = async () => {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let entry = await claimNextCleanup();
    while (entry) {
      try {
        await deleteFromCloudinary(entry.publicId);
        await CloudinaryCleanupOutbox.updateOne(
          { _id: entry._id, status: 'processing' },
          { $set: { status: 'completed', leaseExpiresAt: null, lastError: null } }
        );
      } catch (error) {
        const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** entry.attempts);
        const status = entry.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await CloudinaryCleanupOutbox.updateOne(
          { _id: entry._id, status: 'processing' },
          {
            $set: {
              status,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(Date.now() + delay),
              lastError: error.message,
            },
          }
        );
      }
      entry = await claimNextCleanup();
    }
  } finally {
    isProcessing = false;
  }
};

const startCloudinaryCleanupWorker = () => {
  if (timer) return;
  processCloudinaryCleanupOutbox().catch((error) => console.error('[CLOUDINARY_CLEANUP_OUTBOX]', error));
  timer = setInterval(() => {
    processCloudinaryCleanupOutbox().catch((error) => console.error('[CLOUDINARY_CLEANUP_OUTBOX]', error));
  }, POLL_INTERVAL_MS);
  timer.unref();
};

module.exports = { enqueueCloudinaryCleanup, processCloudinaryCleanupOutbox, startCloudinaryCleanupWorker };

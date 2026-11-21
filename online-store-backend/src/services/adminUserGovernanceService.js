const mongoose = require('mongoose');
const User = require('../models/User');
const AdminUserGovernance = require('../models/AdminUserGovernance');
const { getMessage } = require('../i18n/messages');

const createGovernanceError = (lang, code, messageKey, statusCode) => {
  const error = new Error(getMessage(lang, messageKey));
  error.errorCode = code;
  error.statusCode = statusCode;
  error.exposeMessage = true;
  return error;
};

const ensureGovernanceRecord = async () => {
  try {
    await AdminUserGovernance.updateOne(
      { _id: 'global' },
      { $setOnInsert: { version: 0 } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
};

const withAdminMutation = async (actorId, lang, operation) => {
  await ensureGovernanceRecord();
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      await AdminUserGovernance.updateOne(
        { _id: 'global' },
        { $inc: { version: 1 } },
        { session },
      );

      const actor = await User.findOne({ _id: actorId, role: 'super-admin', isDeleted: false }).session(session);
      if (!actor) {
        throw createGovernanceError(lang, 'SUPER_ADMIN_REQUIRED', 'auth-messages.notSuperAdminAuth', 403);
      }

      result = await operation(session, actor);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const ensureAnotherSuperAdminRemains = async (user, session, lang) => {
  if (user.role !== 'super-admin' || user.isDeleted) return;
  const activeSuperAdminCount = await User.countDocuments({ role: 'super-admin', isDeleted: false }).session(session);
  if (activeSuperAdminCount <= 1) {
    throw createGovernanceError(lang, 'LAST_SUPER_ADMIN_REQUIRED', 'auth-messages.lastSuperAdminRequired', 409);
  }
};

const rejectSelfDeletion = (user, actorId, lang) => {
  if (String(user._id) === String(actorId)) {
    throw createGovernanceError(lang, 'SUPER_ADMIN_SELF_DELETION_FORBIDDEN', 'auth-messages.superAdminSelfDeletionForbidden', 403);
  }
};

const updateManagedUser = (actorId, targetId, updates, lang) => withAdminMutation(actorId, lang, async session => {
  const user = await User.findOne({ _id: targetId, isDeleted: false }).session(session);
  if (!user) return null;

  if (updates.role && updates.role !== user.role && user.role === 'super-admin') {
    if (String(user._id) === String(actorId)) {
      throw createGovernanceError(lang, 'SUPER_ADMIN_SELF_DEMOTION_FORBIDDEN', 'auth-messages.superAdminSelfDemotionForbidden', 403);
    }
    await ensureAnotherSuperAdminRemains(user, session, lang);
  }

  if (updates.username) user.username = updates.username;
  if (updates.email) user.email = updates.email;
  if (updates.role) user.role = updates.role;
  await user.save({ session });
  return user;
});

const softDeleteManagedUser = (actorId, targetId, lang) => withAdminMutation(actorId, lang, async session => {
  const user = await User.findOne({ _id: targetId }).session(session);
  if (!user) return null;
  rejectSelfDeletion(user, actorId, lang);
  await ensureAnotherSuperAdminRemains(user, session, lang);
  user.isDeleted = true;
  await user.save({ session });
  return { asset: user.profileImageAsset };
});

const hardDeleteManagedUser = (actorId, targetId, lang) => withAdminMutation(actorId, lang, async session => {
  const user = await User.findById(targetId).session(session);
  if (!user) return null;
  rejectSelfDeletion(user, actorId, lang);
  await ensureAnotherSuperAdminRemains(user, session, lang);
  const asset = user.profileImageAsset;
  await user.deleteOne({ session });
  return { asset };
});

const restoreManagedUser = (actorId, targetId, lang) => withAdminMutation(actorId, lang, async session => {
  const user = await User.findById(targetId).session(session);
  if (!user) return null;
  if (!user.isDeleted) return { alreadyActive: true, user };
  user.isDeleted = false;
  await user.save({ session });
  return { alreadyActive: false, user };
});

const createManagedUser = (actorId, userData, lang) => withAdminMutation(actorId, lang, async session => {
  const [user] = await User.create([userData], { session });
  return user;
});

module.exports = {
  updateManagedUser,
  softDeleteManagedUser,
  hardDeleteManagedUser,
  restoreManagedUser,
  createManagedUser,
};

const getStorefrontRetranslationOutcome = ({
  remainingJobs,
  sourceBlockedProducts,
  failedJobCount,
  needsReviewCount,
  stoppedForQuota,
}) => {
  const complete = remainingJobs === 0
    && sourceBlockedProducts === 0
    && failedJobCount === 0
    && needsReviewCount === 0;
  const stopReason = complete
    ? null
    : stoppedForQuota
      ? 'rate_limited'
      : sourceBlockedProducts > 0
        ? 'source_blocked'
        : needsReviewCount > 0
          ? 'needs_review'
          : failedJobCount > 0
            ? 'job_failed'
            : 'backlog_remaining';

  return {
    complete,
    mode: complete ? 'apply-complete' : 'apply-incomplete',
    stopReason,
    exitCode: complete ? 0 : stoppedForQuota ? 2 : 1,
  };
};

module.exports = { getStorefrontRetranslationOutcome };

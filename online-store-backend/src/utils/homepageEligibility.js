const buildHomepageEligibilityQuery = () => ({
  isDeleted: false,
  isPublished: true,
  image: { $type: 'string', $regex: /\S/ },
  description: { $type: 'string', $regex: /\S/ },
});

module.exports = { buildHomepageEligibilityQuery };

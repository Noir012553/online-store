const ABOUT_MEDIA = {
  team: [
    { key: 'team-1', publicId: 'laptop-store/about/team/team-1' },
    { key: 'team-2', publicId: 'laptop-store/about/team/team-2' },
    { key: 'team-3', publicId: 'laptop-store/about/team/team-3' },
    { key: 'team-4', publicId: 'laptop-store/about/team/team-4' },
  ],
  reviewers: [
    { key: 'reviewer-1', name: 'Reviewer One', publicId: 'laptop-store/about/reviewers/reviewer-1' },
    { key: 'reviewer-2', name: 'Reviewer Two', publicId: 'laptop-store/about/reviewers/reviewer-2' },
    { key: 'reviewer-3', name: 'Reviewer Three', publicId: 'laptop-store/about/reviewers/reviewer-3' },
    { key: 'reviewer-4', name: 'Reviewer Four', publicId: 'laptop-store/about/reviewers/reviewer-4' },
    { key: 'reviewer-5', name: 'Reviewer Five', publicId: 'laptop-store/about/reviewers/reviewer-5' },
    { key: 'reviewer-6', name: 'Reviewer Six', publicId: 'laptop-store/about/reviewers/reviewer-6' },
    { key: 'reviewer-7', name: 'Reviewer Seven', publicId: 'laptop-store/about/reviewers/reviewer-7' },
    { key: 'reviewer-8', name: 'Reviewer Eight', publicId: 'laptop-store/about/reviewers/reviewer-8' },
  ],
  hero: { publicId: 'laptop-store/about/hero/about-hero' },
  audio: { publicId: 'laptop-store/about/audio/about-music' },
};

const getCloudinaryDeliveryUrl = (publicId, width) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;

  const transformation = width ? `f_auto,q_auto,w_${width}` : 'f_auto,q_auto';
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/${publicId}`;
};

const getCloudinaryVideoUrl = (publicId) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;

  return `https://res.cloudinary.com/${cloudName}/video/upload/q_auto/${publicId}`;
};

const getCloudinaryVideoPosterUrl = (publicId) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;

  return `https://res.cloudinary.com/${cloudName}/video/upload/so_0,q_auto,w_1200/${publicId}.jpg`;
};

module.exports = { ABOUT_MEDIA, getCloudinaryDeliveryUrl, getCloudinaryVideoUrl, getCloudinaryVideoPosterUrl };

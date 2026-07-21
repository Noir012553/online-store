export const UI_EMOJI = {
  hotDeal: '🔥',
  featured: '⭐',
  flashDeal: '⚡',
  feature: '✓',
  descriptionMarker: '📌',
  statusPending: '⏳',
  statusWarning: '⚠️',
} as const;

export const DESCRIPTION_EMOJI = new Set([
  '✔',
  UI_EMOJI.feature,
  '✅',
  '❌',
  UI_EMOJI.statusWarning,
  UI_EMOJI.hotDeal,
  '💡',
  '📱',
  '💻',
  '🎁',
  UI_EMOJI.descriptionMarker,
]);

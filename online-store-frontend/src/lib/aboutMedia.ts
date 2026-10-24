const TEAM_FALLBACKS: Record<string, string> = {
  'team-1': 'https://manln.online/images/team/team-1.jpg',
  'team-2': 'https://manln.online/images/team/team-2.jpg',
  'team-3': 'https://manln.online/images/team/team-3.jpg',
  'team-4': 'https://manln.online/images/team/team-4.jpg',
};

const REVIEWER_FALLBACKS: Record<string, string> = {
  'reviewer-1': 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-2': 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-3': 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-4': 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-5': 'https://images.pexels.com/photos/1130626/pexels-photo-1130626.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-6': 'https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-7': 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
  'reviewer-8': 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=400&h=400&fit=crop',
};

export function getTeamFallbackUrl(key: string) {
  return TEAM_FALLBACKS[key] || null;
}

export function getReviewerFallbackUrl(src?: string | null) {
  if (!src) return null;

  const match = src.match(/\/reviewers\/(reviewer-[1-8])(?:[./?]|$)/i);
  return match ? REVIEWER_FALLBACKS[match[1].toLowerCase()] || null : null;
}

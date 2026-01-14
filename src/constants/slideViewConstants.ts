/**
 * Constants for SlideViewPage component
 */

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const CHANNEL_TYPES = ['metasearch', 'sem', 'social'] as const;

export type ChannelType = typeof CHANNEL_TYPES[number];

export const BASE_METRICS = [
  'Impressions',
  'Clicks',
  'Cost',
  'Revenue',
  'Bookings',
] as const;

export const CHANNEL_REPORT_IDS: Record<string, string> = {
  metasearch: '2eff17d0-38de-4d5d-a15b-69ad13788c92',
  sem: '3b2a0e45-33be-4eec-911e-b955b951c84e',
  social: '8c2f7db9-acbd-4c59-9593-74e8953e7787',
};

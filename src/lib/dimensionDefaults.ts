/**
 * Smart defaults for channel → main dimension mapping.
 * Used by share link creation and viewer initialization.
 */

export type Channel = 'metasearch' | 'sem' | 'social';

export interface MinimalDimension {
  id: string;
  name: string;
}

/**
 * Product-defined preferred dimension name per channel.
 * Metasearch → Hotel; SEM and Social → Account.
 */
const CHANNEL_PREFERRED_DIMENSION: Record<Channel, string> = {
  metasearch: 'Hotel',
  sem: 'Account',
  social: 'Account',
};

/**
 * Given a channel and a list of available dimensions, return the dimension
 * that best matches the product default (Hotel for metasearch, Account for sem/social).
 * Falls back to the first available dimension if no match is found.
 */
export function getChannelDefaultMainDimension(
  channel: Channel,
  availableDimensions: MinimalDimension[]
): MinimalDimension | null {
  if (availableDimensions.length === 0) return null;
  const preferred = CHANNEL_PREFERRED_DIMENSION[channel];
  return (
    availableDimensions.find(
      (d) => d.name.toLowerCase() === preferred.toLowerCase()
    ) ?? availableDimensions[0]
  );
}

/**
 * Build a channel → dimension ID map using product defaults.
 * Only includes channels for which a dimension was found.
 */
export function buildDefaultLockedDimensionsByChannel(
  dimensionsByChannel: Record<Channel, MinimalDimension[]>
): Partial<Record<Channel, string>> {
  const result: Partial<Record<Channel, string>> = {};
  for (const channel of (['metasearch', 'sem', 'social'] as Channel[])) {
    const dims = dimensionsByChannel[channel] ?? [];
    const dim = getChannelDefaultMainDimension(channel, dims);
    if (dim) result[channel] = dim.id;
  }
  return result;
}

/**
 * Collect all unique locked dimension IDs from a channel-keyed map
 * (deduplicating when SEM and Social share the same Account dimension).
 */
export function flattenLockedDimensionIds(
  lockedByChannel: Partial<Record<Channel, string>>
): string[] {
  return [...new Set(Object.values(lockedByChannel).filter(Boolean) as string[])];
}

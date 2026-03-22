import { describe, expect, it } from 'vitest';
import { inferReportChannelFromName } from '../reportChannel';

describe('inferReportChannelFromName', () => {
  it('detects metasearch before sem when both substrings appear', () => {
    expect(inferReportChannelFromName('GO Metasearch SEM')).toBe('metasearch');
  });

  it('detects sem', () => {
    expect(inferReportChannelFromName('Google SEM')).toBe('sem');
  });

  it('detects social', () => {
    expect(inferReportChannelFromName('Social Ads')).toBe('social');
  });

  it('returns null when no keyword matches', () => {
    expect(inferReportChannelFromName('Performance')).toBeNull();
    expect(inferReportChannelFromName('   ')).toBeNull();
  });
});

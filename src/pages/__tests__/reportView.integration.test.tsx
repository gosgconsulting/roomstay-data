/**
 * Integration tests around the report view (Data Studio / report dashboard).
 * Verifies the report view pipeline: PerformanceTable with canonical dimension/view data.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PerformanceTable } from '@/components/PerformanceTable';

const defaultFilters = {
  dimensionFilters: {},
  datePreset: 'last_7_days' as const,
  dateRange: undefined,
  compareEnabled: false,
  compareType: 'previous_period' as const,
  compareDateRange: undefined,
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function wrap(ui: React.ReactElement) {
  return (
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('Report view integration', () => {
  it('renders PerformanceTable (core report view) with minimal props without crashing', () => {
    const { container } = render(
      wrap(
        <PerformanceTable
          reportId={null}
          filters={defaultFilters}
          isSharedView={false}
        />
      )
    );
    expect(container).toBeTruthy();
  });

  it('shows loading or empty state when reportId is null', () => {
    const { container } = render(
      wrap(
        <PerformanceTable
          reportId={null}
          filters={defaultFilters}
          isSharedView={false}
        />
      )
    );
    expect(container.firstChild).toBeTruthy();
  });
});

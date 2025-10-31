import { render, screen, waitFor } from '@testing-library/react';
import { KPIChart } from './KPIChart';
import { supabase } from '@/integrations/supabase/client';
import { vi } from 'vitest';

// Mock the Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    functions: {
      invoke: vi.fn()
    },
    auth: {
      getUser: vi.fn()
    }
  }
}));

describe('KPIChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders loading state initially', () => {
    render(<KPIChart reportId="test-report" filters={{ dimensionFilters: {}, dateRange: null }} />);
    expect(screen.getByText('Performance Chart')).toBeInTheDocument();
  });

  test('handles empty data response', async () => {
    // Mock dimensions response
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'dimensions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ id: 'date-dim', type: 'date', name: 'Date' }],
              error: null
            })
          })
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      } as any;
    });

    // Mock edge function response with empty rows
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { rows: [] },
      error: null
    });

    render(<KPIChart reportId="test-report" filters={{ dimensionFilters: {}, dateRange: null }} />);

    await waitFor(() => {
      expect(screen.getByText('No chart data for selected date range')).toBeInTheDocument();
    });
  });

  test('handles valid data response', async () => {
    // Mock dimensions response
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'dimensions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ id: 'date-dim', type: 'date', name: 'Date' }],
              error: null
            })
          })
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      } as any;
    });

    // Mock edge function response with valid data
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        rows: [
          { name: '2023-01-01', data: { Revenue: '1000', Cost: '500' } },
          { name: '2023-01-02', data: { Revenue: '1500', Cost: '600' } }
        ]
      },
      error: null
    });

    render(<KPIChart reportId="test-report" filters={{ dimensionFilters: {}, dateRange: null }} />);

    // Wait for the chart to render (it won't have "No chart data" message)
    await waitFor(() => {
      expect(screen.queryByText('No chart data for selected date range')).not.toBeInTheDocument();
    });
  });

  test('handles error response', async () => {
    // Mock dimensions response
    vi.mocked(supabase.from).mockImplementation((table) => {
      if (table === 'dimensions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ id: 'date-dim', type: 'date', name: 'Date' }],
              error: null
            })
          })
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      } as any;
    });

    // Mock edge function error response
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('Failed to fetch data')
    });

    render(<KPIChart reportId="test-report" filters={{ dimensionFilters: {}, dateRange: null }} />);

    await waitFor(() => {
      expect(screen.getByText('No chart data for selected date range')).toBeInTheDocument();
    });
  });
});

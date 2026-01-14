/**
 * Custom hook for managing filter state in SlideViewPage
 * Consolidates filter-related state and operations
 */

import { useReducer, useCallback } from 'react';
import type { ChannelType } from '@/constants/slideViewConstants';

export interface FilterState {
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  filterValuesLoading: Record<string, Record<string, boolean>>;
  pendingFilterValues: Record<string, Record<string, string[]>>;
  filterDimensionNames: Record<string, Record<string, string>>;
}

type FilterAction =
  | {
      type: 'SET_FILTER';
      channel: string;
      dimensionId: string;
      values: string[];
    }
  | {
      type: 'SET_PENDING_FILTER';
      channel: string;
      dimensionId: string;
      values: string[];
    }
  | {
      type: 'LOAD_FILTER_VALUES';
      channel: string;
      dimensionId: string;
      values: string[];
    }
  | {
      type: 'SET_FILTER_LOADING';
      channel: string;
      dimensionId: string;
      loading: boolean;
    }
  | {
      type: 'SET_FILTER_DIMENSION_NAME';
      channel: string;
      dimensionId: string;
      name: string;
    }
  | {
      type: 'RESET_FILTERS';
      channels?: ChannelType[];
    }
  | {
      type: 'LOAD_FILTER_DIMENSION_VALUES';
      channel: string;
      dimensionId: string;
      values: string[];
    };

const initialFilterState: FilterState = {
  filterValues: {
    metasearch: {},
    sem: {},
    social: {},
  },
  filterDimensionValues: {
    metasearch: {},
    sem: {},
    social: {},
  },
  filterValuesLoading: {
    metasearch: {},
    sem: {},
    social: {},
  },
  pendingFilterValues: {
    metasearch: {},
    sem: {},
    social: {},
  },
  filterDimensionNames: {
    metasearch: {},
    sem: {},
    social: {},
  },
};

function filterReducer(
  state: FilterState,
  action: FilterAction
): FilterState {
  switch (action.type) {
    case 'SET_FILTER':
      return {
        ...state,
        filterValues: {
          ...state.filterValues,
          [action.channel]: {
            ...state.filterValues[action.channel],
            [action.dimensionId]: action.values,
          },
        },
      };

    case 'SET_PENDING_FILTER':
      return {
        ...state,
        pendingFilterValues: {
          ...state.pendingFilterValues,
          [action.channel]: {
            ...state.pendingFilterValues[action.channel],
            [action.dimensionId]: action.values,
          },
        },
      };

    case 'LOAD_FILTER_VALUES':
      return {
        ...state,
        filterDimensionValues: {
          ...state.filterDimensionValues,
          [action.channel]: {
            ...state.filterDimensionValues[action.channel],
            [action.dimensionId]: action.values,
          },
        },
      };

    case 'SET_FILTER_LOADING':
      return {
        ...state,
        filterValuesLoading: {
          ...state.filterValuesLoading,
          [action.channel]: {
            ...state.filterValuesLoading[action.channel],
            [action.dimensionId]: action.loading,
          },
        },
      };

    case 'SET_FILTER_DIMENSION_NAME':
      return {
        ...state,
        filterDimensionNames: {
          ...state.filterDimensionNames,
          [action.channel]: {
            ...state.filterDimensionNames[action.channel],
            [action.dimensionId]: action.name,
          },
        },
      };

    case 'LOAD_FILTER_DIMENSION_VALUES':
      return {
        ...state,
        filterDimensionValues: {
          ...state.filterDimensionValues,
          [action.channel]: {
            ...state.filterDimensionValues[action.channel],
            [action.dimensionId]: action.values,
          },
        },
      };

    case 'RESET_FILTERS':
      if (action.channels) {
        const resetState = { ...state };
        action.channels.forEach((channel) => {
          resetState.filterValues[channel] = {};
          resetState.filterDimensionValues[channel] = {};
          resetState.filterValuesLoading[channel] = {};
          resetState.pendingFilterValues[channel] = {};
          resetState.filterDimensionNames[channel] = {};
        });
        return resetState;
      }
      return initialFilterState;

    default:
      return state;
  }
}

/**
 * Hook for managing filter state in SlideViewPage
 */
export function useSlideViewFilters(initialState?: Partial<FilterState>) {
  const [state, dispatch] = useReducer(filterReducer, {
    ...initialFilterState,
    ...initialState,
  });

  const setFilter = useCallback(
    (channel: string, dimensionId: string, values: string[]) => {
      dispatch({ type: 'SET_FILTER', channel, dimensionId, values });
    },
    []
  );

  const setPendingFilter = useCallback(
    (channel: string, dimensionId: string, values: string[]) => {
      dispatch({ type: 'SET_PENDING_FILTER', channel, dimensionId, values });
    },
    []
  );

  const loadFilterValues = useCallback(
    (channel: string, dimensionId: string, values: string[]) => {
      dispatch({ type: 'LOAD_FILTER_VALUES', channel, dimensionId, values });
    },
    []
  );

  const setFilterLoading = useCallback(
    (channel: string, dimensionId: string, loading: boolean) => {
      dispatch({ type: 'SET_FILTER_LOADING', channel, dimensionId, loading });
    },
    []
  );

  const setFilterDimensionName = useCallback(
    (channel: string, dimensionId: string, name: string) => {
      dispatch({
        type: 'SET_FILTER_DIMENSION_NAME',
        channel,
        dimensionId,
        name,
      });
    },
    []
  );

  const loadFilterDimensionValues = useCallback(
    (channel: string, dimensionId: string, values: string[]) => {
      dispatch({
        type: 'LOAD_FILTER_DIMENSION_VALUES',
        channel,
        dimensionId,
        values,
      });
    },
    []
  );

  const resetFilters = useCallback((channels?: ChannelType[]) => {
    dispatch({ type: 'RESET_FILTERS', channels });
  }, []);

  return {
    ...state,
    setFilter,
    setPendingFilter,
    loadFilterValues,
    setFilterLoading,
    setFilterDimensionName,
    loadFilterDimensionValues,
    resetFilters,
  };
}

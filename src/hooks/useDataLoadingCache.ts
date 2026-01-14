/**
 * Hook for caching data loading results to improve performance
 * Prevents redundant database queries and expensive computations
 */

import { useRef, useCallback } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
}

/**
 * Hook for caching async data loading operations
 */
export function useDataLoadingCache<T>(
  options: CacheOptions = {}
) {
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map());
  const { ttl = 5 * 60 * 1000 } = options; // Default 5 minutes

  const get = useCallback(
    (key: string): T | null => {
      const entry = cacheRef.current.get(key);
      if (!entry) return null;

      // Check if entry is expired
      if (Date.now() - entry.timestamp > ttl) {
        cacheRef.current.delete(key);
        return null;
      }

      return entry.data;
    },
    [ttl]
  );

  const set = useCallback((key: string, data: T) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now(),
    });
  }, []);

  const clear = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  const invalidate = useCallback((key: string) => {
    cacheRef.current.delete(key);
  }, []);

  const has = useCallback(
    (key: string): boolean => {
      const entry = cacheRef.current.get(key);
      if (!entry) return false;

      // Check if entry is expired
      if (Date.now() - entry.timestamp > ttl) {
        cacheRef.current.delete(key);
        return false;
      }

      return true;
    },
    [ttl]
  );

  return {
    get,
    set,
    clear,
    invalidate,
    has,
  };
}

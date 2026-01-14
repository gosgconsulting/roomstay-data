/**
 * Hook for caching data loading results to improve performance
 * 
 * This hook provides an in-memory cache with TTL (time-to-live) support to prevent
 * redundant database queries and expensive computations. Cache entries automatically
 * expire after the specified TTL period.
 * 
 * @module useDataLoadingCache
 */

import { useRef, useCallback } from 'react';

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  /** Cached data */
  data: T;
  /** Timestamp when entry was created */
  timestamp: number;
}

/**
 * Cache configuration options
 */
interface CacheOptions {
  /** Time to live in milliseconds (default: 5 minutes) */
  ttl?: number;
}

/**
 * Cache operations interface
 */
interface CacheOperations<T> {
  /** Get cached value by key (returns null if expired or not found) */
  get: (key: string) => T | null;
  /** Set cached value with key */
  set: (key: string, data: T) => void;
  /** Clear all cache entries */
  clear: () => void;
  /** Invalidate specific cache entry */
  invalidate: (key: string) => void;
  /** Check if cache entry exists and is valid */
  has: (key: string) => boolean;
}

/**
 * Hook for caching async data loading operations
 * 
 * Provides a simple in-memory cache with automatic expiration. Useful for caching
 * expensive operations like database queries or complex computations.
 * 
 * @param options - Cache configuration options
 * @returns Cache operations object
 * 
 * @example
 * ```tsx
 * const cache = useDataLoadingCache<string[]>({ ttl: 10 * 60 * 1000 }); // 10 minutes
 * 
 * // Check cache first
 * const cached = cache.get('my-key');
 * if (cached) return cached;
 * 
 * // Load data and cache it
 * const data = await loadData();
 * cache.set('my-key', data);
 * ```
 */
export function useDataLoadingCache<T>(
  options: CacheOptions = {}
): CacheOperations<T> {
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

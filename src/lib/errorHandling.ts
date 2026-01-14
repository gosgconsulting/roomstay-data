/**
 * Standardized error handling utilities
 */

import { toast } from '@/hooks/use-toast';

/**
 * Handle errors with consistent logging and user notifications
 * @param error - The error to handle
 * @param context - Context string for logging (e.g., "fetching slide report data")
 * @param showToast - Whether to show a toast notification (default: true)
 */
export const handleError = (
  error: unknown,
  context: string,
  showToast = true
): void => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred';

  console.error(`[testing] ${context}:`, message);

  if (showToast) {
    toast({
      title: 'Error',
      description: message,
      variant: 'destructive',
    });
  }
};

/**
 * Handle errors with custom toast message
 * @param error - The error to handle
 * @param context - Context string for logging
 * @param toastTitle - Custom toast title
 * @param toastDescription - Custom toast description
 */
export const handleErrorWithCustomToast = (
  error: unknown,
  context: string,
  toastTitle: string,
  toastDescription?: string
): void => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'An unexpected error occurred';

  console.error(`[testing] ${context}:`, message);

  toast({
    title: toastTitle,
    description: toastDescription || message,
    variant: 'destructive',
  });
};

/**
 * Safely execute an async function with error handling
 * @param fn - Async function to execute
 * @param context - Context string for error logging
 * @param onError - Optional error callback
 * @returns The result of the function or null if error
 */
export const safeExecute = async <T>(
  fn: () => Promise<T>,
  context: string,
  onError?: (error: unknown) => void
): Promise<T | null> => {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context);
    if (onError) {
      onError(error);
    }
    return null;
  }
};

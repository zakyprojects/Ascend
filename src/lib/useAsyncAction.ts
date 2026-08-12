import { useState, useCallback } from 'react';

const DEFAULT_MIN_DURATION_MS = 400;

export interface UseAsyncActionOptions<T = any> {
  minDurationMs?: number;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for managing single async action loading state with a minimum duration
 * to prevent single-frame flickering on fast network responses.
 */
export function useAsyncAction<Args extends any[], ReturnType>(
  actionFn?: (...args: Args) => Promise<ReturnType>,
  options?: UseAsyncActionOptions<ReturnType>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const minDuration = options?.minDurationMs ?? DEFAULT_MIN_DURATION_MS;

  const execute = useCallback(
    async (...args: Args): Promise<ReturnType | undefined> => {
      setIsLoading(true);
      setError(null);
      const startTime = Date.now();

      try {
        if (!actionFn) {
          throw new Error('No action function provided to useAsyncAction');
        }
        const result = await actionFn(...args);
        const elapsed = Date.now() - startTime;
        if (elapsed < minDuration) {
          await new Promise((res) => setTimeout(res, minDuration - elapsed));
        }
        options?.onSuccess?.(result);
        return result;
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minDuration) {
          await new Promise((res) => setTimeout(res, minDuration - elapsed));
        }
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        options?.onError?.(errorObj);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [actionFn, minDuration, options]
  );

  /**
   * Inline helper: execute an arbitrary inline async function with minimum duration
   */
  const executeFn = useCallback(
    async <T,>(inlineFn: () => Promise<T>): Promise<T | undefined> => {
      setIsLoading(true);
      setError(null);
      const startTime = Date.now();

      try {
        const result = await inlineFn();
        const elapsed = Date.now() - startTime;
        if (elapsed < minDuration) {
          await new Promise((res) => setTimeout(res, minDuration - elapsed));
        }
        return result;
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        if (elapsed < minDuration) {
          await new Promise((res) => setTimeout(res, minDuration - elapsed));
        }
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [minDuration]
  );

  return {
    isLoading,
    error,
    execute,
    executeFn,
    setIsLoading,
    resetError: () => setError(null),
  };
}

/**
 * Hook for managing key-based async actions (e.g. actions on individual items in a list)
 */
export function useAsyncActionKey(defaultMinDurationMs = DEFAULT_MIN_DURATION_MS) {
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const [errorMap, setErrorMap] = useState<Record<string, Error>>({});

  const isKeyLoading = useCallback(
    (key: string) => loadingKeys.has(key),
    [loadingKeys]
  );

  const executeWithKey = useCallback(
    async <T,>(key: string, asyncFn: () => Promise<T>): Promise<T | undefined> => {
      setLoadingKeys((prev) => new Set(prev).add(key));
      setErrorMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      const startTime = Date.now();

      try {
        const result = await asyncFn();
        const elapsed = Date.now() - startTime;
        if (elapsed < defaultMinDurationMs) {
          await new Promise((res) => setTimeout(res, defaultMinDurationMs - elapsed));
        }
        return result;
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        if (elapsed < defaultMinDurationMs) {
          await new Promise((res) => setTimeout(res, defaultMinDurationMs - elapsed));
        }
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setErrorMap((prev) => ({ ...prev, [key]: errorObj }));
        throw err;
      } finally {
        setLoadingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [defaultMinDurationMs]
  );

  return {
    isKeyLoading,
    executeWithKey,
    hasAnyLoading: loadingKeys.size > 0,
    loadingKeys,
    errorMap,
  };
}

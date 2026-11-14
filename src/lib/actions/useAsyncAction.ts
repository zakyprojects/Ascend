import { useState, useCallback } from 'react';

export interface UseAsyncActionOptions<T = any> {
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for managing single async action loading state. Loading lasts exactly as
 * long as the real work: no artificial minimum.
 */
export function useAsyncAction<Args extends any[], ReturnType>(
  actionFn?: (...args: Args) => Promise<ReturnType>,
  options?: UseAsyncActionOptions<ReturnType>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: Args): Promise<ReturnType | undefined> => {
      setIsLoading(true);
      setError(null);

      try {
        if (!actionFn) {
          throw new Error('No action function provided to useAsyncAction');
        }
        const result = await actionFn(...args);
        options?.onSuccess?.(result);
        return result;
      } catch (err: any) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        options?.onError?.(errorObj);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [actionFn, options]
  );

  /**
   * Inline helper: execute an arbitrary inline async function
   */
  const executeFn = useCallback(
    async <T,>(inlineFn: () => Promise<T>): Promise<T | undefined> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await inlineFn();
        return result;
      } catch (err: any) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        setError(errorObj);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
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
export function useAsyncActionKey() {
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

      try {
        const result = await asyncFn();
        return result;
      } catch (err: any) {
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
    []
  );

  return {
    isKeyLoading,
    executeWithKey,
    hasAnyLoading: loadingKeys.size > 0,
    loadingKeys,
    errorMap,
  };
}

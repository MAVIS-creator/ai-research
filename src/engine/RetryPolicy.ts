import { RetryPolicy } from '../types';

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  initialIntervalMs: 200,
  maxIntervalMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
};

export class RetryEvaluator {
  /**
   * Calculate delay for the next retry attempt using exponential backoff with full jitter.
   */
  public static calculateDelay(policy: RetryPolicy, attempt: number): number {
    const { initialIntervalMs, maxIntervalMs, backoffMultiplier, jitter } = policy;
    
    // Exponential calculation: initial * (multiplier ^ (attempt - 1))
    const rawDelay = initialIntervalMs * Math.pow(backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(rawDelay, maxIntervalMs);

    if (!jitter) {
      return cappedDelay;
    }

    // Full jitter: random uniform between 0 and cappedDelay
    // Prevents thundering herd problems across distributed workers
    return Math.floor(Math.random() * cappedDelay);
  }

  /**
   * Check if a step should be retried based on current attempt count and error type.
   */
  public static shouldRetry(policy: RetryPolicy, attempt: number, error: Error): boolean {
    if (attempt >= policy.maxAttempts) {
      return false;
    }

    if (policy.retryableErrors && policy.retryableErrors.length > 0) {
      const errorMsg = error.message || '';
      const errorName = error.name || '';
      return policy.retryableErrors.some(
        err => errorMsg.includes(err) || errorName.includes(err)
      );
    }

    return true;
  }
}

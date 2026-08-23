import { Request, Response, NextFunction } from 'express';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private maxTokens: number;
  private refillRatePerSec: number;

  constructor(maxTokens = 100, refillRatePerSec = 20) {
    this.maxTokens = maxTokens;
    this.refillRatePerSec = refillRatePerSec;
  }

  public middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientId = req.user?.id || req.ip || 'anonymous';
      const now = Date.now();

      let bucket = this.buckets.get(clientId);
      if (!bucket) {
        bucket = { tokens: this.maxTokens, lastRefill: now };
        this.buckets.set(clientId, bucket);
      }

      // Refill tokens
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsedSec * this.refillRatePerSec);
      bucket.lastRefill = now;

      if (bucket.tokens < 1) {
        res.setHeader('Retry-After', '1');
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please throttle your workflow triggers.',
        });
      }

      bucket.tokens -= 1;
      res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens).toString());
      next();
    };
  }
}

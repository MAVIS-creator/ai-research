export class GuardrailPolicy {
  private static PII_PATTERNS = [
    { name: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },
    { name: 'SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
    { name: 'CREDIT_CARD', regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g, replacement: '[REDACTED_CC]' },
    { name: 'AWS_KEY', regex: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED_AWS_KEY]' },
    { name: 'BEARER_TOKEN', regex: /Bearer\s+[a-zA-Z0-9_.-]{24,}/gi, replacement: 'Bearer [REDACTED_TOKEN]' },
    { name: 'API_SECRET', regex: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{16,})["']?/gi, replacement: 'secret=[REDACTED_SECRET]' },
  ];

  /**
   * Redact sensitive PII and secret patterns from text or JSON objects.
   */
  public static maskPII(input: any): any {
    if (typeof input === 'string') {
      let sanitized = input;
      for (const pattern of this.PII_PATTERNS) {
        sanitized = sanitized.replace(pattern.regex, pattern.replacement);
      }
      return sanitized;
    }

    if (Array.isArray(input)) {
      return input.map(item => this.maskPII(item));
    }

    if (input !== null && typeof input === 'object') {
      const sanitizedObj: Record<string, any> = {};
      for (const [key, val] of Object.entries(input)) {
        if (/password|secret|token|apiKey|creditCard/i.test(key)) {
          sanitizedObj[key] = '[REDACTED_FIELD]';
        } else {
          sanitizedObj[key] = this.maskPII(val);
        }
      }
      return sanitizedObj;
    }

    return input;
  }

  /**
   * Validate safety of agent tool parameters to prevent injection attacks.
   */
  public static validateSafety(toolName: string, params: any): { isSafe: boolean; reason?: string } {
    const stringified = JSON.stringify(params || {});

    // Check for dangerous system calls or path traversals
    if (/\.\.\/|\.\.\\/g.test(stringified)) {
      return { isSafe: false, reason: 'Path traversal sequence detected in parameters' };
    }

    if (toolName === 'code_sandbox') {
      if (/process\.exit|require\(['"]child_process|fs\.unlinkSync|eval\(|document\.cookie/i.test(stringified)) {
        return { isSafe: false, reason: 'Disallowed system command or module access in sandbox code' };
      }
    }

    return { isSafe: true };
  }

  /**
   * Calculate rough token count for prompt text (heuristic: ~4 chars per token).
   */
  public static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.8);
  }
}

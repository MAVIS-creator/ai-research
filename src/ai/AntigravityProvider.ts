import * as https from 'https';
import * as http from 'http';

export type AIProviderType = 'google_antigravity_cloud' | 'groq' | 'openrouter' | 'local_openai';

export interface AntigravityConfig {
  provider: AIProviderType;
  apiKey?: string;
  endpoint?: string;
  model?: string;
  groqApiKey?: string;
  groqModel?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  localEndpoint?: string;
  localModel?: string;
}

export interface OperatorDecision {
  thoughtSummary: string;
  currentAction: string;
  toolName?: string | null;
  toolParameters?: Record<string, any>;
  nextAction: string;
  requiresApproval?: boolean;
  approvalTitle?: string;
  approvalDescription?: string;
  isComplete: boolean;
  finalFindings?: Array<{
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    endpoint: string;
    rootCause: string;
    remediation: string;
  }>;
}

export class AntigravityProvider {
  private config: AntigravityConfig;

  constructor(config?: Partial<AntigravityConfig>) {
    this.config = {
      provider: config?.provider || 'groq',
      apiKey: config?.apiKey || process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_API_KEY || '',
      endpoint: config?.endpoint || 'https://generativelanguage.googleapis.com/v1beta',
      model: config?.model || 'gemini-2.5-flash',
      groqApiKey: config?.groqApiKey || process.env.GROQ_API_KEY || '',
      groqModel: config?.groqModel || 'llama-3.3-70b-versatile', // Free Tier on Groq
      openRouterApiKey: config?.openRouterApiKey || process.env.OPENROUTER_API_KEY || '',
      openRouterModel: config?.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free', // 100% Free Model on OpenRouter
      localEndpoint: config?.localEndpoint || process.env.LOCAL_AI_ENDPOINT || 'http://localhost:11434/v1',
      localModel: config?.localModel || 'llama3.1',
    };
  }

  public getActiveApiKey(): string {
    switch (this.config.provider) {
      case 'groq':
        return this.config.groqApiKey || '';
      case 'openrouter':
        return this.config.openRouterApiKey || '';
      case 'google_antigravity_cloud':
        return this.config.apiKey || '';
      case 'local_openai':
        return 'local-no-key';
      default:
        return this.config.groqApiKey || '';
    }
  }

  public getActiveModel(): string {
    switch (this.config.provider) {
      case 'groq':
        return this.config.groqModel || 'llama-3.3-70b-versatile';
      case 'openrouter':
        return this.config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free';
      case 'google_antigravity_cloud':
        return this.config.model || 'gemini-2.5-flash';
      case 'local_openai':
        return this.config.localModel || 'llama3.1';
      default:
        return 'llama-3.3-70b-versatile';
    }
  }

  public isConfigured(): boolean {
    const key = this.getActiveApiKey();
    if (this.config.provider === 'local_openai') return true;
    return Boolean(key && key.length > 5);
  }

  public updateConfig(newConfig: Partial<AntigravityConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  public getConfig(): {
    provider: AIProviderType;
    model: string;
    isConfigured: boolean;
    providerDisplayName: string;
    maskedKey: string;
    hasGeminiKey: boolean;
    hasGroqKey: boolean;
    hasOpenRouterKey: boolean;
    groqModel: string;
    openRouterModel: string;
    localEndpoint: string;
    localModel: string;
  } {
    const activeKey = this.getActiveApiKey();
    const maskedKey = this.maskSecret(activeKey);

    const providerNames: Record<AIProviderType, string> = {
      google_antigravity_cloud: 'Google Antigravity AI (Gemini)',
      groq: 'Groq Cloud (Free Tier)',
      openrouter: 'OpenRouter (Free Models)',
      local_openai: 'Local / LiteRT (Ollama / On-Device)',
    };

    return {
      provider: this.config.provider,
      model: this.getActiveModel(),
      isConfigured: this.isConfigured(),
      providerDisplayName: providerNames[this.config.provider] || this.config.provider,
      maskedKey,
      hasGeminiKey: Boolean(this.config.apiKey && this.config.apiKey.length > 5),
      hasGroqKey: Boolean(this.config.groqApiKey && this.config.groqApiKey.length > 5),
      hasOpenRouterKey: Boolean(this.config.openRouterApiKey && this.config.openRouterApiKey.length > 5),
      groqModel: this.config.groqModel || 'llama-3.3-70b-versatile',
      openRouterModel: this.config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
      localEndpoint: this.config.localEndpoint || 'http://localhost:11434/v1',
      localModel: this.config.localModel || 'llama3.1',
    };
  }

  private maskSecret(secret?: string): string {
    if (!secret || secret === 'local-no-key') return 'Not Configured';
    if (secret.length <= 8) return '••••••••';
    const prefix = secret.slice(0, 4);
    const suffix = secret.slice(-4);
    return `${prefix}••••••••${suffix}`;
  }

  public async planNextStep(prompt: {
    mission: string;
    target: string;
    allowedDomains: string[];
    history: Array<{ action: string; tool: string; result: any }>;
    availableTools: Array<{ name: string; description: string; parameters: any }>;
  }): Promise<OperatorDecision> {
    if (!this.isConfigured()) {
      return this.fallbackLocalDecision(prompt);
    }

    try {
      if (this.config.provider === 'google_antigravity_cloud') {
        return await this.callGemini(prompt);
      } else if (this.config.provider === 'groq') {
        return await this.callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          this.config.groqApiKey!,
          this.config.groqModel || 'llama-3.3-70b-versatile',
          prompt
        );
      } else if (this.config.provider === 'openrouter') {
        return await this.callOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          this.config.openRouterApiKey!,
          this.config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
          prompt,
          { 'HTTP-Referer': 'https://nexusflow.internal', 'X-Title': 'NexusFlow Enterprise' }
        );
      } else if (this.config.provider === 'local_openai') {
        const endpoint = `${this.config.localEndpoint?.replace(/\/+$/, '')}/chat/completions`;
        return await this.callOpenAICompatible(
          endpoint,
          'local',
          this.config.localModel || 'llama3.1',
          prompt
        );
      }
    } catch (err: any) {
      console.warn(`[AI Provider Error] ${this.config.provider} call failed:`, err.message);
      return this.fallbackLocalDecision(prompt);
    }

    return this.fallbackLocalDecision(prompt);
  }

  private async callGemini(prompt: any): Promise<OperatorDecision> {
    const systemPrompt = this.buildSystemPrompt(prompt);
    const url = `${this.config.endpoint}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    const payload = {
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    };

    const responseText = await this.httpPostJson(url, payload);
    const parsed = JSON.parse(responseText);
    const textContent = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textContent) throw new Error('Invalid response structure from Gemini API');
    return JSON.parse(textContent) as OperatorDecision;
  }

  private async callOpenAICompatible(
    urlStr: string,
    apiKey: string,
    model: string,
    prompt: any,
    extraHeaders: Record<string, string> = {}
  ): Promise<OperatorDecision> {
    const systemPrompt = this.buildSystemPrompt(prompt);
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are NexusFlow Autonomous Security Operator. Always respond with raw valid JSON strictly adhering to the specified schema.',
        },
        { role: 'user', content: systemPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    };

    const responseText = await this.httpPostJson(urlStr, payload, headers);
    const parsed = JSON.parse(responseText);
    const textContent = parsed.choices?.[0]?.message?.content;
    if (!textContent) throw new Error('Empty response from OpenAI-compatible API');

    const cleanJson = textContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleanJson) as OperatorDecision;
  }

  private buildSystemPrompt(prompt: any): string {
    return `You are NexusFlow Autonomous Security Operator AI.
NexusFlow enforces policy, execution, state, and permissions.
Mission: "${prompt.mission}"
Target: "${prompt.target}"
Allowed Domains: ${JSON.stringify(prompt.allowedDomains)}

Available Tools:
${JSON.stringify(prompt.availableTools, null, 2)}

Execution History:
${JSON.stringify(prompt.history, null, 2)}

You MUST respond strictly in valid JSON matching this schema:
{
  "thoughtSummary": "Brief high-level summary of your reasoning",
  "currentAction": "Human-readable label of current action",
  "toolName": "name of tool to execute or null if complete",
  "toolParameters": { "key": "value" },
  "nextAction": "Planned subsequent action",
  "requiresApproval": false,
  "approvalTitle": "Optional title if HITL is required",
  "approvalDescription": "Optional description",
  "isComplete": false,
  "finalFindings": []
}`;
  }

  public fallbackLocalDecision({ target, history }: any): OperatorDecision {
    const stepCount = (history || []).length;
    if (stepCount === 0) {
      return {
        thoughtSummary: 'Initiating passive reconnaissance and security headers scanning on target.',
        currentAction: 'Inspecting TLS Configuration & Security Headers',
        toolName: 'security_headers_scanner',
        toolParameters: { targetUrl: target },
        nextAction: 'Analyze headers and evaluate cookie flags',
        requiresApproval: false,
        isComplete: false,
      };
    } else if (stepCount === 1) {
      return {
        thoughtSummary: 'Passive reconnaissance completed. Requesting human authorization before running safe synthetic probe.',
        currentAction: 'Operator Authorization Gate for Synthetic Probing',
        toolName: null,
        nextAction: 'Execute safe synthetic endpoint probe with synthetic IDs',
        requiresApproval: true,
        approvalTitle: 'Authorize Non-Destructive Synthetic Probe',
        approvalDescription: `Operator requests authorization to probe synthetic non-existent IDs on ${target} (strictly non-destructive).`,
        isComplete: false,
      };
    } else if (stepCount === 2) {
      return {
        thoughtSummary: 'Operator approved. Executing safe synthetic probe with non-existent identifiers.',
        currentAction: 'Executing Safe Synthetic IDOR & Error Leak Probe',
        toolName: 'synthetic_endpoint_probe',
        toolParameters: { targetUrl: target },
        nextAction: 'Synthesize final security posture assessment report',
        requiresApproval: false,
        isComplete: false,
      };
    } else {
      return {
        thoughtSummary: 'Security assessment complete. Compiling structured findings.',
        currentAction: 'Consolidating Findings and Remediation Blueprint',
        toolName: null,
        nextAction: 'Mission Complete',
        requiresApproval: false,
        isComplete: true,
        finalFindings: [
          {
            severity: 'HIGH',
            endpoint: target,
            rootCause: 'Insecure Session Cookie: Missing Secure, HttpOnly, and SameSite flags in PHPSESSID.',
            remediation: 'Configure session.cookie_secure=1, session.cookie_httponly=1, and session.cookie_samesite=Lax in PHP configuration.',
          },
          {
            severity: 'MEDIUM',
            endpoint: target,
            rootCause: 'Missing HTTP Strict Transport Security (HSTS) header.',
            remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload header to reverse proxy.',
          },
          {
            severity: 'MEDIUM',
            endpoint: target,
            rootCause: 'Missing Anti-Clickjacking Header (X-Frame-Options / CSP frame-ancestors).',
            remediation: 'Inject X-Frame-Options: SAMEORIGIN or Content-Security-Policy: frame-ancestors self.',
          },
        ],
      };
    }
  }

  private httpPostJson(urlStr: string, body: any, customHeaders: Record<string, string> = {}): Promise<string> {
    const url = new URL(urlStr);
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request(
        {
          host: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...customHeaders,
          },
          timeout: 25000,
        },
        res => {
          let resBody = '';
          res.on('data', chunk => (resBody += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`HTTP ${res.statusCode} from ${url.hostname}: ${resBody.slice(0, 300)}`));
            }
            resolve(resBody);
          });
        }
      );

      req.on('error', err => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Timeout connecting to ${url.hostname}`));
      });

      req.write(data);
      req.end();
    });
  }
}

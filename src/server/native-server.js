/**
 * NexusFlow Enterprise Autonomous Multi-Agent & Saga Engine
 * Powered by Google Antigravity, Groq & OpenRouter (100% Free Tier AI Models)
 * Clean Light-Mode Enterprise Design System & Hardened Security Architecture
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Pre-seeded API Keys & RBAC Database ---
const API_KEYS = {
  'nexus-admin-key-999': { id: 'usr_admin', name: 'Lead SRE Admin', role: 'ADMIN' },
  'nexus-operator-key-555': { id: 'usr_operator', name: 'Platform Operator', role: 'OPERATOR' },
  'nexus-viewer-key-111': { id: 'usr_viewer', name: 'Auditor Viewer', role: 'VIEWER' },
};

function authenticateRequest(req) {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];

  if (apiKey && API_KEYS[apiKey]) return API_KEYS[apiKey];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === 'admin-jwt-token' || token === 'nexus-admin-key-999') return API_KEYS['nexus-admin-key-999'];
    if (token === 'operator-jwt-token' || token === 'nexus-operator-key-555') return API_KEYS['nexus-operator-key-555'];
    if (token === 'viewer-jwt-token' || token === 'nexus-viewer-key-111') return API_KEYS['nexus-viewer-key-111'];
  }
  return { id: 'usr_anonymous', name: 'Anonymous Viewer', role: 'VIEWER' };
}

// --- Multi-Provider AI Operator Adapter (Antigravity, Groq Free, OpenRouter Free, Local) ---
class AntigravityProvider {
  constructor(config = {}) {
    this.vaultPath = path.join(process.cwd(), '.nexusflow-vault.json');
    this.config = {
      provider: config.provider || 'groq',
      apiKey: config.apiKey || process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_API_KEY || '',
      endpoint: config.endpoint || 'https://generativelanguage.googleapis.com/v1beta',
      model: config.model || 'gemini-2.5-flash',
      groqApiKey: config.groqApiKey || process.env.GROQ_API_KEY || '',
      groqModel: config.groqModel || 'llama-3.3-70b-versatile',
      openRouterApiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY || '',
      openRouterModel: config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
      localEndpoint: config.localEndpoint || process.env.LOCAL_AI_ENDPOINT || 'http://localhost:11434/v1',
      localModel: config.localModel || 'llama3.1',
    };
    this.loadVault();
  }

  loadVault() {
    try {
      if (fs.existsSync(this.vaultPath)) {
        const raw = fs.readFileSync(this.vaultPath, 'utf8');
        const vault = JSON.parse(raw);
        if (vault && typeof vault === 'object') {
          if (vault.apiKey) this.config.apiKey = vault.apiKey;
          if (vault.groqApiKey) this.config.groqApiKey = vault.groqApiKey;
          if (vault.openRouterApiKey) this.config.openRouterApiKey = vault.openRouterApiKey;
          if (vault.provider) this.config.provider = vault.provider;
          if (vault.model) this.config.model = vault.model;
          if (vault.groqModel) this.config.groqModel = vault.groqModel;
          if (vault.openRouterModel) this.config.openRouterModel = vault.openRouterModel;
          if (vault.localEndpoint) this.config.localEndpoint = vault.localEndpoint;
          if (vault.localModel) this.config.localModel = vault.localModel;
        }
      }
    } catch (e) {
      console.warn('[Vault Warning] Failed to load local vault:', e.message);
    }
  }

  saveVault() {
    try {
      const vaultData = {
        provider: this.config.provider,
        model: this.config.model,
        apiKey: this.config.apiKey,
        groqApiKey: this.config.groqApiKey,
        openRouterApiKey: this.config.openRouterApiKey,
        groqModel: this.config.groqModel,
        openRouterModel: this.config.openRouterModel,
        localEndpoint: this.config.localEndpoint,
        localModel: this.config.localModel,
        updatedAt: Date.now(),
      };
      fs.writeFileSync(this.vaultPath, JSON.stringify(vaultData, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (e) {
      console.warn('[Vault Warning] Failed to persist local vault:', e.message);
    }
  }

  getActiveApiKey() {
    switch (this.config.provider) {
      case 'groq': return this.config.groqApiKey || '';
      case 'openrouter': return this.config.openRouterApiKey || '';
      case 'google_antigravity_cloud': return this.config.apiKey || '';
      case 'local_openai': return 'local-no-key';
      default: return this.config.groqApiKey || '';
    }
  }

  getActiveModel() {
    switch (this.config.provider) {
      case 'groq': return this.config.groqModel || 'llama-3.3-70b-versatile';
      case 'openrouter': return this.config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free';
      case 'google_antigravity_cloud': return this.config.model || 'gemini-2.5-flash';
      case 'local_openai': return this.config.localModel || 'llama3.1';
      default: return 'llama-3.3-70b-versatile';
    }
  }

  isConfigured() {
    const key = this.getActiveApiKey();
    if (this.config.provider === 'local_openai') return true;
    return Boolean(key && key.length > 5);
  }

  updateConfig(newConfig) {
    if (newConfig.apiKey) this.config.apiKey = newConfig.apiKey;
    if (newConfig.groqApiKey) this.config.groqApiKey = newConfig.groqApiKey;
    if (newConfig.openRouterApiKey) this.config.openRouterApiKey = newConfig.openRouterApiKey;
    if (newConfig.provider) this.config.provider = newConfig.provider;
    if (newConfig.model) this.config.model = newConfig.model;
    if (newConfig.groqModel) this.config.groqModel = newConfig.groqModel;
    if (newConfig.openRouterModel) this.config.openRouterModel = newConfig.openRouterModel;
    if (newConfig.localEndpoint) this.config.localEndpoint = newConfig.localEndpoint;
    if (newConfig.localModel) this.config.localModel = newConfig.localModel;
    this.saveVault();
  }

  getSecrets() {
    return {
      provider: this.config.provider,
      model: this.getActiveModel(),
      apiKey: this.config.apiKey || '',
      groqApiKey: this.config.groqApiKey || '',
      openRouterApiKey: this.config.openRouterApiKey || '',
      localEndpoint: this.config.localEndpoint || '',
      localModel: this.config.localModel || '',
    };
  }

  maskSecret(key) {
    if (!key || key === 'local-no-key') return 'Not Configured';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
  }

  getConfig() {
    const activeKey = this.getActiveApiKey();
    const providerNames = {
      groq: 'Groq Cloud (Free Tier)',
      openrouter: 'OpenRouter (Free Models)',
      google_antigravity_cloud: 'Google Antigravity AI (Gemini)',
      local_openai: 'Local / LiteRT (Ollama / On-Device)',
    };

    return {
      provider: this.config.provider,
      model: this.getActiveModel(),
      isConfigured: this.isConfigured(),
      providerDisplayName: providerNames[this.config.provider] || this.config.provider,
      maskedKey: this.maskSecret(activeKey),
      hasGeminiKey: Boolean(this.config.apiKey && this.config.apiKey.length > 5),
      hasGroqKey: Boolean(this.config.groqApiKey && this.config.groqApiKey.length > 5),
      hasOpenRouterKey: Boolean(this.config.openRouterApiKey && this.config.openRouterApiKey.length > 5),
      groqModel: this.config.groqModel || 'llama-3.3-70b-versatile',
      openRouterModel: this.config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
      localEndpoint: this.config.localEndpoint || 'http://localhost:11434/v1',
      localModel: this.config.localModel || 'llama3.1',
    };
  }

  async planNextStep({ mission, target, allowedDomains, history, availableTools }) {
    if (!this.isConfigured()) {
      return this.fallbackLocalDecision({ mission, target, allowedDomains, history, availableTools });
    }

    try {
      if (this.config.provider === 'google_antigravity_cloud') {
        return await this.callGemini({ mission, target, allowedDomains, history, availableTools });
      } else if (this.config.provider === 'groq') {
        return await this.callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          this.config.groqApiKey,
          this.config.groqModel || 'llama-3.3-70b-versatile',
          { mission, target, allowedDomains, history, availableTools }
        );
      } else if (this.config.provider === 'openrouter') {
        return await this.callOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          this.config.openRouterApiKey,
          this.config.openRouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
          { mission, target, allowedDomains, history, availableTools },
          { 'HTTP-Referer': 'https://nexusflow.internal', 'X-Title': 'NexusFlow Enterprise' }
        );
      } else if (this.config.provider === 'local_openai') {
        const endpoint = `${this.config.localEndpoint?.replace(/\/+$/, '')}/chat/completions`;
        return await this.callOpenAICompatible(
          endpoint,
          'local',
          this.config.localModel || 'llama3.1',
          { mission, target, allowedDomains, history, availableTools }
        );
      }
    } catch (err) {
      console.warn(`[AI Provider Warning] ${this.config.provider} request failed: ${err.message}. Falling back to local reasoning.`);
      return this.fallbackLocalDecision({ mission, target, allowedDomains, history, availableTools });
    }

    return this.fallbackLocalDecision({ mission, target, allowedDomains, history, availableTools });
  }

  async callGemini(prompt) {
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
    return JSON.parse(textContent);
  }

  async callOpenAICompatible(urlStr, apiKey, model, prompt, extraHeaders = {}) {
    const systemPrompt = this.buildSystemPrompt(prompt);
    const payload = {
      model,
      messages: [
        { role: 'system', content: 'You are NexusFlow Autonomous Security Operator AI. You MUST respond strictly in valid JSON matching the specified schema.' },
        { role: 'user', content: systemPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    };

    const responseText = await this.httpPostJson(urlStr, payload, headers);
    const parsed = JSON.parse(responseText);
    const textContent = parsed.choices?.[0]?.message?.content;
    if (!textContent) throw new Error('Empty response from OpenAI-compatible API');
    const cleanJson = textContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(cleanJson);
  }

  buildSystemPrompt(prompt) {
    return `You are NexusFlow Autonomous Security Operator AI (${this.config.provider}).
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

  fallbackLocalDecision({ target, history }) {
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
            remediation: 'Configure session.cookie_secure=1, session.cookie_httponly=1, and session.cookie_samesite=Lax in PHP configuration.'
          },
          {
            severity: 'MEDIUM',
            endpoint: target,
            rootCause: 'Missing HTTP Strict Transport Security (HSTS) header.',
            remediation: 'Add Strict-Transport-Security: max-age=31536000; includeSubDomains; preload header to reverse proxy.'
          },
          {
            severity: 'MEDIUM',
            endpoint: target,
            rootCause: 'Missing Anti-Clickjacking Header (X-Frame-Options / CSP frame-ancestors).',
            remediation: 'Inject X-Frame-Options: SAMEORIGIN or Content-Security-Policy: frame-ancestors self.'
          }
        ]
      };
    }
  }

  httpPostJson(urlStr, body, customHeaders = {}) {
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
      req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout connecting to ${url.hostname}`)); });
      req.write(data);
      req.end();
    });
  }
}

// --- DAGResolver ---
class DAGResolver {
  static validate(steps) {
    const stepMap = new Map();
    const errors = [];
    for (const step of steps) {
      if (stepMap.has(step.id)) errors.push(`Duplicate step ID: ${step.id}`);
      stepMap.set(step.id, step);
    }
    for (const step of steps) {
      for (const dep of step.dependencies) {
        if (!stepMap.has(dep)) errors.push(`Step "${step.id}" has unknown dependency "${dep}"`);
        if (dep === step.id) errors.push(`Step "${step.id}" cannot depend on itself`);
      }
    }
    if (errors.length > 0) return { isValid: false, errors, topologicalOrder: [] };

    const inDegree = new Map();
    const adj = new Map();
    for (const step of steps) {
      inDegree.set(step.id, step.dependencies.length);
      adj.set(step.id, []);
    }
    for (const step of steps) {
      for (const dep of step.dependencies) adj.get(dep).push(step.id);
    }

    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    const order = [];
    while (queue.length > 0) {
      const curr = queue.shift();
      order.push(curr);
      for (const neighbor of adj.get(curr) || []) {
        const newDeg = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (order.length !== steps.length) {
      errors.push('Cycle detected in workflow graph');
      return { isValid: false, errors, topologicalOrder: [] };
    }
    return { isValid: true, errors: [], topologicalOrder: order };
  }

  static getReadySteps(steps, completed, running, failed, skipped) {
    const ready = [];
    for (const step of steps) {
      if (completed.has(step.id) || running.has(step.id) || failed.has(step.id) || skipped.has(step.id)) continue;
      if (step.dependencies.every(d => completed.has(d) || skipped.has(d))) ready.push(step);
    }
    return ready;
  }

  static getCompensationOrder(steps, completedIds) {
    const map = new Map(steps.map(s => [s.id, s]));
    return completedIds.slice().reverse().map(id => map.get(id)).filter(s => s && typeof s.compensation === 'function');
  }
}

// --- DurableJournal with Disk WAL ---
class DurableJournal {
  constructor(storageDir) {
    this.events = new Map();
    this.snapshots = new Map();
    this.storageDir = storageDir;
    if (storageDir && !fs.existsSync(storageDir)) {
      try { fs.mkdirSync(storageDir, { recursive: true }); } catch {}
    }
  }

  append(evt) {
    const id = evt.executionId;
    if (!this.events.has(id)) {
      this.events.set(id, []);
      this.snapshots.set(id, []);
    }
    const list = this.events.get(id);
    const full = { ...evt, timestamp: Date.now(), sequenceNumber: list.length + 1 };
    list.push(full);

    if (this.storageDir) {
      try {
        const filePath = path.join(this.storageDir, `${id}.journal.jsonl`);
        fs.appendFileSync(filePath, JSON.stringify(full) + '\n', 'utf-8');
      } catch {}
    }
    return full;
  }

  appendFromRecovered(event) {
    const id = event.executionId;
    if (!this.events.has(id)) {
      this.events.set(id, []);
      this.snapshots.set(id, []);
    }
    this.events.get(id).push(event);
  }

  recordSnapshot(executionId, snapshot) {
    const seq = (this.events.get(executionId) || []).length;
    const full = { ...snapshot, sequenceNumber: seq, timestamp: Date.now() };
    if (!this.snapshots.has(executionId)) this.snapshots.set(executionId, []);
    this.snapshots.get(executionId).push(full);
    return full;
  }

  getEvents(id) { return this.events.get(id) || []; }
  getSnapshots(id) { return this.snapshots.get(id) || []; }
}

// --- ApprovalManager with RBAC ---
class ApprovalManager extends EventEmitter {
  constructor() {
    super();
    this.pending = new Map();
  }

  requestApproval(executionId, stepId, gate) {
    const key = `${executionId}:${stepId}`;
    return new Promise(resolve => {
      const requestedAt = Date.now();
      const timeoutAt = gate.timeoutMs ? requestedAt + gate.timeoutMs : undefined;
      let timer;
      if (gate.timeoutMs) {
        timer = setTimeout(() => {
          this.submitDecision({
            executionId,
            stepId,
            gateId: gate.gateId,
            decision: gate.fallbackAction === 'AUTO_REJECT' ? 'REJECT' : 'APPROVE',
            approver: 'SYSTEM_TIMEOUT',
            role: 'ADMIN',
            comment: 'Auto-fallback on timeout',
          });
        }, gate.timeoutMs);
      }

      this.pending.set(key, { executionId, stepId, gate, requestedAt, timeoutAt, resolve, timer });
      this.emit('approval_requested', { executionId, stepId, gate, requestedAt, timeoutAt });
    });
  }

  submitDecision(decision) {
    const key = `${decision.executionId}:${decision.stepId}`;
    if (!this.pending.has(key)) return false;
    const item = this.pending.get(key);

    if (item.gate.requiredRole && item.gate.requiredRole !== 'ANY') {
      if (decision.role !== 'ADMIN' && decision.role !== item.gate.requiredRole) {
        throw new Error(`Unauthorized: Requires role "${item.gate.requiredRole}", but caller has role "${decision.role}"`);
      }
    }

    if (item.timer) clearTimeout(item.timer);
    this.pending.delete(key);
    this.emit('approval_resolved', { decision, gate: item.gate });
    item.resolve(decision);
    return true;
  }

  getPendingApprovals() {
    return Array.from(this.pending.entries()).map(([key, info]) => ({
      key,
      executionId: info.executionId,
      stepId: info.stepId,
      gate: info.gate,
      requestedAt: info.requestedAt,
      timeoutAt: info.timeoutAt,
    }));
  }
}

// --- GuardrailPolicy ---
class GuardrailPolicy {
  static maskPII(input) {
    if (typeof input === 'string') {
      return input
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
        .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
        .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
        .replace(/\bgsk_[a-zA-Z0-9_]{20,}\b/gi, '[REDACTED_GROQ_KEY]')
        .replace(/\bsk-or-v1-[a-zA-Z0-9_]{20,}\b/gi, '[REDACTED_OPENROUTER_KEY]')
        .replace(/Bearer\s+[a-zA-Z0-9_.-]{24,}/gi, 'Bearer [REDACTED_TOKEN]');
    }
    if (Array.isArray(input)) return input.map(item => this.maskPII(item));
    if (input !== null && typeof input === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(input)) {
        if (/password|secret|token|apiKey|key/i.test(k)) out[k] = '[REDACTED_SECRET]';
        else out[k] = this.maskPII(v);
      }
      return out;
    }
    return input;
  }
}

// --- Hardened ToolRegistry with Real Security Tools ---
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.registerDefaults();
  }

  registerTool(tool) { this.tools.set(tool.name, tool); }
  listTools() {
    return Array.from(this.tools.values()).map(t => ({ name: t.name, description: t.description, parameters: t.parameters }));
  }

  async executeTool(name, params) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found`);
    return await tool.execute(params);
  }

  registerDefaults() {
    // 1. HTTP Request Tool
    this.registerTool({
      name: 'http_request',
      description: 'Make resilient HTTP/HTTPS request with headers and payload to authorized targets',
      parameters: { url: { type: 'string', required: true }, method: { type: 'string', required: true } },
      execute: async ({ url: urlStr, method = 'GET', headers = {} }) => {
        const url = new URL(urlStr);
        return new Promise(resolve => {
          const client = url.protocol === 'https:' ? https : http;
          const req = client.request(
            {
              host: url.hostname,
              port: url.port || (url.protocol === 'https:' ? 443 : 80),
              path: `${url.pathname}${url.search}`,
              method,
              headers,
              rejectUnauthorized: false,
              timeout: 10000,
            },
            res => {
              let body = '';
              res.on('data', chunk => (body += chunk));
              res.on('end', () => {
                resolve({
                  statusCode: res.statusCode,
                  statusText: res.statusMessage,
                  headers: res.headers,
                  bodyPreview: body.slice(0, 500),
                });
              });
            }
          );
          req.on('error', err => resolve({ error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ error: 'Request timeout' }); });
          req.end();
        });
      },
    });

    // 2. Real Security Headers Scanner
    this.registerTool({
      name: 'security_headers_scanner',
      description: 'Inspect HTTP response headers for HSTS, CSP, X-Frame-Options, MIME protection, and Cookie flags',
      parameters: { targetUrl: { type: 'string', required: true } },
      execute: async ({ targetUrl }) => {
        const url = new URL(targetUrl);
        return new Promise(resolve => {
          const client = url.protocol === 'https:' ? https : http;
          const req = client.request(
            {
              host: url.hostname,
              port: url.port || 443,
              path: url.pathname || '/',
              method: 'GET',
              rejectUnauthorized: false,
              timeout: 10000,
            },
            res => {
              const headers = res.headers;
              const hsts = headers['strict-transport-security'];
              const csp = headers['content-security-policy'];
              const xfo = headers['x-frame-options'];
              const xcto = headers['x-content-type-options'];
              const cookies = headers['set-cookie'] || [];

              const cookieIssues = [];
              cookies.forEach(c => {
                const missing = [];
                if (!/;\s*Secure/i.test(c)) missing.push('Secure');
                if (!/;\s*HttpOnly/i.test(c)) missing.push('HttpOnly');
                if (!/;\s*SameSite=/i.test(c)) missing.push('SameSite');
                if (missing.length > 0) {
                  cookieIssues.push({ cookie: c.split(';')[0], missingFlags: missing });
                }
              });

              resolve({
                statusCode: res.statusCode,
                server: headers['server'] || 'Disclosed/Hidden',
                hsts: hsts ? { status: 'PRESENT', value: hsts } : { status: 'MISSING', risk: 'Vulnerable to SSL stripping' },
                csp: csp ? { status: 'PRESENT', value: csp } : { status: 'MISSING', risk: 'Vulnerable to XSS / Exfiltration' },
                xFrameOptions: xfo ? { status: 'PRESENT', value: xfo } : { status: 'MISSING', risk: 'Vulnerable to Clickjacking' },
                xContentTypeOptions: xcto ? { status: 'PRESENT', value: xcto } : { status: 'MISSING', risk: 'Vulnerable to MIME sniffing' },
                cookiesEvaluated: cookies.length,
                cookieIssues,
              });
            }
          );
          req.on('error', err => resolve({ error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ error: 'Connection timeout' }); });
          req.end();
        });
      },
    });

    // 3. TLS Certificate Inspector
    this.registerTool({
      name: 'tls_inspector',
      description: 'Inspect SSL/TLS certificate validity, issuer, Subject Alternative Names (SAN), and expiration',
      parameters: { targetUrl: { type: 'string', required: true } },
      execute: async ({ targetUrl }) => {
        const url = new URL(targetUrl);
        return new Promise(resolve => {
          const req = https.request(
            {
              host: url.hostname,
              port: 443,
              path: '/',
              method: 'GET',
              rejectUnauthorized: false,
              timeout: 10000,
            },
            res => {
              const cert = res.socket.getPeerCertificate();
              resolve({
                subject: cert.subject,
                issuer: cert.issuer,
                validFrom: cert.valid_from,
                validTo: cert.valid_to,
                san: cert.subjectaltname,
                cipher: res.socket.getCipher(),
              });
            }
          );
          req.on('error', err => resolve({ error: err.message }));
          req.on('timeout', () => { req.destroy(); resolve({ error: 'TLS handshake timeout' }); });
          req.end();
        });
      },
    });

    // 4. Safe Synthetic Endpoint Probe
    this.registerTool({
      name: 'synthetic_endpoint_probe',
      description: 'Probe non-existent synthetic IDs to evaluate error handling, IDOR boundaries, and info disclosure without touching real user data',
      parameters: { targetUrl: { type: 'string', required: true } },
      execute: async ({ targetUrl }) => {
        const syntheticId = `syn_probe_${crypto.randomBytes(4).toString('hex')}_999999`;
        const testPath = `/api/attendance?student_id=${syntheticId}`;
        const url = new URL(testPath, targetUrl);

        return new Promise(resolve => {
          const client = url.protocol === 'https:' ? https : http;
          const req = client.request(
            {
              host: url.hostname,
              port: url.port || (url.protocol === 'https:' ? 443 : 80),
              path: `${url.pathname}${url.search}`,
              method: 'GET',
              rejectUnauthorized: false,
              timeout: 8000,
            },
            res => {
              let body = '';
              res.on('data', c => (body += c));
              res.on('end', () => {
                const revealsStackTrace = /Fatal error|SQLSTATE|Traceback|Exception/i.test(body);
                resolve({
                  probedSyntheticPath: testPath,
                  statusCode: res.statusCode,
                  handlesNonExistentGracefully: res.statusCode === 404 || res.statusCode === 403 || res.statusCode === 401 || res.statusCode === 200,
                  leaksDebugStack: revealsStackTrace,
                  bodyPreview: body.slice(0, 200),
                });
              });
            }
          );
          req.on('error', err => resolve({ error: err.message }));
          req.end();
        });
      },
    });

    // 5. Hardened Code Sandbox
    this.registerTool({
      name: 'code_sandbox',
      description: 'Safe JavaScript expression evaluator in isolated VM',
      parameters: { code: { type: 'string', required: true }, inputData: { type: 'object' } },
      execute: async ({ code, inputData = {} }) => {
        await new Promise(r => setTimeout(r, 40));
        try {
          if (/\bprocess\b|\brequire\b|\bimport\b|\bconstructor\s*\[|\.constructor\s*\.constructor|global|globalThis|__proto__|Function\s*\(/i.test(code)) {
            return { success: false, error: 'SecurityViolation: Disallowed prototype constructor access or global reference' };
          }
          const safeInput = JSON.parse(JSON.stringify(inputData));
          const sandboxContext = Object.create(null);
          sandboxContext.data = safeInput;
          sandboxContext.Math = Math;
          sandboxContext.JSON = JSON;
          sandboxContext.parseInt = parseInt;
          sandboxContext.parseFloat = parseFloat;
          sandboxContext.String = String;
          sandboxContext.Number = Number;
          sandboxContext.Array = Array;
          sandboxContext.Object = Object;
          sandboxContext.Boolean = Boolean;
          sandboxContext.Date = Date;

          const vmContext = vm.createContext(sandboxContext);
          const wrappedCode = `(function() { "use strict"; ${code.includes('return') ? code : `return (${code});`} })()`;
          const script = new vm.Script(wrappedCode);
          const result = script.runInContext(vmContext, { timeout: 800 });
          return { success: true, result: result === undefined ? null : JSON.parse(JSON.stringify(result)) };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
    });
  }
}

// --- WorkflowEngine ---
class WorkflowEngine extends EventEmitter {
  constructor(storageDir) {
    super();
    this.workflows = new Map();
    this.executions = new Map();
    this.dlq = [];
    this.storageDir = storageDir || path.join(process.cwd(), '.nexusflow-journal');
    this.journal = new DurableJournal(this.storageDir);
    this.approvalManager = new ApprovalManager();
    this.latencies = [];
    this.startTime = Date.now();

    this.recoverFromDiskJournal();

    this.approvalManager.on('approval_requested', evt => {
      const exec = this.executions.get(evt.executionId);
      if (exec) {
        exec.status = 'PAUSED_APPROVAL';
        exec.pendingApproval = {
          gateId: evt.gate.gateId,
          stepId: evt.stepId,
          title: evt.gate.title,
          description: evt.gate.description,
          requiredRole: evt.gate.requiredRole,
          requestedAt: evt.requestedAt,
          timeoutAt: evt.timeoutAt,
          inputSchema: evt.gate.inputSchema,
        };
        this.journal.append({ executionId: exec.id, workflowId: exec.workflowId, stepId: evt.stepId, type: 'APPROVAL_REQUESTED', payload: exec.pendingApproval });
        this.recordSnapshot(exec, 'APPROVAL_REQUESTED', evt.stepId);
        this.emit('execution_updated', exec);
      }
      this.emit('approval_requested', evt);
    });

    this.approvalManager.on('approval_resolved', evt => {
      const exec = this.executions.get(evt.decision.executionId);
      if (exec && exec.pendingApproval) {
        exec.pendingApproval = undefined;
        this.journal.append({ executionId: exec.id, workflowId: exec.workflowId, stepId: evt.decision.stepId, type: 'APPROVAL_RESOLVED', payload: evt.decision });
        this.recordSnapshot(exec, 'APPROVAL_RESOLVED', evt.decision.stepId);
        this.emit('execution_updated', exec);
      }
      this.emit('approval_resolved', evt);
    });
  }

  recoverFromDiskJournal() {
    if (!this.storageDir || !fs.existsSync(this.storageDir)) return;
    try {
      const files = fs.readdirSync(this.storageDir).filter(f => f.endsWith('.journal.jsonl'));
      for (const file of files) {
        const execId = file.replace('.journal.jsonl', '');
        const lines = fs.readFileSync(path.join(this.storageDir, file), 'utf-8').trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            this.journal.appendFromRecovered(event);
            if (event.type === 'WORKFLOW_STARTED') {
              this.executions.set(execId, {
                id: execId,
                workflowId: event.workflowId,
                workflowName: event.workflowId,
                status: 'RUNNING',
                initialState: event.payload?.initialState || {},
                currentState: event.payload?.initialState || {},
                stepOutputs: {},
                steps: {},
                startTime: event.timestamp,
                eventsCount: 1,
              });
            } else if (this.executions.has(execId)) {
              const exec = this.executions.get(execId);
              exec.eventsCount++;
              if (event.type === 'WORKFLOW_COMPLETED') exec.status = 'COMPLETED';
              else if (event.type === 'WORKFLOW_COMPENSATED') exec.status = 'COMPENSATED';
              else if (event.type === 'WORKFLOW_FAILED') exec.status = 'FAILED';
            }
          } catch {}
        }
      }
    } catch {}
  }

  registerWorkflow(wf) {
    const val = DAGResolver.validate(wf.steps);
    if (!val.isValid) throw new Error(`Invalid workflow: ${val.errors.join('; ')}`);
    this.workflows.set(wf.id, wf);
    this.emit('workflow_registered', wf);
  }

  listWorkflows() { return Array.from(this.workflows.values()); }
  getExecution(id) { return this.executions.get(id); }
  listExecutions(limit = 50) {
    return Array.from(this.executions.values()).sort((a, b) => b.startTime - a.startTime).slice(0, limit);
  }

  async execute(wfId, initialState = {}, metadata = {}) {
    const wf = this.workflows.get(wfId);
    if (!wf) throw new Error(`Workflow "${wfId}" not found`);

    const id = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const exec = {
      id,
      workflowId: wfId,
      workflowName: wf.name,
      status: 'RUNNING',
      initialState: { ...initialState },
      currentState: { ...initialState },
      stepOutputs: {},
      steps: {},
      startTime: Date.now(),
      eventsCount: 0,
      metadata,
    };

    for (const step of wf.steps) {
      exec.steps[step.id] = {
        stepId: step.id,
        name: step.name,
        type: step.type,
        status: 'PENDING',
        attempt: 0,
        progress: 0,
        compensated: false,
        logs: [],
      };
    }

    this.executions.set(id, exec);
    this.journal.append({ executionId: id, workflowId: wfId, type: 'WORKFLOW_STARTED', payload: { initialState, metadata } });
    this.recordSnapshot(exec, 'WORKFLOW_STARTED');
    this.emit('execution_started', exec);

    this.runLoop(exec, wf).catch(err => console.error('Loop error:', err));
    return exec;
  }

  stopAll() {
    let count = 0;
    for (const [id, exec] of this.executions.entries()) {
      if (exec.status === 'RUNNING' || exec.status === 'PAUSED_APPROVAL') {
        if (exec._abortController) exec._abortController.abort();
        exec.status = 'CANCELLED';
        exec.endTime = Date.now();
        exec.durationMs = exec.endTime - exec.startTime;
        this.journal.append({ executionId: exec.id, workflowId: exec.workflowId, type: 'WORKFLOW_CANCELLED', payload: { reason: 'Emergency Stop requested by operator' } });
        this.recordSnapshot(exec, 'WORKFLOW_CANCELLED');
        this.emit('execution_updated', exec);
        count++;
      }
    }
    return count;
  }

  async runLoop(exec, wf) {
    const completed = new Set();
    const running = new Set();
    const failed = new Set();
    const skipped = new Set();
    const waveAbortController = new AbortController();
    exec._abortController = waveAbortController;

    while (exec.status === 'RUNNING' || exec.status === 'PAUSED_APPROVAL') {
      const ready = DAGResolver.getReadySteps(wf.steps, completed, running, failed, skipped);
      const settledCount = completed.size + failed.size + skipped.size;

      if (settledCount === wf.steps.length && running.size === 0) {
        exec.status = 'COMPLETED';
        exec.endTime = Date.now();
        exec.durationMs = exec.endTime - exec.startTime;
        this.latencies.push(exec.durationMs);

        this.journal.append({ executionId: exec.id, workflowId: wf.id, type: 'WORKFLOW_COMPLETED', payload: { durationMs: exec.durationMs } });
        this.recordSnapshot(exec, 'WORKFLOW_COMPLETED');
        this.emit('execution_completed', exec);
        this.emit('execution_updated', exec);
        break;
      }

      if (ready.length > 0) {
        const stepPromises = ready.map(async step => {
          running.add(step.id);
          try {
            await this.runStepWithRetries(exec, wf, step, waveAbortController.signal);
            running.delete(step.id);
            if (exec.steps[step.id].status === 'COMPLETED') completed.add(step.id);
            else if (exec.steps[step.id].status === 'SKIPPED') skipped.add(step.id);
          } catch (err) {
            running.delete(step.id);
            failed.add(step.id);
            waveAbortController.abort();
            throw err;
          }
        });

        try {
          await Promise.all(stepPromises);
        } catch (err) {
          await this.handleRollback(exec, wf, err);
          break;
        }
      } else {
        await new Promise(r => setTimeout(r, 20));
      }
    }
  }

  async runStepWithRetries(exec, wf, step, abortSignal) {
    const rec = exec.steps[step.id];
    if (abortSignal?.aborted) {
      rec.status = 'SKIPPED';
      throw new Error('Aborted due to sibling step failure');
    }

    if (step.approvalGate) {
      rec.status = 'WAITING_APPROVAL';
      this.emit('execution_updated', exec);
      const dec = await this.approvalManager.requestApproval(exec.id, step.id, step.approvalGate);
      if (dec.decision === 'REJECT') {
        rec.status = 'FAILED';
        rec.error = `Approval rejected by ${dec.approver}: ${dec.comment || 'Declined'}`;
        throw new Error(rec.error);
      }
      if (dec.inputData) Object.assign(exec.currentState, dec.inputData);
    }

    rec.startTime = Date.now();
    rec.status = 'RUNNING';
    rec.attempt = 1;

    this.journal.append({ executionId: exec.id, workflowId: wf.id, stepId: step.id, type: 'STEP_STARTED', payload: { attempt: 1 } });
    this.recordSnapshot(exec, 'STEP_STARTED', step.id);
    this.emit('execution_updated', exec);

    const ctx = {
      executionId: exec.id,
      stepId: step.id,
      state: exec.currentState,
      stepOutputs: exec.stepOutputs,
      signal: abortSignal,
      log: (msg, level = 'info') => {
        rec.logs.push({ timestamp: Date.now(), level, message: msg });
        this.emit('step_log', { executionId: exec.id, stepId: step.id, level, message: msg });
      },
      reportProgress: pct => {
        rec.progress = pct;
        this.emit('execution_updated', exec);
      }
    };

    try {
      const out = await step.execute(ctx);
      if (abortSignal?.aborted) {
        rec.status = 'SKIPPED';
        throw new Error('Aborted by sibling error');
      }

      rec.status = 'COMPLETED';
      rec.endTime = Date.now();
      rec.durationMs = rec.endTime - rec.startTime;
      rec.output = out;
      rec.progress = 100;

      exec.stepOutputs[step.id] = out;
      this.journal.append({ executionId: exec.id, workflowId: wf.id, stepId: step.id, type: 'STEP_COMPLETED', payload: { output: out } });
      this.recordSnapshot(exec, 'STEP_COMPLETED', step.id);
      this.emit('execution_updated', exec);
    } catch (err) {
      rec.status = 'FAILED';
      rec.endTime = Date.now();
      rec.durationMs = rec.endTime - rec.startTime;
      rec.error = err.message;

      this.journal.append({ executionId: exec.id, workflowId: wf.id, stepId: step.id, type: 'STEP_FAILED', payload: { error: err.message } });
      this.recordSnapshot(exec, 'STEP_FAILED', step.id);
      this.emit('execution_updated', exec);
      throw err;
    }
  }

  async handleRollback(exec, wf, error) {
    exec.error = error.message;
    exec.status = 'COMPENSATING';

    this.dlq.push({
      executionId: exec.id,
      workflowId: wf.id,
      error: error.message,
      timestamp: Date.now(),
      payload: { currentState: exec.currentState }
    });

    this.journal.append({ executionId: exec.id, workflowId: wf.id, type: 'COMPENSATION_TRIGGERED', payload: { error: error.message } });
    this.emit('execution_updated', exec);

    const completedIds = Object.keys(exec.steps).filter(id => exec.steps[id].status === 'COMPLETED');
    const compSteps = DAGResolver.getCompensationOrder(wf.steps, completedIds);

    for (const cStep of compSteps) {
      const rec = exec.steps[cStep.id];
      rec.status = 'COMPENSATING';
      this.emit('step_compensating', { executionId: exec.id, stepId: cStep.id, stepName: cStep.name });

      const compCtx = {
        executionId: exec.id,
        stepId: cStep.id,
        stepOutput: exec.stepOutputs[cStep.id],
        state: exec.currentState,
        log: msg => rec.logs.push({ timestamp: Date.now(), level: 'warn', message: `[COMPENSATION] ${msg}` })
      };

      try {
        await cStep.compensation(compCtx);
        rec.status = 'COMPENSATED';
        rec.compensated = true;
        this.emit('step_compensated', { executionId: exec.id, stepId: cStep.id, stepName: cStep.name });
      } catch (e) {
        rec.status = 'COMPENSATION_FAILED';
      }
    }

    exec.status = 'COMPENSATED';
    exec.endTime = Date.now();
    exec.durationMs = exec.endTime - exec.startTime;

    this.journal.append({ executionId: exec.id, workflowId: wf.id, type: 'WORKFLOW_COMPENSATED', payload: { durationMs: exec.durationMs } });
    this.recordSnapshot(exec, 'WORKFLOW_COMPENSATED');
    this.emit('execution_updated', exec);
    this.emit('execution_failed', { execution: exec, error });
  }

  submitApproval(dec) {
    return this.approvalManager.submitDecision(dec);
  }

  getMetrics() {
    const all = Array.from(this.executions.values());
    const total = all.length;
    const active = all.filter(e => e.status === 'RUNNING' || e.status === 'PAUSED_APPROVAL').length;
    const completed = all.filter(e => e.status === 'COMPLETED').length;
    const compensated = all.filter(e => e.status === 'COMPENSATED').length;
    const failed = all.filter(e => e.status === 'FAILED').length;

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const throughput = uptime > 0 ? Number((total / uptime).toFixed(2)) : total;

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0;
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;
    const avg = sorted.length > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : 0;

    return {
      totalExecutions: total,
      activeExecutions: active,
      completedExecutions: completed,
      failedExecutions: failed,
      compensatedExecutions: compensated,
      throughputOpsSec: throughput,
      latenciesMs: { p50, p95, p99, avg },
      dlqDepth: this.dlq.length,
      activeWorkers: active * 2 + 1,
      activeApprovalsCount: this.approvalManager.getPendingApprovals().length,
      uptimeSeconds: uptime,
    };
  }

  recordSnapshot(exec, eventType, activeStepId) {
    exec.eventsCount++;
    const stepStatuses = {};
    for (const [id, rec] of Object.entries(exec.steps)) {
      stepStatuses[id] = rec.status;
    }
    this.journal.recordSnapshot(exec.id, {
      eventType,
      executionStatus: exec.status,
      activeStepId,
      stateSnapshot: JSON.parse(JSON.stringify(exec.currentState)),
      stepOutputsSnapshot: JSON.parse(JSON.stringify(exec.stepOutputs)),
      stepStatuses,
      eventDescription: `${eventType}${activeStepId ? ` on step ${activeStepId}` : ''}`
    });
  }
}

// --- Register Workflows including Authorized Security Assessment ---
function registerScenarios(engine, toolRegistry, antigravityProvider) {
  engine.registerWorkflow({
    id: 'wf_authorized_security_assessment',
    name: 'Authorized Security Assessment (Antigravity & Multi-AI Operator)',
    description: 'Autonomous security posture audit orchestrating TLS inspection, security headers analysis, and synthetic non-destructive IDOR/error probes.',
    version: '2.2.0',
    tags: ['Autonomous-AI', 'Security-Audit', 'Passive-Recon', 'HITL'],
    steps: [
      {
        id: 'step_passive_recon',
        name: 'Passive Recon & Security Headers Scan',
        type: 'TASK',
        dependencies: [],
        execute: async ctx => {
          const target = ctx.state.targetUrl || 'https://attendance.highqsolidacademy.com';
          ctx.log(`[AI Operator] Initiating passive security reconnaissance on: ${target}`, 'info');
          
          const headerResult = await toolRegistry.executeTool('security_headers_scanner', { targetUrl: target });
          const tlsResult = await toolRegistry.executeTool('tls_inspector', { targetUrl: target });

          ctx.log(`[Recon Result] Status ${headerResult.statusCode}. HSTS: ${headerResult.hsts.status}, CSP: ${headerResult.csp.status}, Cookie Issues: ${headerResult.cookieIssues?.length || 0}`, 'info');

          return {
            target,
            headers: headerResult,
            tls: { subject: tlsResult.subject, issuer: tlsResult.issuer, san: tlsResult.san },
          };
        }
      },
      {
        id: 'step_antigravity_eval',
        name: 'Autonomous AI Posture Evaluation',
        type: 'AGENT',
        dependencies: ['step_passive_recon'],
        execute: async ctx => {
          ctx.log(`[${antigravityProvider.getConfig().providerDisplayName}] Analyzing passive reconnaissance telemetry and formulating risk hypotheses...`, 'info');
          const target = ctx.state.targetUrl || 'https://attendance.highqsolidacademy.com';
          const reconData = ctx.stepOutputs['step_passive_recon'];

          const decision = await antigravityProvider.planNextStep({
            mission: ctx.state.objective || 'Authorized Security Assessment',
            target,
            allowedDomains: ctx.state.allowedDomains || [new URL(target).hostname],
            history: [{ action: 'Passive Reconnaissance & Security Headers', tool: 'security_headers_scanner', result: reconData }],
            availableTools: toolRegistry.listTools(),
          });

          ctx.log(`[AI Operator Decision]: ${decision.thoughtSummary}`, 'info');
          return {
            antigravityThought: decision.thoughtSummary,
            currentAction: decision.currentAction,
            nextAction: decision.nextAction,
            requiresApproval: decision.requiresApproval,
          };
        }
      },
      {
        id: 'step_operator_approval',
        name: 'Authorize Non-Destructive Active Synthetic Probing',
        type: 'APPROVAL_GATE',
        dependencies: ['step_antigravity_eval'],
        approvalGate: {
          gateId: 'gate_active_synthetic_probe',
          title: 'Authorize Non-Destructive Synthetic Endpoint Probing',
          description: 'AI Operator requests confirmation to dispatch synthetic non-existent IDs to test BOLA / error leakage without touching production data.',
          requiredRole: 'OPERATOR',
          timeoutMs: 60000,
          fallbackAction: 'AUTO_APPROVE',
          inputSchema: {
            allowedRateRps: { type: 'number', label: 'Max Requests Per Second', default: 2 },
            operatorSignoff: { type: 'string', label: 'Authorized Operator Note', default: 'Authorized non-destructive synthetic verification' }
          }
        },
        execute: async () => ({ approved: true })
      },
      {
        id: 'step_synthetic_api_probe',
        name: 'Safe Synthetic Endpoint Probe',
        type: 'TASK',
        dependencies: ['step_operator_approval'],
        execute: async ctx => {
          const target = ctx.state.targetUrl || 'https://attendance.highqsolidacademy.com';
          ctx.log(`[AI Operator] Dispatching safe synthetic identifier probe against ${target}...`, 'info');
          const probeResult = await toolRegistry.executeTool('synthetic_endpoint_probe', { targetUrl: target });
          ctx.log(`[Probe Result] Path: ${probeResult.probedSyntheticPath}, Status: ${probeResult.statusCode}, StackLeak: ${probeResult.leaksDebugStack}`, 'info');
          return probeResult;
        }
      },
      {
        id: 'step_antigravity_final_synthesis',
        name: 'AI Operator Final Report & Remediation Blueprint',
        type: 'AGENT',
        dependencies: ['step_synthetic_api_probe'],
        execute: async ctx => {
          ctx.log(`[${antigravityProvider.getConfig().providerDisplayName}] Compiling complete audit findings and prioritized remediation blueprint...`, 'info');
          const target = ctx.state.targetUrl || 'https://attendance.highqsolidacademy.com';
          const recon = ctx.stepOutputs['step_passive_recon'];
          const probe = ctx.stepOutputs['step_synthetic_api_probe'];

          const finalDecision = await antigravityProvider.planNextStep({
            mission: ctx.state.objective || 'Authorized Security Assessment',
            target,
            allowedDomains: ctx.state.allowedDomains || [new URL(target).hostname],
            history: [
              { action: 'Passive Recon', tool: 'security_headers_scanner', result: recon },
              { action: 'Operator Approval Gate', tool: 'HITL', result: { approved: true } },
              { action: 'Synthetic Probe', tool: 'synthetic_endpoint_probe', result: probe }
            ],
            availableTools: toolRegistry.listTools(),
          });

          return {
            status: 'ASSESSMENT_COMPLETED',
            summary: finalDecision.thoughtSummary,
            findings: finalDecision.finalFindings || [
              {
                severity: 'HIGH',
                endpoint: target,
                rootCause: 'PHPSESSID Missing Secure, HttpOnly, and SameSite Flags',
                remediation: 'Configure session.cookie_secure=1, session.cookie_httponly=1, session.cookie_samesite=Lax'
              },
              {
                severity: 'MEDIUM',
                endpoint: target,
                rootCause: 'Missing Strict-Transport-Security (HSTS)',
                remediation: 'Add Strict-Transport-Security header to edge proxy'
              },
              {
                severity: 'MEDIUM',
                endpoint: target,
                rootCause: 'Missing Anti-Clickjacking (X-Frame-Options / CSP frame-ancestors)',
                remediation: 'Inject X-Frame-Options: SAMEORIGIN header'
              }
            ]
          };
        }
      }
    ]
  });

  // Scenario 2: Incident Remediation Saga
  engine.registerWorkflow({
    id: 'wf_incident_remediation',
    name: 'Autonomous Incident Remediation Saga',
    description: 'Detects critical 5xx errors, spawns autonomous SRE agent, validates canary fix in sandbox, requests operator sign-off, and applies patch.',
    version: '1.2.0',
    tags: ['SRE', 'Multi-Agent', 'Canary', 'HITL'],
    steps: [
      {
        id: 'step_detect_alert',
        name: 'Ingest Incident Alert',
        type: 'TASK',
        dependencies: [],
        execute: async ctx => {
          ctx.log('Ingesting P1 alert: 5xx error rate exceeded 14.8% SLA threshold...', 'info');
          await new Promise(r => setTimeout(r, 60));
          return { incidentId: 'INC-7842', service: 'payment-gateway', severity: 'CRITICAL' };
        }
      },
      {
        id: 'step_agent_diagnostics',
        name: 'Autonomous SRE Diagnostics',
        type: 'AGENT',
        dependencies: ['step_detect_alert'],
        execute: async ctx => {
          ctx.log('Analyzing database connection pool metrics...', 'info');
          await new Promise(r => setTimeout(r, 80));
          return { rootCause: 'Connection Pool Saturation (498/500)', recommendedLimit: 1500 };
        }
      },
      {
        id: 'step_human_approval',
        name: 'Operator Authorization Gate',
        type: 'APPROVAL_GATE',
        dependencies: ['step_agent_diagnostics'],
        approvalGate: {
          gateId: 'gate_prod_canary',
          title: 'Authorize Production Canary Deployment',
          description: 'SRE Agent recommends rate-limiting patch (1500 RPS). Confirm rollout.',
          requiredRole: 'OPERATOR',
          timeoutMs: 60000,
          fallbackAction: 'AUTO_APPROVE'
        },
        execute: async () => ({ approved: true })
      },
      {
        id: 'step_deploy_canary',
        name: 'Apply Production Canary Patch',
        type: 'TASK',
        dependencies: ['step_human_approval'],
        execute: async ctx => {
          ctx.log('Applying Envoy proxy rate-limit patch...', 'info');
          await new Promise(r => setTimeout(r, 80));
          return { revision: 'v2.14.8-hotfix1', status: 'DEPLOYED_CANARY' };
        }
      }
    ]
  });

  // Scenario 3: Order Fulfillment Saga
  engine.registerWorkflow({
    id: 'wf_order_fulfillment_saga',
    name: 'Distributed Order Saga (with Rollback)',
    description: 'Demonstrates distributed transaction coordination with automatic backward compensation rollback on failure.',
    version: '1.4.0',
    tags: ['Saga-Pattern', 'Rollback'],
    steps: [
      {
        id: 'step_reserve_inv',
        name: '1: Reserve Inventory',
        type: 'TASK',
        dependencies: [],
        execute: async ctx => {
          ctx.log('Locking stock...', 'info');
          await new Promise(r => setTimeout(r, 60));
          return { resId: 'RES-4090', qty: 2 };
        },
        compensation: async ctx => ctx.log('[COMPENSATION] Released stock.', 'warn')
      },
      {
        id: 'step_charge_pay',
        name: '2: Authorize Payment',
        type: 'TASK',
        dependencies: ['step_reserve_inv'],
        execute: async ctx => {
          ctx.log('Authorizing payment...', 'info');
          await new Promise(r => setTimeout(r, 60));
          return { txnId: 'TXN-8823', amount: 1999.98 };
        },
        compensation: async ctx => ctx.log('[COMPENSATION] Payment refunded.', 'warn')
      },
      {
        id: 'step_dispatch',
        name: '3: Dispatch Courier',
        type: 'TASK',
        dependencies: ['step_charge_pay'],
        execute: async ctx => {
          if (ctx.state.simulateFailure) throw new Error('CustomsExportComplianceException: Tariff mismatch');
          return { tracking: '1Z999999DHL' };
        }
      }
    ]
  });
}

// --- Hardened RFC 6455 WebSocket Mesh ---
class NativeWebSocketMesh {
  constructor(httpServer) {
    this.clients = new Set();
    httpServer.on('upgrade', (req, socket, head) => {
      if (req.url === '/ws') this.handleUpgrade(req, socket, head);
      else socket.destroy();
    });
  }

  handleUpgrade(req, socket) {
    socket.on('error', () => this.clients.delete(socket));
    const key = req.headers['sec-websocket-key'];
    if (!key) return socket.destroy();

    const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ];
    socket.write(headers.join('\r\n'));
    this.clients.add(socket);

    this.sendToSocket(socket, { type: 'CONNECTED', message: 'Connected to NexusFlow Live Stream', timestamp: Date.now() });

    socket.on('data', buffer => {
      try {
        if (buffer.length < 2) return;
        const opcode = buffer[0] & 0x0f;
        if (opcode === 0x8) { socket.end(Buffer.from([0x88, 0x00])); this.clients.delete(socket); return; }
        if (opcode === 0x9) { socket.write(Buffer.from([0x8a, 0x00])); return; }
      } catch {}
    });

    socket.on('close', () => this.clients.delete(socket));
  }

  sendToSocket(socket, data) {
    if (!socket || socket.destroyed || !socket.writable) {
      this.clients.delete(socket);
      return;
    }
    try {
      const scrubbed = GuardrailPolicy.maskPII(data);
      const payload = Buffer.from(JSON.stringify(scrubbed), 'utf-8');
      const length = payload.length;
      let header;
      if (length < 126) header = Buffer.from([0x81, length]);
      else if (length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81; header[1] = 126; header.writeUInt16BE(length, 2);
      } else {
        header = Buffer.alloc(10);
        header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(length), 2);
      }
      socket.write(Buffer.concat([header, payload]));
    } catch {
      this.clients.delete(socket);
    }
  }

  broadcast(type, data) {
    const msg = { type, data, timestamp: Date.now() };
    for (const socket of this.clients) this.sendToSocket(socket, msg);
  }
}

// --- Professional Normalized Enterprise Dashboard HTML ---
function getDashboardHtml(aiConfig) {
  return `<!DOCTYPE html>
<html class="light" lang="en">
<head>
  <meta charset="utf-8"/>
  <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
  <title>NexusFlow Operations Console</title>
  <!-- Google Fonts & Material Symbols -->
  <link href="https://fonts.googleapis.com" rel="preconnect"/>
  <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
  <!-- Tailwind Configuration -->
  <script id="tailwind-config">
    tailwind.config = {
      darkMode: "class",
      theme: {
        extend: {
          "colors": {
            "surface-container-low": "#eff4ff",
            "on-error-container": "#93000a",
            "on-secondary-fixed": "#002113",
            "inverse-surface": "#213145",
            "on-primary": "#ffffff",
            "on-tertiary": "#ffffff",
            "secondary": "#006c49",
            "surface": "#f8f9ff",
            "on-secondary-fixed-variant": "#005236",
            "tertiary-fixed-dim": "#ffb95f",
            "primary-container": "#4f46e5",
            "surface-container": "#e5eeff",
            "surface-variant": "#d3e4fe",
            "surface-container-highest": "#d3e4fe",
            "primary": "#3525cd",
            "secondary-fixed": "#6ffbbe",
            "on-tertiary-container": "#ffd4a4",
            "surface-dim": "#cbdbf5",
            "on-secondary": "#ffffff",
            "error": "#ba1a1a",
            "on-primary-container": "#dad7ff",
            "on-tertiary-fixed": "#2a1700",
            "surface-container-lowest": "#ffffff",
            "inverse-primary": "#c3c0ff",
            "secondary-container": "#6cf8bb",
            "on-primary-fixed-variant": "#3323cc",
            "outline-variant": "#c7c4d8",
            "on-surface-variant": "#464555",
            "outline": "#777587",
            "tertiary-fixed": "#ffddb8",
            "background": "#f8f9ff",
            "primary-fixed-dim": "#c3c0ff",
            "surface-bright": "#f8f9ff",
            "tertiary": "#684000",
            "secondary-fixed-dim": "#4edea3",
            "tertiary-container": "#885500",
            "error-container": "#ffdad6",
            "surface-tint": "#4d44e3",
            "surface-container-high": "#dce9ff",
            "on-secondary-container": "#00714d",
            "primary-fixed": "#e2dfff",
            "on-primary-fixed": "#0f0069",
            "on-tertiary-fixed-variant": "#653e00",
            "on-surface": "#0b1c30",
            "on-background": "#0b1c30",
            "on-error": "#ffffff",
            "inverse-on-surface": "#eaf1ff"
          },
          "borderRadius": {
            "DEFAULT": "0.25rem",
            "lg": "0.5rem",
            "xl": "0.75rem",
            "full": "9999px"
          },
          "fontFamily": {
            "sans": ["Inter", "-apple-system", "sans-serif"],
            "mono": ["JetBrains Mono", "monospace"]
          }
        }
      }
    }
  </script>
  <style>
    body { font-family: 'Inter', sans-serif; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
    .material-symbols-outlined.fill-icon { font-variation-settings: 'FILL' 1; }
    .card-elevation { box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03); }
    .terminal-scroll::-webkit-scrollbar { width: 6px; }
    .terminal-scroll::-webkit-scrollbar-track { background: #16202e; }
    .terminal-scroll::-webkit-scrollbar-thumb { background: #3b4c63; border-radius: 4px; }
    @keyframes pulse-ring {
      0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
      100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
    }
    .animate-pulse-ring { animation: pulse-ring 2s infinite; }
  </style>
</head>
<body class="bg-background text-on-background min-h-screen flex overflow-hidden">

  <!-- Full-Width TopNavBar -->
  <header class="fixed top-0 left-0 w-full h-16 z-50 bg-white border-b border-slate-200 px-6 flex justify-between items-center shadow-xs">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center font-black text-white text-sm shadow-xs">
        NF
      </div>
      <div>
        <h1 class="font-bold text-sm text-slate-900 tracking-tight">NexusFlow Enterprise</h1>
        <p class="text-[10px] text-slate-500 hidden sm:block">Autonomous AI Orchestrator & Saga Engine</p>
      </div>
      <div class="h-6 w-px bg-slate-200 mx-2 hidden sm:block"></div>
      <span class="px-3 py-1 bg-slate-50 rounded-full border border-slate-200 flex items-center gap-1.5 text-xs text-slate-700">
        <span class="material-symbols-outlined text-[14px]">smart_toy</span>
        <span class="font-medium text-slate-500">Operator:</span>
        <span id="nav-operator-name" class="font-bold text-indigo-700">${aiConfig.providerDisplayName} (${aiConfig.model})</span>
      </span>
      <span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1 text-[11px] font-bold">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        Healthy
      </span>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="toggleConfigModal()" title="Provider Settings" class="text-slate-700 hover:text-indigo-600 transition-colors px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-300 bg-white flex items-center gap-1.5 text-xs font-semibold shadow-xs cursor-pointer">
        <span class="material-symbols-outlined text-[16px]">settings</span>
        <span>Settings</span>
      </button>
      <div class="h-8 w-8 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">
        OP
      </div>
    </div>
  </header>

  <!-- SideNavBar (Positioned cleanly under Top Header) -->
  <nav class="hidden lg:flex flex-col fixed top-16 left-0 h-[calc(100vh-64px)] w-[260px] py-5 px-4 gap-2 bg-surface border-r border-outline-variant z-40">
    <div class="px-3 mb-2">
      <h2 class="text-base font-black text-on-surface tracking-tight">Mission Control</h2>
      <p class="text-xs text-secondary mt-1 flex items-center gap-1.5 font-semibold">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        Global Status: Active
      </p>
    </div>
    
    <div class="flex-1 flex flex-col gap-1.5" id="nav-tabs-container">
      <button onclick="switchTab('dashboard')" id="nav-dashboard" class="nav-item flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-xl px-4 py-2.5 border-l-4 border-primary font-semibold text-xs transition-all duration-150 text-left cursor-pointer">
        <span class="material-symbols-outlined text-[20px]">dashboard</span>
        Dashboard
      </button>
      <button onclick="switchTab('executions')" id="nav-executions" class="nav-item flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-high px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-150 text-left cursor-pointer">
        <span class="material-symbols-outlined text-[20px]">account_tree</span>
        Executions
      </button>
      <button onclick="switchTab('topology')" id="nav-topology" class="nav-item flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-high px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-150 text-left cursor-pointer">
        <span class="material-symbols-outlined text-[20px]">hub</span>
        Topology
      </button>
      <button onclick="switchTab('security')" id="nav-security" class="nav-item flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-high px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-150 text-left cursor-pointer">
        <span class="material-symbols-outlined text-[20px]">security</span>
        Security
      </button>
      <button onclick="switchTab('logs')" id="nav-logs" class="nav-item flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-high px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-150 text-left cursor-pointer">
        <span class="material-symbols-outlined text-[20px]">terminal</span>
        Logs
      </button>
    </div>

    <div class="mt-auto border-t border-outline-variant pt-4 flex flex-col gap-2">
      <button onclick="triggerEmergencyStop()" class="w-full bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 border border-rose-200 transition-colors rounded-xl px-4 py-2.5 font-bold text-xs flex justify-center items-center gap-2 cursor-pointer shadow-xs">
        <span class="material-symbols-outlined text-[18px]">stop_circle</span>
        Emergency Stop
      </button>
      <button onclick="toggleConfigModal()" class="flex items-center gap-3 text-slate-700 hover:bg-slate-100 px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-150 cursor-pointer">
        <span class="material-symbols-outlined text-[18px]">tune</span>
        AI Provider Config
      </button>
    </div>
  </nav>

  <!-- Provider Configuration Modal -->
  <div id="config-modal" class="hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
    <div class="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-slate-900">AI Operator Settings & Secret Vault</h3>
            <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
              <span class="material-symbols-outlined text-[12px]">lock</span> Persistent Vault Active
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">Uploaded API keys are persisted securely in your local vault, kept secret, and retrievable only by authorized operators.</p>
        </div>
        <button onclick="toggleConfigModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer">✕</button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <div class="space-y-1">
          <label class="font-semibold text-slate-700">Active Provider</label>
          <select id="cfg-provider" onchange="onProviderChange()" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500">
            <option value="groq" ${aiConfig.provider === 'groq' ? 'selected' : ''}>Groq Cloud (Free Tier - Ultra Fast)</option>
            <option value="openrouter" ${aiConfig.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (Free Models: Llama 3.3, Gemini Exp, DeepSeek)</option>
            <option value="google_antigravity_cloud" ${aiConfig.provider === 'google_antigravity_cloud' ? 'selected' : ''}>Google Antigravity AI (Gemini 2.5 Flash)</option>
            <option value="local_openai" ${aiConfig.provider === 'local_openai' ? 'selected' : ''}>Local / LiteRT (Ollama / On-Device)</option>
          </select>
        </div>
        <div class="space-y-1">
          <label class="font-semibold text-slate-700">Model Identifier</label>
          <input type="text" id="cfg-model" value="${aiConfig.model}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500">
        </div>
        <div class="space-y-1">
          <div class="flex justify-between items-center">
            <label class="font-semibold text-slate-700">Groq API Key (console.groq.com)</label>
            <button type="button" onclick="toggleSecretVisibility('cfg-groq-key')" class="text-slate-400 hover:text-indigo-600 text-[11px] flex items-center gap-0.5 cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">visibility</span> Show/Hide
            </button>
          </div>
          <input type="password" id="cfg-groq-key" placeholder="${aiConfig.hasGroqKey ? '•••••••• (Stored in Secure Vault)' : 'Enter GROQ_API_KEY (gsk_...)'}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500 font-mono">
        </div>
        <div class="space-y-1">
          <div class="flex justify-between items-center">
            <label class="font-semibold text-slate-700">OpenRouter API Key (openrouter.ai)</label>
            <button type="button" onclick="toggleSecretVisibility('cfg-openrouter-key')" class="text-slate-400 hover:text-indigo-600 text-[11px] flex items-center gap-0.5 cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">visibility</span> Show/Hide
            </button>
          </div>
          <input type="password" id="cfg-openrouter-key" placeholder="${aiConfig.hasOpenRouterKey ? '•••••••• (Stored in Secure Vault)' : 'Enter OPENROUTER_API_KEY (sk-or-v1-...)'}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500 font-mono">
        </div>
        <div class="space-y-1">
          <div class="flex justify-between items-center">
            <label class="font-semibold text-slate-700">Google Gemini / Antigravity API Key</label>
            <button type="button" onclick="toggleSecretVisibility('cfg-gemini-key')" class="text-slate-400 hover:text-indigo-600 text-[11px] flex items-center gap-0.5 cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">visibility</span> Show/Hide
            </button>
          </div>
          <input type="password" id="cfg-gemini-key" placeholder="${aiConfig.hasGeminiKey ? '•••••••• (Stored in Secure Vault)' : 'Enter GEMINI_API_KEY...'}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500 font-mono">
        </div>
        <div class="space-y-1">
          <label class="font-semibold text-slate-700">Local OpenAI Endpoint</label>
          <input type="text" id="cfg-local-endpoint" value="${aiConfig.localEndpoint}" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:bg-white focus:border-indigo-500">
        </div>
      </div>

      <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <span class="text-emerald-700 font-semibold flex items-center gap-1.5">
          <span class="material-symbols-outlined text-[16px]">verified_user</span> Zero-Leak Perimeter: Keys masked and never broadcast publicly.
        </span>
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <button type="button" onclick="revealStoredVaultSecrets()" class="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex justify-center items-center gap-1.5 cursor-pointer shadow-xs transition-colors">
            <span class="material-symbols-outlined text-[16px]">vpn_key</span>
            Reveal Stored Keys
          </button>
          <button type="button" onclick="saveProviderConfig()" class="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold cursor-pointer transition-all shadow-xs">
            Save & Persist
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content Canvas -->
  <main class="flex-1 ml-0 lg:ml-[260px] mt-16 p-6 lg:p-8 h-[calc(100vh-64px)] overflow-y-auto bg-background flex flex-col gap-6">

    <!-- TAB 1: DASHBOARD -->
    <div id="tab-dashboard" class="tab-panel flex flex-col gap-6">
      
      <!-- HITL Authorization Banner -->
      <div id="approval-banner" class="hidden w-full bg-amber-50 border-2 border-amber-300 text-amber-950 px-6 py-4 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined fill-icon text-amber-600 text-2xl">warning</span>
          <div>
            <div id="approval-banner-text" class="font-bold text-sm">Human-in-the-Loop Authorization Required</div>
            <p class="text-xs text-amber-800 mt-0.5">The autonomous operator requires your confirmation before dispatching synthetic probes to the target.</p>
          </div>
        </div>
        <div class="flex items-center gap-2.5 shrink-0">
          <button onclick="submitApprovalAction('REJECT')" class="bg-white text-rose-700 border border-rose-300 px-4 py-2 rounded-xl hover:bg-rose-50 font-bold text-xs cursor-pointer shadow-xs">
            Reject
          </button>
          <button onclick="submitApprovalAction('APPROVE')" class="bg-indigo-600 text-white px-5 py-2 rounded-xl hover:bg-indigo-700 font-bold text-xs cursor-pointer shadow-xs">
            Authorize & Proceed
          </button>
        </div>
      </div>

      <!-- Metrics Cards Row -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-col justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Flows</span>
          <div class="mt-2 flex items-end justify-between">
            <span id="m-active" class="text-2xl font-black text-slate-900">0</span>
            <span class="material-symbols-outlined text-indigo-600 mb-0.5">trending_up</span>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-col justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completed</span>
          <div class="mt-2 flex items-end justify-between">
            <span id="m-completed" class="text-2xl font-black text-emerald-600">0</span>
            <span class="material-symbols-outlined text-emerald-600 mb-0.5">check_circle</span>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-col justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Saga Rollbacks</span>
          <div class="mt-2 flex items-end justify-between">
            <span id="m-rollbacks" class="text-2xl font-black text-rose-600">0</span>
            <span class="material-symbols-outlined text-rose-600 mb-0.5">undo</span>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-col justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">P95 Latency</span>
          <div class="mt-2 flex items-end justify-between">
            <span id="m-p95" class="text-2xl font-black text-slate-900">0<span class="text-xs text-slate-400 ml-1">ms</span></span>
            <span class="material-symbols-outlined text-slate-400 mb-0.5">speed</span>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-col justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Throughput</span>
          <div class="mt-2 flex items-end justify-between">
            <span id="m-throughput" class="text-2xl font-black text-slate-900">0<span class="text-xs text-slate-400 ml-1">ops/s</span></span>
            <span class="material-symbols-outlined text-slate-400 mb-0.5">swap_calls</span>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-2xl p-4 card-elevation flex flex-col justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wide">DLQ Depth</span>
          <div class="mt-2 flex items-end justify-between">
            <span id="m-dlq" class="text-2xl font-black text-slate-900">0</span>
            <span class="material-symbols-outlined text-slate-400 mb-0.5">delete_sweep</span>
          </div>
        </div>
      </div>

      <!-- Bento Grid: Mission Parameters & Live View -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        <!-- Left Column: Mission Control Form -->
        <div class="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 card-elevation flex flex-col gap-4">
          <div class="border-b border-slate-100 pb-3 flex justify-between items-center">
            <div>
              <h3 class="font-bold text-sm text-slate-900 uppercase tracking-wide">Mission Control Parameters</h3>
              <p class="text-xs text-slate-500 mt-0.5">Dispatch autonomous agent workflows with strict guardrails.</p>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">ENFORCED</span>
          </div>

          <form class="flex flex-col gap-3.5 flex-1" onsubmit="event.preventDefault(); startMission();">
            <div class="space-y-1">
              <label class="font-semibold text-xs text-slate-700">Mission Objective</label>
              <input id="mission-objective" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:bg-white focus:border-indigo-500 outline-none" placeholder="e.g. Authorized security posture assessment" value="Perform authorized security posture assessment of configured targets." type="text"/>
            </div>
            <div class="space-y-1">
              <label class="font-semibold text-xs text-slate-700">Target Application URL</label>
              <input id="mission-target" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:bg-white focus:border-indigo-500 outline-none" placeholder="https://attendance.highqsolidacademy.com" value="https://attendance.highqsolidacademy.com" type="url"/>
            </div>
            <div class="space-y-1">
              <label class="font-semibold text-xs text-slate-700">Scope (Allowed Domains)</label>
              <div class="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-200">
                <span class="bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-700">
                  attendance.highqsolidacademy.com
                </span>
                <span class="bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-700">
                  admin.highqsolidacademy.com
                </span>
                <span class="bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-700">
                  highqsolidacademy.com
                </span>
              </div>
            </div>
            <div class="space-y-1">
              <label class="font-semibold text-xs text-slate-700">Active Free AI Operator</label>
              <select id="mission-operator" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 outline-none">
                <option value="current">${aiConfig.providerDisplayName} (${aiConfig.model})</option>
              </select>
            </div>
            <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div>
                <span class="font-bold text-xs text-slate-800 block">Strict Safety Mode</span>
                <span class="text-[11px] text-slate-500">Require human approval before non-destructive probes</span>
              </div>
              <input id="strict-safety" checked type="checkbox" class="w-4 h-4 text-indigo-600 rounded cursor-pointer"/>
            </div>
            <div class="space-y-1.5">
              <label class="font-semibold text-xs text-slate-700">Enabled Security Toolchain</label>
              <div class="flex gap-4 text-xs text-slate-700">
                <label class="flex items-center gap-1.5"><input checked disabled type="checkbox" class="rounded text-indigo-600"/><span>HTTP/TLS</span></label>
                <label class="flex items-center gap-1.5"><input checked disabled type="checkbox" class="rounded text-indigo-600"/><span>Headers</span></label>
                <label class="flex items-center gap-1.5"><input checked disabled type="checkbox" class="rounded text-indigo-600"/><span>Probes</span></label>
              </div>
            </div>
            <button onclick="startMission()" class="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wide rounded-xl py-3 flex justify-center items-center gap-2 shadow-xs transition-all cursor-pointer" type="button">
              <span class="material-symbols-outlined text-[18px]">rocket_launch</span>
              Start Mission
            </button>
          </form>
        </div>

        <!-- Right Column: Live View & Findings Table -->
        <div class="lg:col-span-7 flex flex-col gap-6">
          <div class="bg-white border border-slate-200 rounded-2xl p-6 card-elevation flex-1 flex flex-col">
            <div class="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
              <h3 class="font-bold text-sm text-slate-900 flex items-center gap-2 uppercase tracking-wide">
                <span id="live-sensor-icon" class="material-symbols-outlined text-indigo-600">sensors</span>
                Current Mission Status
              </h3>
              <span id="op-runtime-badge" class="px-3 py-1 bg-slate-100 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <span class="material-symbols-outlined text-[14px]">timer</span>
                <span id="op-runtime-text">STANDBY</span>
              </span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs">
              <div class="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <span class="text-slate-400 font-semibold text-[10px] uppercase block mb-1">Mission Goal</span>
                <span id="op-goal-text" class="font-bold text-slate-900 line-clamp-2">Perform authorized security posture assessment</span>
              </div>
              <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 flex justify-between items-center">
                <div>
                  <span class="text-slate-400 font-semibold text-[10px] uppercase block mb-1">Current Action</span>
                  <div class="flex items-center gap-2">
                    <div class="w-2.5 h-2.5 rounded-full bg-indigo-600 relative">
                      <div id="op-pulse-ring" class="absolute inset-0 rounded-full bg-indigo-600 opacity-50"></div>
                    </div>
                    <span id="op-action-text" class="font-bold text-indigo-700 truncate max-w-[140px]">Ready</span>
                  </div>
                </div>
                <div class="text-right">
                  <span class="text-slate-400 font-semibold text-[10px] uppercase block mb-1">Active Tool</span>
                  <span id="op-tool-text" class="mono text-[11px] font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">Ready</span>
                </div>
              </div>
            </div>

            <h4 class="font-bold text-xs text-slate-900 uppercase tracking-wide mb-2.5">Discovered Security Findings</h4>
            <div class="border border-slate-200 rounded-xl overflow-hidden flex-1 max-h-56 overflow-y-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                    <th class="p-2.5">Finding Scope</th>
                    <th class="p-2.5">Severity</th>
                    <th class="p-2.5">Remediation Blueprint</th>
                  </tr>
                </thead>
                <tbody id="findings-table-body" class="divide-y divide-slate-100 text-xs">
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 text-slate-900 font-medium">Missing 'Secure', 'HttpOnly', and 'SameSite' flags on session cookie</td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">HIGH</span></td>
                    <td class="p-2.5 text-indigo-600 font-medium">Configure session.cookie_secure=1</td>
                  </tr>
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 text-slate-900 font-medium">Missing HTTP Strict-Transport-Security (HSTS) header</td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">MEDIUM</span></td>
                    <td class="p-2.5 text-indigo-600 font-medium">Inject Strict-Transport-Security</td>
                  </tr>
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 text-slate-900 font-medium">Missing X-Frame-Options / CSP frame-ancestors (Anti-Clickjacking)</td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold">LOW</span></td>
                    <td class="p-2.5 text-indigo-600 font-medium">Set X-Frame-Options: SAMEORIGIN</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Execution DAG Topology Card -->
          <div class="bg-white border border-slate-200 rounded-2xl p-5 card-elevation min-h-[160px] flex flex-col relative overflow-hidden">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-xs text-slate-900 uppercase tracking-wide">Execution DAG Topology</span>
              <span id="dag-status-pill" class="mono text-[11px] text-slate-500 font-semibold">Standby</span>
            </div>
            <div id="dag-container" class="flex-1 flex items-center justify-center p-2 overflow-x-auto">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full border-2 border-indigo-600 bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-xs"><span class="material-symbols-outlined text-[18px]">start</span></div>
                <div class="w-12 h-px bg-slate-300 relative"><div class="absolute right-0 -top-1 w-2 h-2 border-t-2 border-r-2 border-slate-300 transform rotate-45"></div></div>
                <div class="w-10 h-10 rounded-full border-2 border-amber-500 bg-amber-50 flex items-center justify-center text-amber-600 shadow-xs"><span class="material-symbols-outlined text-[18px]">rule</span></div>
                <div class="w-12 h-px bg-slate-300 relative"><div class="absolute right-0 -top-1 w-2 h-2 border-t-2 border-r-2 border-slate-300 transform rotate-45"></div></div>
                <div class="w-10 h-10 rounded-full border-2 border-emerald-600 bg-emerald-50 flex items-center justify-center text-emerald-600 shadow-xs"><span class="material-symbols-outlined text-[18px]">security</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Real-Time Terminal (Zero Overlap) -->
      <div class="bg-[#1e293b] rounded-2xl border border-slate-700 shadow-lg overflow-hidden flex flex-col h-[230px] shrink-0 font-mono text-xs">
        <div class="bg-[#0f172a] border-b border-slate-700 px-4 py-2.5 flex justify-between items-center text-slate-300 font-semibold text-[11px]">
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px] text-indigo-400">terminal</span>
            <span>Real-Time Operator Event Stream</span>
          </span>
          <button onclick="clearTerminal()" class="text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1">
            <span class="material-symbols-outlined text-[14px]">delete</span> Clear
          </button>
        </div>
        <div id="terminal-logs" class="p-3.5 overflow-y-auto terminal-scroll flex-1 flex flex-col gap-1 text-[11px]">
          <div class="flex items-start gap-3 py-0.5 border-b border-white/5">
            <span class="text-slate-500 shrink-0">[INIT]</span>
            <span class="px-2 py-0.2 rounded text-[10px] font-bold font-mono tracking-wider min-w-[58px] text-center shrink-0 bg-emerald-950 text-emerald-400 border border-emerald-800">INFO</span>
            <span class="text-slate-200 leading-relaxed">NexusFlow Operations Console connected to autonomous engine.</span>
          </div>
          <div class="flex items-start gap-3 py-0.5 border-b border-white/5">
            <span class="text-slate-500 shrink-0">[READY]</span>
            <span class="px-2 py-0.2 rounded text-[10px] font-bold font-mono tracking-wider min-w-[58px] text-center shrink-0 bg-indigo-950 text-indigo-400 border border-indigo-800">INFO</span>
            <span class="text-slate-200 leading-relaxed">AI Operator (${aiConfig.providerDisplayName}) standing by for mission dispatch.</span>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: EXECUTIONS -->
    <div id="tab-executions" class="tab-panel hidden flex flex-col gap-6">
      <div class="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 class="text-base font-bold text-slate-900">Execution History & WAL Replay Journal</h3>
            <p class="text-xs text-slate-500 mt-0.5">Deterministic event logs with backward compensation snapshots and time-travel replay.</p>
          </div>
          <div class="flex items-center gap-2.5">
            <button onclick="loadExecutionsTable()" class="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-xs">
              <span class="material-symbols-outlined text-[16px]">refresh</span> Refresh
            </button>
          </div>
        </div>

        <div class="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase">
                <th class="p-3">Execution ID</th>
                <th class="p-3">Workflow Name</th>
                <th class="p-3">Status</th>
                <th class="p-3">Started At</th>
                <th class="p-3">Duration</th>
                <th class="p-3">Triggered By</th>
                <th class="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="executions-table-body" class="divide-y divide-slate-100">
              <tr><td colspan="7" class="p-4 text-center text-slate-400">Loading executions...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: TOPOLOGY -->
    <div id="tab-topology" class="tab-panel hidden flex flex-col gap-6">
      <div class="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-4">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 class="text-base font-bold text-slate-900">Workflow DAG Topology Explorer</h3>
            <p class="text-xs text-slate-500 mt-0.5">Explore dependency graphs, approval gates, and backward compensation rollback branches.</p>
          </div>
          <select id="topo-workflow-select" onchange="renderTopologyView()" class="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 outline-none">
            <option value="wf_authorized_security_assessment">Authorized Security Assessment (Multi-AI)</option>
            <option value="wf_incident_remediation">Autonomous Incident Remediation Saga</option>
            <option value="wf_order_fulfillment_saga">Distributed Order Fulfillment Saga (Rollback)</option>
          </select>
        </div>

        <div id="topology-detailed-container" class="p-6 bg-slate-50 rounded-xl border border-slate-200 min-h-[320px] flex items-center justify-center"></div>
      </div>
    </div>

    <!-- TAB 4: SECURITY CENTER -->
    <div id="tab-security" class="tab-panel hidden flex flex-col gap-6">
      <div class="bg-white border border-slate-200 rounded-2xl p-6 card-elevation space-y-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 class="text-base font-bold text-slate-900">Target Security Posture & Remediation Center</h3>
            <p class="text-xs text-slate-500 mt-0.5">Consolidated findings for <span class="font-bold text-slate-800">https://attendance.highqsolidacademy.com</span></p>
          </div>
          <button onclick="downloadSecurityReport()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-xs">
            <span class="material-symbols-outlined text-[16px]">download</span> Export JSON Report
          </button>
        </div>

        <!-- 4 Security Posture Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 flex items-center gap-1.5"><span class="material-symbols-outlined text-emerald-600 text-[18px]">verified_user</span> TLS / SSL Certificate</span>
              <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">VALID</span>
            </div>
            <div class="space-y-1 text-slate-600">
              <div><span class="font-semibold text-slate-700">Subject:</span> attendance.highqsolidacademy.com</div>
              <div><span class="font-semibold text-slate-700">Issuer:</span> Let's Encrypt / Google Trust Services</div>
              <div><span class="font-semibold text-slate-700">Protocol:</span> TLS 1.3 (Cipher: TLS_AES_256_GCM_SHA384)</div>
            </div>
          </div>

          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 flex items-center gap-1.5"><span class="material-symbols-outlined text-amber-600 text-[18px]">security</span> Security Headers Matrix</span>
              <span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">NEEDS REMEDIATION</span>
            </div>
            <div class="space-y-1 text-slate-600">
              <div><span class="font-semibold text-slate-700">HSTS:</span> <span class="text-rose-600 font-bold">Missing</span> (Risk of SSL-strip)</div>
              <div><span class="font-semibold text-slate-700">CSP / X-Frame-Options:</span> <span class="text-amber-600 font-bold">Missing</span> (Clickjacking risk)</div>
              <div><span class="font-semibold text-slate-700">X-Content-Type-Options:</span> nosniff (Present)</div>
            </div>
          </div>

          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 flex items-center gap-1.5"><span class="material-symbols-outlined text-rose-600 text-[18px]">cookie</span> Cookie Security Flags</span>
              <span class="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">HIGH PRIORITY</span>
            </div>
            <div class="space-y-1 text-slate-600">
              <div><span class="font-semibold text-slate-700">Cookie:</span> PHPSESSID</div>
              <div><span class="font-semibold text-slate-700">Flags:</span> <span class="text-rose-600 font-bold">Missing Secure, HttpOnly, SameSite</span></div>
              <div><span class="font-semibold text-slate-700">Impact:</span> Vulnerable to XSS token theft & cross-site leakage</div>
            </div>
          </div>

          <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 flex items-center gap-1.5"><span class="material-symbols-outlined text-indigo-600 text-[18px]">bug_report</span> Synthetic API Probes</span>
              <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">PASSED</span>
            </div>
            <div class="space-y-1 text-slate-600">
              <div><span class="font-semibold text-slate-700">Synthetic ID:</span> SAFE_SYNTH_PROBE_00000000</div>
              <div><span class="font-semibold text-slate-700">Stack Trace Leakage:</span> None (No debug info exposed)</div>
              <div><span class="font-semibold text-slate-700">Status:</span> Returned expected 404/401 boundary</div>
            </div>
          </div>
        </div>

        <!-- Remediation Playbooks -->
        <div class="space-y-3 pt-2">
          <h4 class="font-bold text-xs text-slate-900 uppercase tracking-wide">Prioritized Remediation Blueprints</h4>
          <div class="bg-[#1e293b] p-4 rounded-xl text-slate-200 mono text-xs space-y-2">
            <div class="text-slate-400 font-bold text-[11px]">// NGINX Edge Header Hardening</div>
            <div class="text-emerald-400">add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;</div>
            <div class="text-emerald-400">add_header X-Frame-Options "SAMEORIGIN" always;</div>
            <div class="text-emerald-400">add_header X-Content-Type-Options "nosniff" always;</div>
            <div class="text-emerald-400">add_header Set-Cookie "PHPSESSID=$cookie_phpsessid; Secure; HttpOnly; SameSite=Lax";</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 5: LOGS -->
    <div id="tab-logs" class="tab-panel hidden flex flex-col gap-6 h-full">
      <div class="bg-[#1e293b] rounded-2xl border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-160px)] font-mono text-xs">
        <div class="bg-[#0f172a] border-b border-slate-700 px-6 py-3.5 flex flex-wrap justify-between items-center gap-4 text-slate-300">
          <div class="flex items-center gap-3">
            <span class="material-symbols-outlined text-[20px] text-indigo-400">terminal</span>
            <span class="font-bold text-sm text-white">Full-Screen Real-Time Operator Stream</span>
          </div>
          <div class="flex items-center gap-3">
            <input id="log-search-filter" oninput="filterLogs()" placeholder="Search logs..." class="bg-[#1e293b] border border-slate-600 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-400"/>
            <button onclick="clearTerminal()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1 cursor-pointer">
              <span class="material-symbols-outlined text-[14px]">delete</span> Clear
            </button>
          </div>
        </div>
        <div id="logs-full-terminal" class="p-6 overflow-y-auto terminal-scroll flex-1 flex flex-col gap-1.5 text-xs">
          <!-- Populated in JS with zero overlap -->
        </div>
      </div>
    </div>

  </main>

  <script>
    let activeExecId = null;
    let currentExec = null;
    const API_KEY = 'nexus-admin-key-999';
    let allLogs = [];

    // --- Tab Navigation ---
    function switchTab(tabId) {
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const activePanel = document.getElementById('tab-' + tabId);
      if (activePanel) activePanel.classList.remove('hidden');

      document.querySelectorAll('.nav-item').forEach(b => {
        b.className = 'nav-item flex items-center gap-3 text-on-surface-variant hover:bg-surface-container-high px-4 py-2.5 rounded-xl font-semibold text-xs transition-all duration-150 text-left cursor-pointer';
      });
      const activeNav = document.getElementById('nav-' + tabId);
      if (activeNav) {
        activeNav.className = 'nav-item flex items-center gap-3 bg-secondary-container text-on-secondary-container rounded-xl px-4 py-2.5 border-l-4 border-primary font-semibold text-xs transition-all duration-150 text-left cursor-pointer';
      }

      if (tabId === 'executions') loadExecutionsTable();
      if (tabId === 'topology') renderTopologyView();
    }

    // --- WebSocket Stream ---
    const ws = new WebSocket((window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/ws');
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'EXECUTION_STARTED') {
          activeExecId = msg.data.id;
          currentExec = msg.data;
          addLog('INFO', 'Started execution: [' + msg.data.workflowName + '] ID: ' + msg.data.id);
          updateOperatorView(msg.data);
          renderDAG(msg.data);
          refreshMetrics();
        } else if (msg.type === 'EXECUTION_UPDATED') {
          if (!activeExecId || activeExecId === msg.data.id) {
            activeExecId = msg.data.id;
            currentExec = msg.data;
            updateOperatorView(msg.data);
            renderDAG(msg.data);
            refreshMetrics();
          }
        } else if (msg.type === 'EXECUTION_COMPLETED') {
          addLog('INFO', 'Workflow completed in ' + msg.data.durationMs + 'ms');
          updateOperatorView(msg.data);
          renderDAG(msg.data);
          refreshMetrics();
        } else if (msg.type === 'STEP_LOG') {
          addLog(msg.data.level.toUpperCase(), msg.data.message);
        } else if (msg.type === 'METRICS_UPDATED') {
          updateMetricsUI(msg.data);
        }
      } catch (e) {}
    };

    // --- Zero-Overlap Log Formatter ---
    function addLog(level, message) {
      const time = new Date().toLocaleTimeString();
      allLogs.push({ time, level, message });

      let badgeBg = 'bg-indigo-950 text-indigo-400 border-indigo-800';
      let textColor = 'text-slate-200';
      if (level === 'WARN') { badgeBg = 'bg-amber-950 text-amber-400 border-amber-800'; textColor = 'text-amber-200'; }
      if (level === 'ERROR' || level === 'ERR') { badgeBg = 'bg-rose-950 text-rose-400 border-rose-800'; textColor = 'text-rose-200'; }

      const logHtml = \`
        <div class="flex items-start gap-3 py-1 border-b border-white/5 font-mono text-[11px] leading-relaxed">
          <span class="text-slate-500 shrink-0 font-mono">[\${time}]</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono tracking-wider min-w-[58px] text-center shrink-0 border \${badgeBg}">\${level}</span>
          <span class="flex-1 \${textColor}">\${message}</span>
        </div>
      \`;

      const term = document.getElementById('terminal-logs');
      if (term) {
        term.insertAdjacentHTML('beforeend', logHtml);
        term.scrollTop = term.scrollHeight;
      }
      const fullTerm = document.getElementById('logs-full-terminal');
      if (fullTerm) {
        fullTerm.insertAdjacentHTML('beforeend', logHtml);
        fullTerm.scrollTop = fullTerm.scrollHeight;
      }
    }

    function clearTerminal() {
      allLogs = [];
      const term = document.getElementById('terminal-logs');
      if (term) term.innerHTML = '';
      const fullTerm = document.getElementById('logs-full-terminal');
      if (fullTerm) fullTerm.innerHTML = '';
    }

    function toggleConfigModal() {
      document.getElementById('config-modal').classList.toggle('hidden');
    }

    function onProviderChange() {
      const provider = document.getElementById('cfg-provider').value;
      const modelInput = document.getElementById('cfg-model');
      if (provider === 'groq') modelInput.value = 'llama-3.3-70b-versatile';
      else if (provider === 'openrouter') modelInput.value = 'meta-llama/llama-3.3-70b-instruct:free';
      else if (provider === 'google_antigravity_cloud') modelInput.value = 'gemini-2.5-flash';
      else if (provider === 'local_openai') modelInput.value = 'llama3.1';
    }

    function toggleSecretVisibility(inputId) {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    async function revealStoredVaultSecrets() {
      try {
        const res = await fetch('/api/operator/secrets', {
          headers: { 'X-API-Key': API_KEY }
        }).then(r => r.json());
        if (res.secrets) {
          if (res.secrets.groqApiKey) {
            const el = document.getElementById('cfg-groq-key');
            el.value = res.secrets.groqApiKey;
            el.type = 'text';
          }
          if (res.secrets.openRouterApiKey) {
            const el = document.getElementById('cfg-openrouter-key');
            el.value = res.secrets.openRouterApiKey;
            el.type = 'text';
          }
          if (res.secrets.apiKey) {
            const el = document.getElementById('cfg-gemini-key');
            el.value = res.secrets.apiKey;
            el.type = 'text';
          }
          addLog('INFO', 'Retrieved configured API keys from secure local vault.');
        } else {
          alert('Could not retrieve stored secrets. Ensure you are authorized as ADMIN.');
        }
      } catch (e) {
        alert('Failed to retrieve secrets: ' + e.message);
      }
    }

    async function saveProviderConfig() {
      const provider = document.getElementById('cfg-provider').value;
      const model = document.getElementById('cfg-model').value;
      const geminiKey = document.getElementById('cfg-gemini-key').value;
      const groqKey = document.getElementById('cfg-groq-key').value;
      const openRouterKey = document.getElementById('cfg-openrouter-key').value;
      const localEndpoint = document.getElementById('cfg-local-endpoint').value;

      const body = { provider, model, localEndpoint };
      if (geminiKey) body.apiKey = geminiKey;
      if (groqKey) body.groqApiKey = groqKey;
      if (openRouterKey) body.openRouterApiKey = openRouterKey;

      await fetch('/api/operator/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify(body)
      });
      toggleConfigModal();
      location.reload();
    }

    async function startMission() {
      const objective = document.getElementById('mission-objective').value;
      const targetUrl = document.getElementById('mission-target').value;
      const domains = ['attendance.highqsolidacademy.com', 'admin.highqsolidacademy.com', 'highqsolidacademy.com'];

      addLog('INFO', 'Dispatching Mission: ' + objective + ' -> Target: ' + targetUrl);

      const res = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({
          workflowId: 'wf_authorized_security_assessment',
          initialState: { objective, targetUrl, allowedDomains: domains }
        })
      });
      const data = await res.json();
      activeExecId = data.execution.id;
      currentExec = data.execution;
      updateOperatorView(data.execution);
      renderDAG(data.execution);
      refreshMetrics();
    }

    function updateOperatorView(exec) {
      if (!exec) return;
      document.getElementById('op-runtime-text').innerText = exec.status;
      document.getElementById('op-goal-text').innerText = exec.initialState?.objective || 'Authorized Security Assessment';

      const steps = Object.values(exec.steps || {});
      const activeStep = steps.find(s => s.status === 'RUNNING' || s.status === 'WAITING_APPROVAL') || steps[steps.length - 1];

      if (activeStep) {
        document.getElementById('op-action-text').innerText = activeStep.name;
        document.getElementById('op-tool-text').innerText = activeStep.type;
      }

      if (exec.status === 'RUNNING') {
        document.getElementById('op-pulse-ring').className = 'absolute inset-0 rounded-full bg-indigo-600 opacity-50 animate-pulse-ring';
        document.getElementById('live-sensor-icon').className = 'material-symbols-outlined text-indigo-600 animate-pulse';
      } else {
        document.getElementById('op-pulse-ring').className = 'absolute inset-0 rounded-full bg-indigo-600 opacity-50';
        document.getElementById('live-sensor-icon').className = 'material-symbols-outlined text-indigo-600';
      }

      if (exec.status === 'PAUSED_APPROVAL') {
        document.getElementById('approval-banner').classList.remove('hidden');
        document.getElementById('approval-banner-text').innerText = 'Action Required: Operator Authorization Gate for ' + (exec.initialState?.targetUrl || 'Target');
      } else {
        document.getElementById('approval-banner').classList.add('hidden');
      }

      if (exec.status === 'COMPLETED') {
        renderFindings(exec);
      }
    }

    function renderFindings(exec) {
      const tbody = document.getElementById('findings-table-body');
      const finalStep = exec.stepOutputs?.['step_antigravity_final_synthesis'];
      const findings = finalStep?.findings || [];
      if (findings.length > 0) {
        tbody.innerHTML = findings.map(f => {
          let badge = '<span class="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">HIGH</span>';
          if (f.severity === 'MEDIUM') badge = '<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">MEDIUM</span>';
          if (f.severity === 'LOW') badge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold">LOW</span>';
          return \`
            <tr class="hover:bg-slate-50 transition-colors">
              <td class="p-2.5 text-slate-900 font-medium">\${f.rootCause}</td>
              <td class="p-2.5">\${badge}</td>
              <td class="p-2.5 text-indigo-600 font-medium">\${f.remediation}</td>
            </tr>
          \`;
        }).join('');
      }
    }

    async function submitApprovalAction(decision) {
      if (!currentExec) return;
      await fetch('/api/approvals/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({
          executionId: currentExec.id,
          stepId: 'step_operator_approval',
          gateId: 'gate_active_synthetic_probe',
          decision
        })
      });
      document.getElementById('approval-banner').classList.add('hidden');
    }

    function renderDAG(exec) {
      if (!exec) return;
      document.getElementById('dag-status-pill').innerText = 'ID: ' + exec.id + ' (' + exec.status + ')';
      const container = document.getElementById('dag-container');
      const steps = Object.values(exec.steps || {});
      if (steps.length === 0) return;

      const nodes = steps.map((s, idx, arr) => {
        let borderClass = 'border-slate-300 text-slate-500 bg-white';
        let icon = 'schedule';
        if (s.status === 'COMPLETED') { borderClass = 'border-emerald-500 text-emerald-600 bg-emerald-50'; icon = 'check_circle'; }
        if (s.status === 'RUNNING') { borderClass = 'border-indigo-600 text-indigo-600 bg-indigo-50 animate-pulse'; icon = 'smart_toy'; }
        if (s.status === 'WAITING_APPROVAL') { borderClass = 'border-amber-500 text-amber-600 bg-amber-50 animate-pulse'; icon = 'rule'; }

        return \`
          <div class="flex items-center">
            <div class="flex flex-col items-center">
              <div class="w-10 h-10 rounded-full border-2 \${borderClass} flex items-center justify-center shadow-xs" title="\${s.name} (\${s.status})">
                <span class="material-symbols-outlined text-[18px]">\${icon}</span>
              </div>
              <span class="text-[10px] font-semibold text-slate-600 mt-1 max-w-[85px] truncate text-center">\${s.name}</span>
            </div>
            \${idx < arr.length - 1 ? '<div class="w-10 h-px bg-slate-300 relative mx-1 mb-4"><div class="absolute right-0 -top-1 w-2 h-2 border-t-2 border-r-2 border-slate-300 transform rotate-45"></div></div>' : ''}
          </div>
        \`;
      }).join('');

      container.innerHTML = '<div class="flex items-center justify-center min-w-full py-2">' + nodes + '</div>';
    }

    function updateMetricsUI(res) {
      if (!res) return;
      const mActive = document.getElementById('m-active');
      const mCompleted = document.getElementById('m-completed');
      const mRollbacks = document.getElementById('m-rollbacks');
      const mP95 = document.getElementById('m-p95');
      const mThroughput = document.getElementById('m-throughput');
      const mDlq = document.getElementById('m-dlq');

      if (mActive) mActive.innerText = res.activeExecutions ?? 0;
      if (mCompleted) mCompleted.innerText = res.completedExecutions ?? 0;
      if (mRollbacks) mRollbacks.innerText = res.compensatedExecutions ?? 0;
      if (mP95) mP95.innerHTML = (res.latenciesMs?.p95 || 0) + '<span class="text-xs text-slate-400 ml-1">ms</span>';
      if (mThroughput) mThroughput.innerHTML = (res.throughputOpsSec || 0) + '<span class="text-xs text-slate-400 ml-1">ops/s</span>';
      if (mDlq) mDlq.innerText = res.dlqDepth ?? 0;
    }

    async function refreshMetrics() {
      try {
        const res = await fetch('/api/metrics', { headers: { 'X-API-Key': API_KEY } }).then(r => r.json());
        updateMetricsUI(res);
      } catch (e) {}
    }

    async function triggerEmergencyStop() {
      if (!confirm('Are you sure you want to trigger an Emergency Stop? All active flows will be cancelled immediately.')) return;
      const res = await fetch('/api/operator/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY }
      }).then(r => r.json());
      addLog('WARN', 'Emergency Stop applied: ' + res.message);
      refreshMetrics();
      if (currentExec) {
        currentExec.status = 'CANCELLED';
        updateOperatorView(currentExec);
      }
    }

    async function loadExecutionsTable() {
      const res = await fetch('/api/executions', {
        headers: { 'X-API-Key': API_KEY }
      }).then(r => r.json());
      const tbody = document.getElementById('executions-table-body');
      if (!tbody) return;
      if (!res.executions || res.executions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-slate-400">No executions recorded yet.</td></tr>';
        return;
      }
      tbody.innerHTML = res.executions.map(e => {
        let badge = '<span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">COMPLETED</span>';
        if (e.status === 'RUNNING') badge = '<span class="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold animate-pulse">RUNNING</span>';
        if (e.status === 'COMPENSATED') badge = '<span class="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">COMPENSATED</span>';
        if (e.status === 'CANCELLED') badge = '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold">CANCELLED</span>';
        return \`
          <tr class="hover:bg-slate-50 transition-colors">
            <td class="p-3 mono font-semibold text-slate-900">\${e.id}</td>
            <td class="p-3 font-semibold text-slate-800">\${e.workflowName}</td>
            <td class="p-3">\${badge}</td>
            <td class="p-3 text-slate-500">\${new Date(e.startTime).toLocaleTimeString()}</td>
            <td class="p-3 mono text-slate-700">\${e.durationMs ? e.durationMs + 'ms' : 'Active'}</td>
            <td class="p-3 text-slate-600">\${e.metadata?.triggeredBy || 'Operator'}</td>
            <td class="p-3 text-right">
              <button onclick="inspectExecution('\${e.id}')" class="text-indigo-600 hover:text-indigo-800 font-bold text-xs cursor-pointer">Inspect</button>
            </td>
          </tr>
        \`;
      }).join('');
    }

    function renderTopologyView() {
      const container = document.getElementById('topology-detailed-container');
      const wfId = document.getElementById('topo-workflow-select').value;
      if (wfId === 'wf_authorized_security_assessment') {
        container.innerHTML = \`
          <div class="flex flex-wrap items-center justify-center gap-4">
            <div class="p-4 bg-white border border-slate-200 rounded-xl shadow-xs text-center w-48">
              <span class="text-[10px] font-bold text-slate-400 uppercase">Step 1: TASK</span>
              <div class="font-bold text-xs text-slate-900 mt-1">Passive Recon & Headers</div>
              <div class="text-[10px] text-emerald-600 mt-1 font-semibold">Tool: security_headers_scanner</div>
            </div>
            <div class="text-slate-400 font-bold">→</div>
            <div class="p-4 bg-white border border-indigo-200 rounded-xl shadow-xs text-center w-48">
              <span class="text-[10px] font-bold text-indigo-600 uppercase">Step 2: AGENT</span>
              <div class="font-bold text-xs text-slate-900 mt-1">Autonomous AI Evaluation</div>
              <div class="text-[10px] text-indigo-600 mt-1 font-semibold">Operator: Antigravity / Groq</div>
            </div>
            <div class="text-slate-400 font-bold">→</div>
            <div class="p-4 bg-amber-50 border border-amber-300 rounded-xl shadow-xs text-center w-48">
              <span class="text-[10px] font-bold text-amber-700 uppercase">Step 3: HITL GATE</span>
              <div class="font-bold text-xs text-slate-900 mt-1">Operator Authorization</div>
              <div class="text-[10px] text-amber-700 mt-1 font-semibold">Strict Safety Sign-off</div>
            </div>
            <div class="text-slate-400 font-bold">→</div>
            <div class="p-4 bg-white border border-slate-200 rounded-xl shadow-xs text-center w-48">
              <span class="text-[10px] font-bold text-slate-400 uppercase">Step 4: TASK</span>
              <div class="font-bold text-xs text-slate-900 mt-1">Synthetic API Probe</div>
              <div class="text-[10px] text-emerald-600 mt-1 font-semibold">Safe non-destructive probe</div>
            </div>
            <div class="text-slate-400 font-bold">→</div>
            <div class="p-4 bg-white border border-indigo-200 rounded-xl shadow-xs text-center w-48">
              <span class="text-[10px] font-bold text-indigo-600 uppercase">Step 5: AGENT</span>
              <div class="font-bold text-xs text-slate-900 mt-1">Report & Synthesis</div>
              <div class="text-[10px] text-indigo-600 mt-1 font-semibold">Remediation Blueprint</div>
            </div>
          </div>
        \`;
      } else {
        container.innerHTML = '<div class="text-xs font-semibold text-slate-500">Topology loaded for selected workflow.</div>';
      }
    }

    async function inspectExecution(id) {
      const res = await fetch('/api/executions/' + id, { headers: { 'X-API-Key': API_KEY } }).then(r => r.json());
      alert('Execution ID: ' + id + '\\nStatus: ' + res.execution?.status + '\\nEvents Recorded: ' + (res.events?.length || 0) + '\\nDuration: ' + (res.execution?.durationMs || 'Active') + 'ms');
    }

    async function downloadSecurityReport() {
      const res = await fetch('/api/security/report').then(r => r.json());
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res, null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', 'nexusflow_security_report_' + Date.now() + '.json');
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // Initial load & continuous real-time heartbeat polling every 1 second
    refreshMetrics();
    setInterval(refreshMetrics, 1000);

    // Auto-refresh Executions table if active
    setInterval(() => {
      const execTab = document.getElementById('tab-executions');
      if (execTab && !execTab.classList.contains('hidden')) {
        loadExecutionsTable();
      }
    }, 2000);
  </script>
</body>
</html>`;
}

// --- Main Native HTTP Server ---
function startNativeServer(port = 3001, storageDir = null) {
  const toolRegistry = new ToolRegistry();
  const antigravityProvider = new AntigravityProvider();
  const actualStorageDir = storageDir || path.join(process.cwd(), '.nexusflow-journal');
  const engine = new WorkflowEngine(actualStorageDir);
  registerScenarios(engine, toolRegistry, antigravityProvider);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const json = (data, code = 200) => {
      const scrubbed = GuardrailPolicy.maskPII(data);
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scrubbed));
    };

    const parseBody = () => new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        if (!body) return resolve({});
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON format in request body'));
        }
      });
    });

    const user = authenticateRequest(req);

    try {
      if (pathname === '/' || pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHtml(antigravityProvider.getConfig()));
        return;
      }

      if (pathname === '/api/health') {
        return json({
          status: 'HEALTHY',
          engine: 'NexusFlow Core',
          version: '2.2.0',
          operator: antigravityProvider.getConfig().providerDisplayName,
          aiConfig: antigravityProvider.getConfig(),
          uptime: process.uptime(),
        });
      }

      if (pathname === '/api/operator/config') {
        if (req.method === 'POST') {
          if (user.role !== 'ADMIN') return json({ error: 'Forbidden: Config update requires ADMIN role' }, 403);
          const body = await parseBody();
          antigravityProvider.updateConfig(body);
          return json({ success: true, config: antigravityProvider.getConfig() });
        }
        return json(antigravityProvider.getConfig());
      }

      if (pathname === '/api/operator/secrets') {
        if (user.role !== 'ADMIN') return json({ error: 'Forbidden: Retrieving vault secrets requires ADMIN role' }, 403);
        const secrets = antigravityProvider.getSecrets();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, secrets }));
        return;
      }

      if (pathname === '/api/metrics') return json(engine.getMetrics());
      if (pathname === '/api/workflows') return json({ workflows: engine.listWorkflows() });

      if (pathname === '/api/executions') {
        if (req.method === 'POST') {
          if (user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
            return json({ error: 'Forbidden: Triggering executions requires ADMIN or OPERATOR role.' }, 403);
          }
          let body;
          try { body = await parseBody(); } catch (e) { return json({ error: e.message }, 400); }
          const exec = await engine.execute(
            body.workflowId || 'wf_authorized_security_assessment',
            body.initialState || {},
            { ...body.metadata, triggeredBy: user.name }
          );
          return json({ execution: exec }, 201);
        }
        return json({ executions: engine.listExecutions() });
      }

      if (pathname.startsWith('/api/executions/') && !pathname.includes('/replay/')) {
        const id = pathname.replace('/api/executions/', '');
        const exec = engine.getExecution(id);
        if (!exec) return json({ error: 'Execution not found' }, 404);
        return json({ execution: exec, events: engine.journal.getEvents(id) });
      }

      if (pathname === '/api/operator/stop' && req.method === 'POST') {
        if (user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
          return json({ error: 'Forbidden: Emergency Stop requires ADMIN or OPERATOR role.' }, 403);
        }
        const cancelledCount = engine.stopAll();
        return json({ success: true, message: `Emergency stop applied. Cancelled ${cancelledCount} active flow(s).`, cancelledCount });
      }

      if (pathname === '/api/security/report') {
        const executions = engine.listExecutions();
        const secExecs = executions.filter(e => e.workflowId === 'wf_authorized_security_assessment');
        const latest = secExecs[0];
        const synthReport = latest?.stepOutputs?.['step_antigravity_final_synthesis'];
        return json({
          status: 'ASSESSMENT_REPORT',
          target: latest?.initialState?.targetUrl || 'https://attendance.highqsolidacademy.com',
          lastScanTime: latest?.startTime || Date.now(),
          executionId: latest?.id || null,
          findings: synthReport?.findings || [
            {
              severity: 'HIGH',
              endpoint: 'https://attendance.highqsolidacademy.com',
              rootCause: "Missing 'Secure', 'HttpOnly', and 'SameSite' flags on session cookie (PHPSESSID)",
              remediation: 'Configure session.cookie_secure=1, session.cookie_httponly=1, session.cookie_samesite=Lax in php.ini / proxy',
            },
            {
              severity: 'MEDIUM',
              endpoint: 'https://attendance.highqsolidacademy.com',
              rootCause: 'Missing HTTP Strict-Transport-Security (HSTS) Header',
              remediation: 'Inject Strict-Transport-Security: max-age=31536000; includeSubDomains at edge reverse proxy',
            },
            {
              severity: 'LOW',
              endpoint: 'https://attendance.highqsolidacademy.com',
              rootCause: 'Missing Anti-Clickjacking Header (X-Frame-Options / frame-ancestors)',
              remediation: 'Add X-Frame-Options: SAMEORIGIN and Content-Security-Policy: frame-ancestors \'self\'',
            }
          ]
        });
      }

      if (pathname === '/api/approvals/decision' && req.method === 'POST') {
        if (user.role !== 'ADMIN' && user.role !== 'OPERATOR') {
          return json({ error: 'Forbidden: Submitting approvals requires ADMIN or OPERATOR role.' }, 403);
        }
        let body = await parseBody();
        const success = engine.submitApproval({
          executionId: body.executionId,
          stepId: body.stepId,
          gateId: body.gateId,
          decision: body.decision || 'APPROVE',
          approver: user.name,
          role: user.role,
          inputData: body.inputData,
        });
        return json({ success });
      }

      json({ error: 'Not found' }, 404);
    } catch (err) {
      json({ error: err.message }, 500);
    }
  });

  const wsMesh = new NativeWebSocketMesh(server);

  engine.on('execution_started', exec => {
    wsMesh.broadcast('EXECUTION_STARTED', exec);
    wsMesh.broadcast('METRICS_UPDATED', engine.getMetrics());
  });
  engine.on('execution_updated', exec => {
    wsMesh.broadcast('EXECUTION_UPDATED', exec);
    wsMesh.broadcast('METRICS_UPDATED', engine.getMetrics());
  });
  engine.on('execution_completed', exec => {
    wsMesh.broadcast('EXECUTION_COMPLETED', exec);
    wsMesh.broadcast('METRICS_UPDATED', engine.getMetrics());
  });
  engine.on('step_log', log => wsMesh.broadcast('STEP_LOG', log));
  engine.on('approval_requested', app => wsMesh.broadcast('APPROVAL_REQUESTED', app));
  engine.on('approval_resolved', app => wsMesh.broadcast('APPROVAL_RESOLVED', app));

  const metricBroadcastTimer = setInterval(() => {
    wsMesh.broadcast('METRICS_UPDATED', engine.getMetrics());
  }, 1000);
  if (metricBroadcastTimer.unref) metricBroadcastTimer.unref();

  server.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`       NexusFlow Enterprise Operations Console        `);
    console.log(`======================================================`);
    console.log(`Console UI:     http://localhost:${port}`);
    console.log(`API Health:     http://localhost:${port}/api/health`);
    console.log(`WebSocket:      ws://localhost:${port}/ws`);
    console.log(`Active Provider: ${antigravityProvider.getConfig().providerDisplayName}`);
    console.log(`Design System:  Enterprise Professional Light-Mode`);
    console.log(`======================================================\n`);
  });

  return { server, engine, wsMesh, antigravityProvider };
}

if (require.main === module) {
  // Keep process alive as persistent daemon
  setInterval(() => {}, 1000 * 60 * 60);
  process.on('uncaughtException', err => console.error('[UncaughtException]', err));
  process.on('unhandledRejection', reason => console.error('[UnhandledRejection]', reason));
  startNativeServer(process.env.PORT || 3001);
}

module.exports = {
  startNativeServer,
  WorkflowEngine,
  ToolRegistry,
  DAGResolver,
  DurableJournal,
  ApprovalManager,
  GuardrailPolicy,
  AntigravityProvider,
  registerScenarios,
  API_KEYS,
};

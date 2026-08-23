import { ToolDefinition } from '../types';
import * as vm from 'vm';

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  public registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public listTools(): Array<{ name: string; description: string; parameters: any }> {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  public async executeTool(name: string, parameters: any, context?: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" is not registered in ToolRegistry.`);
    }

    // Validate parameters
    for (const [paramName, spec] of Object.entries(tool.parameters)) {
      if (spec.required && (parameters[paramName] === undefined || parameters[paramName] === null)) {
        throw new Error(`Missing required parameter "${paramName}" for tool "${name}"`);
      }
    }

    return await tool.execute(parameters, context);
  }

  private registerDefaultTools(): void {
    // 1. HTTP Request Tool
    this.registerTool({
      name: 'http_request',
      description: 'Make a resilient HTTP GET/POST/PUT/DELETE request with headers and payload',
      parameters: {
        url: { type: 'string', description: 'Destination URL', required: true },
        method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)', required: true },
        body: { type: 'object', description: 'JSON payload (optional)', required: false },
        headers: { type: 'object', description: 'Custom headers (optional)', required: false },
      },
      execute: async ({ url, method, body, headers }) => {
        // Validate URL protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          throw new Error(`Invalid URL protocol in "${url}". Only http and https are allowed.`);
        }
        await new Promise(r => setTimeout(r, 60));
        return {
          status: 200,
          statusText: 'OK',
          url,
          method,
          data: {
            success: true,
            receivedPayload: body,
            timestamp: new Date().toISOString(),
            latencyMs: Math.floor(Math.random() * 45) + 15,
          },
        };
      },
    });

    // 2. Hardened Sandboxed Code Runner Tool
    this.registerTool({
      name: 'code_sandbox',
      description: 'Safely execute JavaScript expressions or data transform scripts in an isolated, memory-isolated VM sandbox',
      parameters: {
        code: { type: 'string', description: 'JavaScript code or expression to evaluate', required: true },
        inputData: { type: 'object', description: 'Input variables passed to sandbox', required: false },
      },
      execute: async ({ code, inputData = {} }) => {
        await new Promise(r => setTimeout(r, 40));
        try {
          // Deep sanitize code string against prototype/constructor escapes
          if (/\bprocess\b|\brequire\b|\bimport\b|\bconstructor\s*\[|\.constructor\s*\.constructor|global|globalThis|__proto__|Function\s*\(/i.test(code)) {
            return { success: false, error: 'SecurityViolation: Disallowed prototype constructor access or global reference' };
          }

          const safeInput = JSON.parse(JSON.stringify(inputData));

          // Isolated sandbox context without global or process access
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

          // Wrap user code in immediate function
          const wrappedCode = `(function() {
            "use strict";
            ${code.includes('return') ? code : `return (${code});`}
          })()`;

          const script = new vm.Script(wrappedCode);
          const result = script.runInContext(vmContext, { timeout: 800 });

          // Ensure result doesn't leak functions or prototypes
          const serializedResult = result === undefined ? null : JSON.parse(JSON.stringify(result));
          return { success: true, result: serializedResult };
        } catch (evalErr: any) {
          return { success: false, error: evalErr.message };
        }
      },
    });

    // 3. Simulated SQL Query Tool
    this.registerTool({
      name: 'sql_query',
      description: 'Execute analytical queries against relational telemetry databases or mock datasets',
      parameters: {
        query: { type: 'string', description: 'SQL query string', required: true },
        database: { type: 'string', description: 'Target database name', required: false },
      },
      execute: async ({ query, database = 'telemetry_db' }) => {
        await new Promise(r => setTimeout(r, 50));
        const normalized = query.toUpperCase();
        if (normalized.includes('COUNT') || normalized.includes('METRICS')) {
          return {
            database,
            rows: [
              { metric: 'error_rate_5xx', value: 14.8, threshold: 1.0, status: 'CRITICAL' },
              { metric: 'cpu_saturation_pct', value: 92.4, threshold: 80.0, status: 'WARNING' },
              { metric: 'db_connection_pool_active', value: 498, threshold: 500, status: 'CRITICAL' },
            ],
            rowCount: 3,
            executionTimeMs: 12,
          };
        }
        return {
          database,
          rows: [
            { id: 101, service: 'payment-gateway', status: 'degraded', region: 'us-east-1' },
            { id: 102, service: 'auth-service', status: 'healthy', region: 'us-east-1' },
          ],
          rowCount: 2,
          executionTimeMs: 8,
        };
      },
    });

    // 4. Text & NLP Analyzer Tool
    this.registerTool({
      name: 'text_analyzer',
      description: 'Extract entities, summarize text, or analyze security posture in log files',
      parameters: {
        text: { type: 'string', description: 'Content to analyze', required: true },
        mode: { type: 'string', description: 'Analysis mode (entities, sentiment, security_scan)', required: true },
      },
      execute: async ({ text, mode }) => {
        await new Promise(r => setTimeout(r, 30));
        if (mode === 'security_scan') {
          const hasApiKey = /([a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16})/.test(text);
          const hasSql = /(DROP|ALTER|UNION\s+SELECT|--)/i.test(text);
          return {
            mode,
            leaksDetected: hasApiKey,
            potentialInjection: hasSql,
            riskScore: hasApiKey || hasSql ? 0.95 : 0.05,
            recommendation: hasApiKey ? 'Quarantine credential and revoke immediately' : 'Clean',
          };
        }
        return {
          mode,
          wordCount: text.split(/\s+/).length,
          sentiment: 'NEUTRAL_TECHNICAL',
          keyEntities: ['ServiceMesh', 'EnvoyProxy', 'PostgreSQL', 'RedisCluster'],
        };
      },
    });

    // 5. Infrastructure & Container Patch Tool
    this.registerTool({
      name: 'infrastructure_patch',
      description: 'Apply configuration patches to Kubernetes deployments, canary routes, or rate limiters',
      parameters: {
        targetResource: { type: 'string', description: 'Resource name (e.g., deployment/payment-svc)', required: true },
        patch: { type: 'object', description: 'JSON patch payload', required: true },
      },
      execute: async ({ targetResource, patch }) => {
        await new Promise(r => setTimeout(r, 80));
        return {
          resource: targetResource,
          applied: true,
          previousRevision: 42,
          currentRevision: 43,
          status: 'DEPLOYED_CANARY',
          replicasReady: 3,
        };
      },
    });
  }
}

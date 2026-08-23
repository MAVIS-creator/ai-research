import {
  AgentTaskConfig,
  StepExecutionContext,
  AgentReasoningStep,
} from '../types';
import { ToolRegistry } from './ToolRegistry';
import { GuardrailPolicy } from './GuardrailPolicy';
import { LLMProvider, LLMMessage } from './LLMProvider';
import { EventEmitter } from 'events';

export class AgentRunner extends EventEmitter {
  constructor(private toolRegistry: ToolRegistry) {
    super();
  }

  /**
   * Run an autonomous agent task loop until completion or max iterations.
   */
  public async runAgentTask(
    config: AgentTaskConfig,
    context: StepExecutionContext
  ): Promise<{
    status: 'SUCCESS' | 'FAILED';
    output: any;
    reasoningTrace: AgentReasoningStep[];
    tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const maxIterations = config.maxIterations || 4;
    const reasoningTrace: AgentReasoningStep[] = [];
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: config.systemPrompt || `You are an autonomous senior agent with role: "${config.role}". Solve the goal precisely.`,
      },
      {
        role: 'user',
        content: `Goal: ${config.goal}\nContext State: ${JSON.stringify(config.guardrails?.maskPii ? GuardrailPolicy.maskPII(context.state) : context.state)}`,
      },
    ];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let iteration = 0;
    let isComplete = false;
    let finalOutput: any = null;

    context.log(`Agent [${config.role}] starting task with goal: "${config.goal}"`, 'info');

    while (iteration < maxIterations && !isComplete) {
      iteration++;
      context.reportProgress(Math.floor((iteration / (maxIterations + 1)) * 100), `Iteration ${iteration}/${maxIterations}`);

      // Call LLM Provider for thought and next action
      const response = await LLMProvider.generateStep(
        config.role,
        config.goal,
        messages,
        config.tools,
        iteration
      );

      totalPromptTokens += response.usage.promptTokens;
      totalCompletionTokens += response.usage.completionTokens;

      const thoughtText = config.guardrails?.maskPii
        ? GuardrailPolicy.maskPII(response.thought)
        : response.thought;

      context.log(`[Agent Thought]: ${thoughtText}`, 'info');

      const reasoningStep: AgentReasoningStep = {
        agentId: config.agentId,
        iteration,
        thought: thoughtText,
        timestamp: Date.now(),
      };

      if (response.toolCall) {
        let toolParams = response.toolCall.parameters;

        // Apply PII masking to tool params if guardrail is enabled
        if (config.guardrails?.maskPii) {
          toolParams = GuardrailPolicy.maskPII(toolParams);
        }

        // Validate parameter safety
        const safetyCheck = GuardrailPolicy.validateSafety(response.toolCall.toolName, toolParams);
        if (!safetyCheck.isSafe) {
          throw new Error(`Guardrail violation for tool "${response.toolCall.toolName}": ${safetyCheck.reason}`);
        }

        reasoningStep.toolCall = {
          toolName: response.toolCall.toolName,
          parameters: toolParams,
        };

        context.log(`[Tool Call] -> ${response.toolCall.toolName}(${JSON.stringify(toolParams)})`, 'debug');

        // Execute sandboxed tool
        try {
          const toolResult = await this.toolRegistry.executeTool(
            response.toolCall.toolName,
            toolParams,
            context
          );

          reasoningStep.observation = toolResult;
          messages.push({
            role: 'assistant',
            content: thoughtText,
            toolCalls: [{ id: `call_${iteration}`, name: response.toolCall.toolName, parameters: toolParams }],
          });
          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
          });

          context.log(`[Tool Result] <- ${JSON.stringify(toolResult).substring(0, 150)}...`, 'debug');
        } catch (toolErr: any) {
          context.log(`[Tool Error] ${toolErr.message}`, 'error');
          reasoningStep.observation = { error: toolErr.message };
          messages.push({
            role: 'tool',
            content: `ERROR: ${toolErr.message}`,
          });
        }
      }

      reasoningTrace.push(reasoningStep);

      if (response.finalAnswer || iteration >= maxIterations) {
        isComplete = true;
        finalOutput = response.structuredOutput || {
          summary: response.finalAnswer,
          reasoningSteps: reasoningTrace.length,
          status: 'SUCCESS',
        };
      }
    }

    const tokenUsage = {
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
    };

    context.log(`Agent [${config.role}] completed task successfully. Total tokens: ${tokenUsage.totalTokens}`, 'info');

    return {
      status: 'SUCCESS',
      output: finalOutput,
      reasoningTrace,
      tokenUsage,
    };
  }
}

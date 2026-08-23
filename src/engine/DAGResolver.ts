import { WorkflowStep } from '../types';

export class DAGResolver {
  /**
   * Validate that the steps form a valid Directed Acyclic Graph (DAG).
   * Throws an Error if cycles or missing dependencies are detected.
   */
  public static validate(steps: WorkflowStep[]): {
    isValid: boolean;
    errors: string[];
    topologicalOrder: string[];
  } {
    const stepMap = new Map<string, WorkflowStep>();
    const errors: string[] = [];

    // Check for duplicate IDs
    for (const step of steps) {
      if (stepMap.has(step.id)) {
        errors.push(`Duplicate step ID detected: "${step.id}"`);
      }
      stepMap.set(step.id, step);
    }

    // Check that all dependencies reference existing steps
    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepMap.has(depId)) {
          errors.push(`Step "${step.id}" has unknown dependency "${depId}"`);
        }
        if (depId === step.id) {
          errors.push(`Step "${step.id}" cannot depend on itself (self-cycle)`);
        }
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors, topologicalOrder: [] };
    }

    // Detect cycles and determine topological sort via Kahn's algorithm
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, step.dependencies.length);
      adjList.set(step.id, []);
    }

    for (const step of steps) {
      for (const depId of step.dependencies) {
        adjList.get(depId)!.push(step.id);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    const topologicalOrder: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      topologicalOrder.push(current);

      const dependents = adjList.get(current) || [];
      for (const neighbor of dependents) {
        const newDeg = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (topologicalOrder.length !== steps.length) {
      const remaining = Array.from(inDegree.entries())
        .filter(([_, deg]) => deg > 0)
        .map(([id]) => id);
      errors.push(`Cycle detected in workflow graph involving steps: ${remaining.join(', ')}`);
      return { isValid: false, errors, topologicalOrder: [] };
    }

    return { isValid: true, errors: [], topologicalOrder };
  }

  /**
   * Given completed step IDs and currently running step IDs,
   * returns the list of step IDs ready to be scheduled and executed in parallel.
   */
  public static getReadySteps(
    steps: WorkflowStep[],
    completedStepIds: Set<string>,
    runningStepIds: Set<string>,
    failedStepIds: Set<string>,
    skippedStepIds: Set<string>
  ): WorkflowStep[] {
    const ready: WorkflowStep[] = [];

    for (const step of steps) {
      // If already completed, running, failed, or skipped, not ready
      if (
        completedStepIds.has(step.id) ||
        runningStepIds.has(step.id) ||
        failedStepIds.has(step.id) ||
        skippedStepIds.has(step.id)
      ) {
        continue;
      }

      // Check if all dependencies are satisfied (completed or skipped)
      const allDepsSatisfied = step.dependencies.every(
        depId => completedStepIds.has(depId) || skippedStepIds.has(depId)
      );

      if (allDepsSatisfied) {
        ready.push(step);
      }
    }

    return ready;
  }

  /**
   * Get all predecessor step IDs in reverse topological order (for Saga compensation).
   */
  public static getCompensationOrder(
    steps: WorkflowStep[],
    completedStepIds: string[]
  ): WorkflowStep[] {
    const stepMap = new Map<string, WorkflowStep>(steps.map(s => [s.id, s]));
    
    // Filter only completed steps that have a compensation handler defined
    // Reverse array to unwind transactions in LIFO order
    return completedStepIds
      .slice()
      .reverse()
      .map(id => stepMap.get(id)!)
      .filter(step => step && typeof step.compensation === 'function');
  }
}

#!/usr/bin/env node
/**
 * Mesh Network Coordinator for Claude Code MCP Enhanced
 * 
 * This module implements the agent mesh network coordination layer on top of
 * Graham's enhanced MCP server. It provides:
 * - Agent spawning and lifecycle management
 * - Task distribution and parallel processing
 * - Context sharing between agents
 * - Result aggregation and synthesis
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

// Agent specialization types
export type AgentRole = 'analysis' | 'implementation' | 'testing' | 'documentation' | 'debugging';

export interface AgentConfig {
  id: string;
  role: AgentRole;
  workFolder: string;
  contextData?: any;
  priority: 'high' | 'medium' | 'low';
}

export interface TaskRequest {
  id: string;
  prompt: string;
  agentRole: AgentRole;
  workFolder: string;
  parentTaskId?: string;
  returnMode: 'summary' | 'full';
  dependencies?: string[];
}

export interface AgentResult {
  agentId: string;
  taskId: string;
  role: AgentRole;
  success: boolean;
  result?: string;
  error?: string;
  executionTime: number;
  metadata?: any;
}

/**
 * Mesh Network Coordinator
 * 
 * Manages a network of specialized Claude Code agents working in parallel
 * on different aspects of complex coding problems.
 */
export class MeshCoordinator {
  private activeAgents: Map<string, AgentConfig> = new Map();
  private completedTasks: Map<string, AgentResult> = new Map();
  private pendingTasks: Map<string, TaskRequest> = new Map();
  private contextStore: Map<string, any> = new Map();

  constructor(
    private claudeCodePath: string = 'claude',
    private maxConcurrentAgents: number = 5
  ) {}

  /**
   * Analyze a complex problem and create a task decomposition plan
   */
  async analyzeProblem(prompt: string, workFolder: string): Promise<TaskRequest[]> {
    const analysisId = randomUUID();
    
    // Use the lead agent to analyze and decompose the problem
    const analysisPrompt = `
# Problem Analysis and Task Decomposition

Analyze the following coding problem and break it down into parallel tasks for specialized agents:

**Problem:** ${prompt}

**Working Directory:** ${workFolder}

Please create a detailed task breakdown with the following structure:

1. **Analysis Tasks** - Understanding existing code, architecture, dependencies
2. **Implementation Tasks** - Writing new code, features, or fixes  
3. **Testing Tasks** - Creating tests, validation, quality assurance
4. **Documentation Tasks** - Updating docs, comments, README files
5. **Debugging Tasks** - Identifying and fixing issues

For each task, specify:
- Task description
- Agent role (analysis/implementation/testing/documentation/debugging)
- Priority (high/medium/low)
- Dependencies on other tasks
- Expected deliverables

Return your response as a structured JSON array of tasks.
`;

    const result = await this.executeClaudeCode(analysisPrompt, workFolder, 'analysis');
    
    // Parse the result to extract task breakdown
    try {
      const taskData = this.extractTasksFromResponse(result);
      return this.createTaskRequests(taskData, workFolder);
    } catch (error) {
      // Fallback: create basic task structure
      return this.createDefaultTaskBreakdown(prompt, workFolder);
    }
  }

  /**
   * Execute tasks across the agent mesh network
   */
  async executeMeshTasks(tasks: TaskRequest[]): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const executionGroups = this.groupTasksByDependencies(tasks);

    console.error(`[Mesh] Executing ${tasks.length} tasks across ${executionGroups.length} dependency groups`);

    // Execute tasks in dependency order
    for (let groupIndex = 0; groupIndex < executionGroups.length; groupIndex++) {
      const group = executionGroups[groupIndex];
      console.error(`[Mesh] Executing group ${groupIndex + 1}/${executionGroups.length} with ${group.length} tasks`);

      // Execute tasks in the group in parallel (up to max concurrent limit)
      const groupResults = await this.executeTaskGroup(group);
      results.push(...groupResults);

      // Update context store with results for dependent tasks
      for (const result of groupResults) {
        if (result.success) {
          this.contextStore.set(result.taskId, result);
        }
      }
    }

    return results;
  }

  /**
   * Execute a group of independent tasks in parallel
   */
  private async executeTaskGroup(tasks: TaskRequest[]): Promise<AgentResult[]> {
    const promises: Promise<AgentResult>[] = [];

    // Split into batches to respect concurrent agent limit
    const batches = this.createExecutionBatches(tasks, this.maxConcurrentAgents);

    for (const batch of batches) {
      const batchPromises = batch.map(task => this.executeTask(task));
      const batchResults = await Promise.all(batchPromises);
      promises.push(...batchResults.map(r => Promise.resolve(r)));
    }

    return Promise.all(promises);
  }

  /**
   * Execute a single task with a specialized agent
   */
  private async executeTask(task: TaskRequest): Promise<AgentResult> {
    const startTime = Date.now();
    const agentId = randomUUID();
    
    const agentConfig: AgentConfig = {
      id: agentId,
      role: task.agentRole,
      workFolder: task.workFolder,
      priority: this.getTaskPriority(task),
      contextData: this.getRelevantContext(task)
    };

    this.activeAgents.set(agentId, agentConfig);
    console.error(`[Mesh] Agent ${agentId} (${task.agentRole}) starting task: ${task.id}`);

    try {
      // Prepare specialized prompt based on agent role
      const specializedPrompt = this.createSpecializedPrompt(task, agentConfig);
      
      // Execute the task using Claude Code
      const result = await this.executeClaudeCode(
        specializedPrompt, 
        task.workFolder, 
        task.agentRole,
        {
          parentTaskId: task.parentTaskId,
          returnMode: task.returnMode,
          taskDescription: `${task.agentRole} task: ${task.id}`
        }
      );

      const executionTime = Date.now() - startTime;
      
      const agentResult: AgentResult = {
        agentId,
        taskId: task.id,
        role: task.agentRole,
        success: true,
        result,
        executionTime,
        metadata: {
          workFolder: task.workFolder,
          returnMode: task.returnMode
        }
      };

      console.error(`[Mesh] Agent ${agentId} completed task ${task.id} in ${executionTime}ms`);
      this.completedTasks.set(task.id, agentResult);
      
      return agentResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      const agentResult: AgentResult = {
        agentId,
        taskId: task.id,
        role: task.agentRole,
        success: false,
        error: errorMessage,
        executionTime
      };

      console.error(`[Mesh] Agent ${agentId} failed task ${task.id}: ${errorMessage}`);
      this.completedTasks.set(task.id, agentResult);
      
      return agentResult;
    } finally {
      this.activeAgents.delete(agentId);
    }
  }

  /**
   * Create a specialized prompt based on agent role and context
   */
  private createSpecializedPrompt(task: TaskRequest, agent: AgentConfig): string {
    const roleInstructions = this.getRoleInstructions(agent.role);
    const contextInfo = this.formatContextInfo(agent.contextData);

    return `
# ${agent.role.toUpperCase()} AGENT TASK

${roleInstructions}

## Task Details
**Task ID:** ${task.id}
**Work Folder:** ${task.workFolder}
${task.parentTaskId ? `**Parent Task:** ${task.parentTaskId}` : ''}

## Context Information
${contextInfo}

## Task Prompt
${task.prompt}

## Instructions
1. Focus specifically on your role as a ${agent.role} agent
2. Work within the specified work folder: ${task.workFolder}
3. ${task.returnMode === 'summary' ? 'Provide a concise summary of your work' : 'Provide detailed results'}
4. Coordinate with other agents by referencing shared context when relevant
5. Follow the task requirements precisely

Begin your specialized ${agent.role} work now:
`;
  }

  /**
   * Get role-specific instructions for specialized agents
   */
  private getRoleInstructions(role: AgentRole): string {
    const instructions = {
      analysis: `
You are a CODE ANALYSIS AGENT specialized in:
- Understanding existing codebases and architecture
- Identifying patterns, dependencies, and relationships
- Documenting current state and potential issues
- Providing insights for other agents to build upon
`,
      implementation: `
You are an IMPLEMENTATION AGENT specialized in:
- Writing new code and features
- Implementing solutions based on analysis
- Following coding best practices and patterns
- Creating working, tested code solutions
`,
      testing: `
You are a TESTING AGENT specialized in:
- Creating comprehensive test suites
- Validating functionality and edge cases
- Setting up test automation and CI/CD
- Ensuring code quality and reliability
`,
      documentation: `
You are a DOCUMENTATION AGENT specialized in:
- Writing clear, comprehensive documentation
- Creating README files, API docs, and guides
- Updating existing documentation
- Ensuring knowledge transfer and maintainability
`,
      debugging: `
You are a DEBUGGING AGENT specialized in:
- Identifying and diagnosing issues
- Reproducing bugs and error conditions
- Implementing fixes and patches
- Preventing similar issues in the future
`
    };

    return instructions[role] || 'You are a specialized agent focused on your assigned task.';
  }

  /**
   * Execute Claude Code with enhanced error handling and retry logic
   */
  private async executeClaudeCode(
    prompt: string, 
    workFolder: string, 
    role: AgentRole,
    options: {
      parentTaskId?: string;
      returnMode?: 'summary' | 'full';
      taskDescription?: string;
    } = {}
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        this.claudeCodePath,
        '--dangerously-skip-permissions',
        '-p', prompt
      ];

      const process = spawn('/bin/bash', args, {
        cwd: workFolder,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude Code execution failed with exit code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to spawn Claude Code process: ${error.message}`));
      });
    });
  }

  /**
   * Helper methods for task management and coordination
   */
  private extractTasksFromResponse(response: string): any[] {
    // Try to extract JSON from Claude's response
    const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || 
                     response.match(/\[[\s\S]*\]/);
    
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {
        // Fall through to default
      }
    }
    
    return [];
  }

  private createTaskRequests(taskData: any[], workFolder: string): TaskRequest[] {
    return taskData.map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      prompt: task.description || task.prompt || `Task ${index + 1}`,
      agentRole: task.role || 'implementation',
      workFolder,
      returnMode: task.returnMode || 'full',
      dependencies: task.dependencies || []
    }));
  }

  private createDefaultTaskBreakdown(prompt: string, workFolder: string): TaskRequest[] {
    return [
      {
        id: 'analysis-1',
        prompt: `Analyze the codebase structure and understand the requirements: ${prompt}`,
        agentRole: 'analysis',
        workFolder,
        returnMode: 'summary',
        dependencies: []
      },
      {
        id: 'implementation-1', 
        prompt: `Implement the required solution based on analysis: ${prompt}`,
        agentRole: 'implementation',
        workFolder,
        returnMode: 'full',
        dependencies: ['analysis-1']
      },
      {
        id: 'testing-1',
        prompt: `Create tests for the implemented solution: ${prompt}`,
        agentRole: 'testing',
        workFolder,
        returnMode: 'summary',
        dependencies: ['implementation-1']
      }
    ];
  }

  private groupTasksByDependencies(tasks: TaskRequest[]): TaskRequest[][] {
    const groups: TaskRequest[][] = [];
    const processed = new Set<string>();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    while (processed.size < tasks.length) {
      const currentGroup: TaskRequest[] = [];
      
      for (const task of tasks) {
        if (processed.has(task.id)) continue;
        
        // Check if all dependencies are satisfied
        const canExecute = !task.dependencies || 
          task.dependencies.every(dep => processed.has(dep));
        
        if (canExecute) {
          currentGroup.push(task);
          processed.add(task.id);
        }
      }
      
      if (currentGroup.length === 0) {
        // Circular dependency or missing dependency - add remaining tasks
        const remaining = tasks.filter(t => !processed.has(t.id));
        groups.push(remaining);
        remaining.forEach(t => processed.add(t.id));
        break;
      }
      
      groups.push(currentGroup);
    }

    return groups;
  }

  private createExecutionBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private getTaskPriority(task: TaskRequest): 'high' | 'medium' | 'low' {
    if (task.agentRole === 'analysis') return 'high';
    if (task.agentRole === 'debugging') return 'high';
    if (task.agentRole === 'implementation') return 'medium';
    return 'low';
  }

  private getRelevantContext(task: TaskRequest): any {
    const context: any = {};
    
    // Add results from dependent tasks
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        const depResult = this.contextStore.get(depId);
        if (depResult) {
          context[depId] = depResult;
        }
      }
    }

    return context;
  }

  private formatContextInfo(contextData?: any): string {
    if (!contextData || Object.keys(contextData).length === 0) {
      return 'No previous context available.';
    }

    let info = 'Previous task results:\n';
    for (const [taskId, result] of Object.entries(contextData)) {
      info += `- ${taskId}: ${JSON.stringify(result)}\n`;
    }
    
    return info;
  }

  /**
   * Get mesh network status and statistics
   */
  getStatus() {
    return {
      activeAgents: this.activeAgents.size,
      completedTasks: this.completedTasks.size,
      pendingTasks: this.pendingTasks.size,
      contextEntries: this.contextStore.size,
      agents: Array.from(this.activeAgents.values()),
      recentResults: Array.from(this.completedTasks.values()).slice(-5)
    };
  }
}

// Export for use in the main server
export default MeshCoordinator;
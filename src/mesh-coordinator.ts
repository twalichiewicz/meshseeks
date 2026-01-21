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
import { EventEmitter } from 'node:events';
import { getStatusBoard } from './status-board-stderr.js';
import type { SwarmOrchestrator } from './swarm/swarm-orchestrator.js';
import type { HierarchicalTask, ExtendedAgentRole, SwarmSession, SwarmConfig } from './types/swarm-types.js';

// Agent specialization types (basic roles)
export type AgentRole = 'analysis' | 'implementation' | 'testing' | 'documentation' | 'debugging';

// Extended roles include planner, judge, synthesizer, monitor for swarm mode
export type FullAgentRole = AgentRole | 'planner' | 'judge' | 'synthesizer' | 'monitor';

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
 *
 * For large-scale operations (6+ agents, hierarchical tasks, week-long sessions),
 * can optionally delegate to SwarmOrchestrator.
 */
export class MeshCoordinator extends EventEmitter {
  private activeAgents: Map<string, AgentConfig> = new Map();
  private completedTasks: Map<string, AgentResult> = new Map();
  private pendingTasks: Map<string, TaskRequest> = new Map();
  private contextStore: Map<string, any> = new Map();
  private statusBoard = getStatusBoard();
  private meshId: string;

  // Optional SwarmOrchestrator for scale operations
  private swarmOrchestrator?: SwarmOrchestrator;
  private swarmThreshold: number = 6; // Delegate to swarm when > this many concurrent agents

  constructor(
    private claudeCodePath: string = 'claude',
    private maxConcurrentAgents: number = 5,
    private defaultTimeoutMs: number = parseInt(process.env.MCP_EXECUTION_TIMEOUT_MS || '1800000', 10)
  ) {
    super();
    this.meshId = `mesh-${randomUUID().substring(0, 8)}`;
    this.statusBoard.addProgressUpdate(`MeshCoordinator initialized (${this.meshId}) with ${this.defaultTimeoutMs / 1000}s timeout`);
  }

  /**
   * Connect a SwarmOrchestrator for scale operations.
   * When connected, large tasks can be delegated to the swarm system.
   */
  connectSwarmOrchestrator(orchestrator: SwarmOrchestrator): void {
    this.swarmOrchestrator = orchestrator;
    this.statusBoard.addProgressUpdate('SwarmOrchestrator connected for scale operations');

    // Forward orchestrator events
    orchestrator.on('sessionStarted', (session: SwarmSession) => {
      this.emit('swarm:sessionStarted', session);
      this.statusBoard.addProgressUpdate(`Swarm session started: ${session.id}`);
    });

    orchestrator.on('sessionCompleted', (session: SwarmSession) => {
      this.emit('swarm:sessionCompleted', session);
      this.statusBoard.showSuccess(`Swarm session completed: ${session.id}`);
    });

    orchestrator.on('taskCompleted', (task: HierarchicalTask) => {
      this.emit('swarm:taskCompleted', task);
    });

    orchestrator.on('checkpoint', (checkpointId: string) => {
      this.emit('swarm:checkpoint', checkpointId);
      this.statusBoard.addProgressUpdate(`Swarm checkpoint: ${checkpointId}`);
    });
  }

  /**
   * Check if swarm mode is available.
   */
  isSwarmAvailable(): boolean {
    return this.swarmOrchestrator !== undefined;
  }

  /**
   * Get the connected SwarmOrchestrator (if any).
   */
  getSwarmOrchestrator(): SwarmOrchestrator | undefined {
    return this.swarmOrchestrator;
  }

  /**
   * Set the threshold for delegating to swarm mode.
   * Tasks requiring more than this many concurrent agents will use SwarmOrchestrator.
   */
  setSwarmThreshold(threshold: number): void {
    this.swarmThreshold = threshold;
  }

  /**
   * Execute a complex problem using swarm mode (hierarchical planning + 100+ agents).
   * Requires SwarmOrchestrator to be connected.
   */
  async executeWithSwarm(
    prompt: string,
    workFolder: string,
    config?: Partial<SwarmConfig>
  ): Promise<SwarmSession> {
    if (!this.swarmOrchestrator) {
      throw new Error('SwarmOrchestrator not connected. Call connectSwarmOrchestrator first.');
    }

    this.statusBoard.addProgressUpdate(`Starting swarm execution for: ${prompt.substring(0, 50)}...`);

    // Create swarm session with hierarchical planning
    // Note: SwarmOrchestrator always uses hierarchical planning via HierarchicalPlanner
    const session = await this.swarmOrchestrator.createSession({
      name: `mesh-swarm-${Date.now()}`,
      description: `MeshCoordinator delegated task`,
      prompt: prompt,
      workFolder: workFolder,
      config: {
        enableJudge: true,
        ...config
      }
    });

    // Run the session (non-blocking, runs in background)
    // We don't await this - let it run in the background
    this.swarmOrchestrator.run(session.id).catch(error => {
      this.statusBoard.showError(`Swarm session ${session.id} failed: ${error}`);
    });

    return session;
  }

  /**
   * Determine if a set of tasks should use swarm mode.
   */
  shouldUseSwarmMode(tasks: TaskRequest[]): boolean {
    if (!this.swarmOrchestrator) return false;

    // Use swarm mode if:
    // 1. More tasks than the threshold
    // 2. Task complexity suggests hierarchical decomposition needed
    // 3. Explicit swarm request (future: add metadata to TaskRequest)

    return tasks.length > this.swarmThreshold;
  }

  /**
   * Delegate tasks to swarm orchestrator if appropriate.
   * Returns true if delegated, false if handled locally.
   */
  async maybeDelegateToSwarm(tasks: TaskRequest[], workFolder: string): Promise<boolean> {
    if (!this.shouldUseSwarmMode(tasks)) {
      return false;
    }

    this.statusBoard.addProgressUpdate(
      `Task count (${tasks.length}) exceeds threshold (${this.swarmThreshold}), delegating to swarm`
    );

    // Convert TaskRequests to a combined prompt for hierarchical planning
    const combinedPrompt = tasks.map(t =>
      `[${t.agentRole}] ${t.prompt}`
    ).join('\n\n');

    await this.executeWithSwarm(combinedPrompt, workFolder, {
      maxConcurrentAgents: Math.min(tasks.length * 2, 100),
      maxTaskDepth: 3
    });

    return true;
  }

  /**
   * Analyze a complex problem and create a task decomposition plan
   */
  async analyzeProblem(prompt: string, workFolder: string): Promise<TaskRequest[]> {
    const analysisId = randomUUID();
    this.statusBoard.addProgressUpdate(`Starting problem analysis: ${prompt.substring(0, 50)}...`);
    
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

    try {
      const result = await this.executeClaudeCode(analysisPrompt, workFolder, 'analysis');
      this.statusBoard.addProgressUpdate(`Problem analysis completed, extracting tasks...`);
      
      // Parse the result to extract task breakdown
      const taskData = this.extractTasksFromResponse(result);
      const tasks = this.createTaskRequests(taskData, workFolder);
      
      // Add tasks to status board
      for (const task of tasks) {
        this.statusBoard.addTask(task.id, task.prompt, task.dependencies);
      }
      
      this.statusBoard.showSuccess(`Generated ${tasks.length} specialized tasks`);
      return tasks;
    } catch (error) {
      this.statusBoard.showWarning(`Analysis failed, using fallback task structure: ${error}`);
      // Fallback: create basic task structure
      const fallbackTasks = this.createDefaultTaskBreakdown(prompt, workFolder);
      
      // Add fallback tasks to status board
      for (const task of fallbackTasks) {
        this.statusBoard.addTask(task.id, task.prompt, task.dependencies);
      }
      
      return fallbackTasks;
    }
  }

  /**
   * Execute tasks across the agent mesh network
   */
  async executeMeshTasks(tasks: TaskRequest[]): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    const executionGroups = this.groupTasksByDependencies(tasks);

    this.statusBoard.addProgressUpdate(`Executing ${tasks.length} tasks across ${executionGroups.length} dependency groups`);

    // Execute tasks in dependency order
    for (let groupIndex = 0; groupIndex < executionGroups.length; groupIndex++) {
      const group = executionGroups[groupIndex];
      this.statusBoard.addProgressUpdate(`Executing group ${groupIndex + 1}/${executionGroups.length} with ${group.length} tasks`);
      
      // Send progress to Claude with friendly ASCII art
      const groupAgents = group.map(t => {
        const roleEmojis: Record<string, string> = {
          analysis: '🔍',
          implementation: '⚙️',
          testing: '🧪',
          documentation: '📝',
          debugging: '🐛'
        };
        return `${roleEmojis[t.agentRole] || '🤖'} ${t.agentRole}`;
      }).join(', ');
      
      console.error(`\n┌────────────────────────────────────────────────────┐`);
      console.error(`│ 🚀 LAUNCHING AGENT BATCH ${groupIndex + 1} of ${executionGroups.length}                   │`);
      console.error(`├────────────────────────────────────────────────────┤`);
      console.error(`│ Agents: ${groupAgents.padEnd(42)} │`);
      console.error(`│ Tasks: ${group.length} parallel operations                       │`);
      console.error(`└────────────────────────────────────────────────────┘\n`);

      // Execute tasks in the group in parallel (up to max concurrent limit)
      const groupResults = await this.executeTaskGroup(group);
      results.push(...groupResults);

      // Update context store with results for dependent tasks
      let groupSuccessCount = 0;
      for (const result of groupResults) {
        if (result.success) {
          this.contextStore.set(result.taskId, result);
          this.statusBoard.updateTaskStatus(result.taskId, 'completed', 100);
          groupSuccessCount++;
        } else {
          this.statusBoard.updateTaskStatus(result.taskId, 'failed', 0, undefined, result.error);
        }
      }
      
      // Report group completion with friendly message
      console.error(`\n┌────────────────────────────────────────────────────┐`);
      console.error(`│ ✅ BATCH ${groupIndex + 1} COMPLETE!                             │`);
      console.error(`├────────────────────────────────────────────────────┤`);
      console.error(`│ Success rate: ${groupSuccessCount}/${group.length} tasks (${Math.round(groupSuccessCount/group.length*100)}%)              │`);
      console.error(`└────────────────────────────────────────────────────┘\n`);
    }

    this.statusBoard.showSuccess(`Mesh execution completed: ${results.filter(r => r.success).length}/${results.length} tasks successful`);
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
    
    // Register agent with status board
    this.statusBoard.registerAgent(agentId, task.agentRole);
    this.statusBoard.updateAgentStatus(agentId, 'working', task.prompt.substring(0, 50) + '...', 0);
    this.statusBoard.updateTaskStatus(task.id, 'running', 0, agentId);
    
    // Send progress to Claude with agent personality
    console.error(`\n┌─ ${task.agentRole.toUpperCase()} AGENT STARTING ─────────────────┐`);
    console.error(`│ 🆔 Task: ${task.id.padEnd(36)} │`);
    console.error(`│ 📁 Directory: ${agentConfig.workFolder.substring(agentConfig.workFolder.lastIndexOf('/') + 1).padEnd(29)} │`);
    console.error(`└────────────────────────────────────────────────┘`);
    
    // MeshSeeks personality messages
    const meshSeeksGreetings = {
      analysis: "I'm Analysis MeshSeeks! Look at me! I'll analyze your code!",
      implementation: "Ooh, yeah! Implementation MeshSeeks can do!",
      testing: "I'm Testing MeshSeeks! Your tests are my purpose!",
      documentation: "Hi! Documentation MeshSeeks here! Writing docs is pain, but I'll do it!",
      debugging: "I'm Debugging MeshSeeks! Existence is pain, but bugs are worse!"
    };

    if (process.env.MESHSEEKS_CATCHPHRASE === 'true') {
      this.statusBoard.addProgressUpdate(`${meshSeeksGreetings[task.agentRole] || "I'm MeshSeeks! Look at me!"}`);
    }

    try {
      // Prepare specialized prompt based on agent role
      const specializedPrompt = this.createSpecializedPrompt(task, agentConfig);
      
      // Execute the task using Claude Code with auto-detected working directory
      const workFolder = task.workFolder || process.cwd();
      const result = await this.executeClaudeCode(
        specializedPrompt, 
        workFolder, 
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

      this.statusBoard.updateAgentStatus(agentId, 'completed', task.prompt.substring(0, 50) + '...', 100);
      if (process.env.MESHSEEKS_CATCHPHRASE === 'true') {
        this.statusBoard.addProgressUpdate(`All done! *POOF* 💨`);
      }
      this.completedTasks.set(task.id, agentResult);
      
      // Report completion to Claude with celebratory message
      console.error(`\n🎉 ${task.agentRole.toUpperCase()} agent finished! Task ${task.id} done in ${(executionTime / 1000).toFixed(1)}s`);
      
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

      this.statusBoard.updateAgentStatus(agentId, 'failed', task.prompt.substring(0, 50) + '...', 0);
      this.statusBoard.showError(`Agent ${agentId} failed: ${errorMessage}`);
      this.completedTasks.set(task.id, agentResult);
      
      // Report failure to Claude with helpful tone
      console.error(`\n😓 ${task.agentRole.toUpperCase()} agent had trouble with task ${task.id}`);
      console.error(`   Issue: ${errorMessage}`);
      
      return agentResult;
    } finally {
      this.activeAgents.delete(agentId);
      this.statusBoard.removeAgent(agentId);
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
  private getRoleInstructions(role: AgentRole | FullAgentRole): string {
    const instructions: Record<string, string> = {
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
`,
      // Extended roles for swarm mode
      planner: `
You are a PLANNER AGENT specialized in:
- Breaking down complex problems into manageable subtasks
- Creating hierarchical task decompositions
- Identifying dependencies between tasks
- Estimating complexity and resource requirements
- Orchestrating multi-agent workflows
`,
      judge: `
You are a JUDGE AGENT specialized in:
- Verifying the correctness of completed work
- Evaluating code quality against criteria
- Checking test coverage and completeness
- Validating documentation accuracy
- Deciding if work needs revision
`,
      synthesizer: `
You are a SYNTHESIZER AGENT specialized in:
- Combining results from multiple agents
- Resolving conflicts between different approaches
- Creating unified summaries and reports
- Integrating partial solutions into complete ones
- Providing holistic project overviews
`,
      monitor: `
You are a MONITOR AGENT specialized in:
- Tracking progress of ongoing tasks
- Detecting stalled or failing operations
- Reporting system health and metrics
- Alerting on anomalies and issues
- Ensuring SLA compliance
`
    };

    return instructions[role] || 'You are a specialized agent focused on your assigned task.';
  }

  /**
   * Execute Claude Code with enhanced error handling, timeout protection, and retry logic
   */
  private async executeClaudeCode(
    prompt: string, 
    workFolder: string, 
    role: AgentRole,
    options: {
      parentTaskId?: string;
      returnMode?: 'summary' | 'full';
      taskDescription?: string;
      timeout?: number;
    } = {}
  ): Promise<string> {
    // Get timeout from options or use default from constructor
    const executionTimeoutMs = options.timeout || this.defaultTimeoutMs;
    const heartbeatIntervalMs = parseInt(process.env.MCP_HEARTBEAT_INTERVAL_MS || '15000', 10);
    
    return new Promise((resolve, reject) => {
      const args = [
        '--dangerously-skip-permissions',
        '-p', prompt
      ];

      const childProcess = spawn(this.claudeCodePath, args, {
        cwd: workFolder,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: executionTimeoutMs
      });

      let stdout = '';
      let stderr = '';
      let executionStartTime = Date.now();
      let heartbeatCounter = 0;

      // Set up progress reporter to prevent client timeouts and provide status updates
      const progressReporter = setInterval(() => {
        heartbeatCounter++;
        const elapsedSeconds = Math.floor((Date.now() - executionStartTime) / 1000);
        const heartbeatMessage = `⏱️  ${role} agent still working... ${elapsedSeconds}s elapsed`;

        // Report progress to status board
        this.statusBoard.addProgressUpdate(heartbeatMessage);

        // Send periodic encouragement to Claude
        if (heartbeatCounter % 3 === 0) {
          console.error(`💪 ${role.toUpperCase()} agent is making progress... hang tight!`);
        }
      }, heartbeatIntervalMs);

      childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        clearInterval(progressReporter);
        const executionTimeMs = Date.now() - executionStartTime;

        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude Code execution failed with exit code ${code}\nStderr: ${stderr}\nStdout: ${stdout}`));
        }
      });

      childProcess.on('error', (error: NodeJS.ErrnoException) => {
        clearInterval(progressReporter);
        let errorMessage = `Failed to spawn Claude Code process: ${error.message}`;

        // Add additional error context
        if (error.code === 'ETIMEDOUT') {
          errorMessage = `Claude Code execution timed out after ${executionTimeoutMs / 1000}s: ${error.message}`;
        }
        if (error.path) {
          errorMessage += ` | Path: ${error.path}`;
        }
        if (error.syscall) {
          errorMessage += ` | Syscall: ${error.syscall}`;
        }
        errorMessage += `\nStderr: ${stderr.trim()}`;

        reject(new Error(errorMessage));
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
      const jsonContent = jsonMatch[1] || jsonMatch[0];
      try {
        return JSON.parse(jsonContent);
      } catch (error) {
        // Log the parsing error with context for debugging
        const errorMessage = error instanceof Error ? error.message : String(error);
        const preview = jsonContent.substring(0, 200);
        this.statusBoard.showWarning(
          `Failed to parse task JSON: ${errorMessage}. Preview: "${preview}..."`
        );
        // Fall through to return empty array
      }
    }

    return [];
  }

  private createTaskRequests(taskData: any[], defaultWorkFolder: string): TaskRequest[] {
    return taskData.map((task, index) => ({
      id: task.id || `task-${index + 1}`,
      prompt: task.description || task.prompt || `Task ${index + 1}`,
      agentRole: task.role || 'implementation',
      workFolder: task.workFolder || defaultWorkFolder,
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
    const baseStatus = {
      meshId: this.meshId,
      activeAgents: this.activeAgents.size,
      completedTasks: this.completedTasks.size,
      pendingTasks: this.pendingTasks.size,
      contextEntries: this.contextStore.size,
      maxConcurrency: this.maxConcurrentAgents,
      defaultTimeoutMs: this.defaultTimeoutMs,
      agentRoles: ['analysis', 'implementation', 'testing', 'documentation', 'debugging'] as AgentRole[],
      extendedRoles: ['planner', 'judge', 'synthesizer', 'monitor'] as const,
      agents: Array.from(this.activeAgents.values()),
      recentResults: Array.from(this.completedTasks.values()).slice(-5),
      // Swarm integration info
      swarmAvailable: this.isSwarmAvailable(),
      swarmThreshold: this.swarmThreshold
    };

    return baseStatus;
  }

  /**
   * Get swarm session status (if connected).
   */
  getSwarmSessionStatus(sessionId: string): ReturnType<SwarmOrchestrator['getSessionStatus']> | null {
    if (!this.swarmOrchestrator) {
      return null;
    }
    return this.swarmOrchestrator.getSessionStatus(sessionId);
  }

  /**
   * List all swarm sessions (if connected).
   */
  async listSwarmSessions(): Promise<string[]> {
    if (!this.swarmOrchestrator) {
      return [];
    }
    return this.swarmOrchestrator.listSessions();
  }

  /**
   * Get the mesh ID
   */
  getMeshId(): string {
    return this.meshId;
  }
}

// Export for use in the main server
export default MeshCoordinator;
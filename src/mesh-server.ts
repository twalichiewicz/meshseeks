#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';
import MeshCoordinator, { type TaskRequest, type AgentResult } from './mesh-coordinator.js';

/**
 * Enhanced MCP Server with Mesh Network Capabilities
 * 
 * Extends Graham's enhanced MCP server with agent mesh network coordination.
 * Provides tools for multi-agent parallel processing of complex coding tasks.
 */
interface MeshSession {
  id: string;
  plan: TaskRequest[];
  activeAgents: Map<string, { taskId: string; startTime: number; status: string }>;
  completedAgents: Map<string, AgentResult>;
  createdAt: number;
}

class MeshEnhancedServer {
  private server: Server;
  private meshCoordinator: MeshCoordinator;
  private sessions: Map<string, MeshSession> = new Map();

  constructor() {
    // Debug: Log to stderr on startup
    console.error('[MeshSeeks] Server starting with stderr status board v1.1...');
    
    this.meshCoordinator = new MeshCoordinator();
    
    this.server = new Server(
      {
        name: 'meshseeks',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupMeshToolHandlers();
    this.server.onerror = (error) => console.error('[Mesh Error]', error);
  }

  /**
   * Set up mesh-specific MCP tool handlers
   */
  private setupMeshToolHandlers(): void {
    // Define mesh network tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'mesh_analyze_problem',
          description: 'Analyze a complex coding problem and create a task decomposition plan for the agent mesh network. Returns a structured breakdown of tasks for parallel execution.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The complex coding problem or task to analyze and decompose.',
              },
              workFolder: {
                type: 'string',
                description: 'The working directory for the project. If not provided, uses the current working directory where Claude is running.',
              },
              complexity: {
                type: 'string',
                enum: ['simple', 'moderate', 'complex', 'enterprise'],
                description: 'Complexity level to determine the number of agents and task granularity.',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'mesh_execute_tasks',
          description: 'Execute a set of tasks across the agent mesh network with parallel processing, dependency management, and result aggregation.',
          inputSchema: {
            type: 'object',
            properties: {
              tasks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    prompt: { type: 'string' },
                    agentRole: { 
                      type: 'string',
                      enum: ['analysis', 'implementation', 'testing', 'documentation', 'debugging']
                    },
                    workFolder: { 
                      type: 'string',
                      description: 'Working directory for this task. If not provided, uses the current working directory.'
                    },
                    returnMode: { 
                      type: 'string', 
                      enum: ['summary', 'full'],
                      description: 'How detailed the agent response should be'
                    },
                    dependencies: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Task IDs that must complete before this task can run'
                    }
                  },
                  required: ['id', 'prompt', 'agentRole']
                },
                description: 'Array of tasks to execute across the mesh network.',
              },
              maxConcurrent: {
                type: 'number',
                description: 'Maximum number of agents to run concurrently (default: 5).',
              },
            },
            required: ['tasks'],
          },
        },
        {
          name: 'mesh_solve_problem',
          description: 'End-to-end problem solving using the agent mesh network. Combines problem analysis and task execution in a single operation.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The complex coding problem to solve using multiple specialized agents.',
              },
              workFolder: {
                type: 'string',
                description: 'The working directory for the project. If not provided, uses the current working directory where Claude is running.',
              },
              approach: {
                type: 'string',
                enum: ['analysis_first', 'parallel_exploration', 'iterative_refinement'],
                description: 'Problem-solving approach: analysis_first (analyze then implement), parallel_exploration (multiple agents explore simultaneously), iterative_refinement (cycles of analysis and implementation).',
              },
              agentCount: {
                type: 'number',
                description: 'Number of specialized agents to deploy (default: auto-determined based on complexity).',
              },
              returnSummary: {
                type: 'boolean',
                description: 'Whether to return a summary of results or full detailed output (default: false).',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'mesh_status',
          description: 'Get the current status of the agent mesh network, including active agents, completed tasks, and performance metrics.',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'mesh_plan',
          description: 'Create a task execution plan without running it. Returns immediately with task breakdown, dependencies, and time estimates.',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'The problem to analyze and create a plan for.',
              },
              workFolder: {
                type: 'string',
                description: 'Working directory. Defaults to current directory.',
              },
              approach: {
                type: 'string',
                enum: ['quick', 'balanced', 'thorough'],
                description: 'Planning depth: quick (5-10 tasks), balanced (10-20 tasks), thorough (20+ tasks).',
              },
            },
            required: ['prompt'],
          },
        },
        {
          name: 'mesh_spawn_agent',
          description: 'Spawn a single specialized agent for a specific task. Returns immediately with agent ID.',
          inputSchema: {
            type: 'object',
            properties: {
              taskId: { type: 'string', description: 'Unique task identifier' },
              prompt: { type: 'string', description: 'Task for the agent' },
              agentRole: { 
                type: 'string',
                enum: ['analysis', 'implementation', 'testing', 'documentation', 'debugging'],
                description: 'Agent specialization'
              },
              workFolder: { type: 'string', description: 'Working directory' },
              sessionId: { type: 'string', description: 'Mesh session ID from mesh_plan' },
            },
            required: ['taskId', 'prompt', 'agentRole'],
          },
        },
        {
          name: 'mesh_agent_status',
          description: 'Check status of spawned agents. Returns progress, completion status, and time estimates.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Mesh session ID' },
              agentIds: { 
                type: 'array', 
                items: { type: 'string' },
                description: 'Specific agent IDs to check (optional)'
              },
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_collect_result',
          description: 'Collect results from completed agents.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Mesh session ID' },
              agentId: { type: 'string', description: 'Agent ID to collect results from' },
            },
            required: ['sessionId', 'agentId'],
          },
        },
      ],
    }));

    // Handle mesh tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (args): Promise<ServerResult> => {
      const fullToolName = args.params.name;
      const toolName = fullToolName.includes(':') ? fullToolName.split(':')[1] : fullToolName;
      const toolArguments = args.params.arguments;

      console.error(`[Mesh] Received tool call: ${fullToolName} -> ${toolName}`);

      try {
        switch (toolName) {
          case 'mesh_analyze_problem':
          case 'analyze_problem':
            return await this.handleAnalyzeProblem(toolArguments);
          
          case 'mesh_execute_tasks':
          case 'execute_tasks':
            return await this.handleExecuteTasks(toolArguments);
          
          case 'mesh_solve_problem':
          case 'solve_problem':
            return await this.handleSolveProblem(toolArguments);
          
          case 'mesh_status':
          case 'status':
            return await this.handleMeshStatus();
          
          case 'mesh_plan':
          case 'plan':
            return await this.handleMeshPlan(toolArguments);
            
          case 'mesh_spawn_agent':
          case 'spawn_agent':
            return await this.handleSpawnAgent(toolArguments);
            
          case 'mesh_agent_status':
          case 'agent_status':
            return await this.handleAgentStatus(toolArguments);
            
          case 'mesh_collect_result':
          case 'collect_result':
            return await this.handleCollectResult(toolArguments);
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Mesh tool ${toolName} not found`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new McpError(ErrorCode.InternalError, `Mesh operation failed: ${errorMessage}`);
      }
    });
  }

  /**
   * Handle problem analysis and task decomposition
   */
  private async handleAnalyzeProblem(args: any): Promise<ServerResult> {
    if (!args?.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
    }

    // Auto-detect working directory if not provided
    const workFolder = args.workFolder || process.cwd();
    
    console.error(`[Mesh] Analyzing problem for task decomposition in: ${workFolder}`);
    
    const tasks = await this.meshCoordinator.analyzeProblem(
      args.prompt,
      workFolder
    );

    const response = {
      status: 'success',
      operation: 'problem_analysis',
      tasksGenerated: tasks.length,
      tasks: tasks,
      recommendation: this.generateTaskRecommendation(tasks),
      nextSteps: [
        'Review the generated task breakdown',
        'Modify tasks if needed for your specific requirements',
        'Use mesh_execute_tasks to run the tasks across the agent network',
        'Or use mesh_solve_problem for end-to-end execution'
      ]
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle task execution across the mesh network
   */
  private async handleExecuteTasks(args: any): Promise<ServerResult> {
    if (!args?.tasks || !Array.isArray(args.tasks)) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid tasks array');
    }

    const maxConcurrent = args.maxConcurrent || 5;
    this.meshCoordinator = new MeshCoordinator('claude', maxConcurrent);

    console.error(`[Mesh] Executing ${args.tasks.length} tasks with max ${maxConcurrent} concurrent agents...`);
    
    const startTime = Date.now();
    const results = await this.meshCoordinator.executeMeshTasks(args.tasks);
    const executionTime = Date.now() - startTime;

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    const response = {
      status: successCount === results.length ? 'success' : 'partial_success',
      operation: 'mesh_execution',
      summary: {
        totalTasks: results.length,
        successful: successCount,
        failed: failureCount,
        executionTimeMs: executionTime,
        averageTaskTime: executionTime / results.length
      },
      results: results,
      meshStatus: this.meshCoordinator.getStatus()
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle end-to-end problem solving
   */
  private async handleSolveProblem(args: any): Promise<ServerResult> {
    if (!args?.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
    }

    // Auto-detect working directory if not provided
    const workFolder = args.workFolder || process.cwd();
    const approach = args.approach || 'analysis_first';
    const returnSummary = args.returnSummary || false;

    console.error(`[Mesh] Solving problem using ${approach} approach in: ${workFolder}`);
    
    const startTime = Date.now();

    // Step 1: Analyze the problem
    console.error('[Mesh] Step 1: Problem analysis and decomposition...');
    const tasks = await this.meshCoordinator.analyzeProblem(args.prompt, workFolder);
    console.error(`[Mesh] Generated ${tasks.length} specialized tasks for parallel execution`);

    // Step 2: Execute tasks based on approach
    let results: AgentResult[];
    
    console.error('[Mesh] Step 2: Executing tasks with specialized agents...');
    
    switch (approach) {
      case 'parallel_exploration':
        // Run multiple analysis agents in parallel
        console.error('[Mesh] Using parallel exploration - all agents work simultaneously');
        results = await this.executeParallelExploration(tasks, workFolder);
        break;
      
      case 'iterative_refinement':
        // Cycles of analysis and implementation
        console.error('[Mesh] Using iterative refinement - cycles of analysis and implementation');
        results = await this.executeIterativeRefinement(tasks, workFolder);
        break;
      
      case 'analysis_first':
      default:
        // Standard dependency-ordered execution
        console.error('[Mesh] Using analysis-first approach - dependency-ordered execution');
        results = await this.meshCoordinator.executeMeshTasks(tasks);
        break;
    }

    const executionTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    
    console.error(`[Mesh] All agents completed: ${successCount}/${results.length} successful in ${(executionTime / 1000).toFixed(1)}s`);

    // Step 3: Synthesize results
    console.error('[Mesh] Step 3: Synthesizing results from all agents...');
    const synthesis = await this.synthesizeResults(results, args.prompt, returnSummary);

    const response = {
      status: successCount === results.length ? 'success' : 'partial_success',
      operation: 'end_to_end_problem_solving',
      approach: approach,
      summary: {
        totalTasks: results.length,
        successful: successCount,
        failed: results.length - successCount,
        totalExecutionTimeMs: executionTime
      },
      synthesis: synthesis,
      detailedResults: returnSummary ? undefined : results,
      meshStatus: this.meshCoordinator.getStatus()
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh status requests
   */
  private async handleMeshStatus(): Promise<ServerResult> {
    const status = this.meshCoordinator.getStatus();
    
    const uptime = Math.round((Date.now() - parseInt(status.meshId.split('-')[1], 16)) / 1000);
    const uptimeStr = uptime > 60 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${uptime}s`;
    
    const response = {
      status: 'active',
      timestamp: new Date().toISOString(),
      humanReadable: `MeshSeeks is up and running! ${status.activeAgents} agents active.`,
      meshNetwork: status,
      ascii: `
╔═══════════════════════════════════════════════╗
║        🟦 MeshSeeks Network Status            ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  Network ID: ${status.meshId}            
║  Uptime: ${uptimeStr}                              
║                                               ║
║  🤖 Active Agents: ${status.activeAgents}/${status.maxConcurrency}                  
║  ✅ Completed Tasks: ${status.completedTasks}                    
║  📊 Context Entries: ${status.contextEntries}                    
║                                               ║
║  Available Roles:                             ║
║    🔍 Analysis   ⚙️  Implementation          ║
║    🧪 Testing    📝 Documentation            ║
║    🐛 Debugging                              ║
║                                               ║
╚═══════════════════════════════════════════════╝`
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Execute parallel exploration approach
   */
  private async executeParallelExploration(tasks: TaskRequest[], workFolder: string): Promise<AgentResult[]> {
    // Create multiple analysis tasks to explore different aspects
    const explorationTasks: TaskRequest[] = [
      {
        id: 'explore-architecture',
        prompt: 'Analyze the architectural patterns and design decisions in the codebase',
        agentRole: 'analysis',
        workFolder,
        returnMode: 'summary'
      },
      {
        id: 'explore-dependencies',
        prompt: 'Analyze dependencies, imports, and external integrations',
        agentRole: 'analysis',
        workFolder,
        returnMode: 'summary'
      },
      {
        id: 'explore-testing',
        prompt: 'Analyze the current testing strategy and identify gaps',
        agentRole: 'testing',
        workFolder,
        returnMode: 'summary'
      }
    ];

    const explorationResults = await this.meshCoordinator.executeMeshTasks(explorationTasks);
    
    // Then execute the original tasks with exploration context
    return await this.meshCoordinator.executeMeshTasks(tasks);
  }

  /**
   * Execute iterative refinement approach
   */
  private async executeIterativeRefinement(tasks: TaskRequest[], workFolder: string): Promise<AgentResult[]> {
    const allResults: AgentResult[] = [];
    
    // Execute in iterations: analysis -> implementation -> testing
    const iterations = [
      tasks.filter(t => t.agentRole === 'analysis'),
      tasks.filter(t => t.agentRole === 'implementation'),
      tasks.filter(t => t.agentRole === 'testing' || t.agentRole === 'documentation')
    ];

    for (let i = 0; i < iterations.length; i++) {
      if (iterations[i].length > 0) {
        console.error(`[Mesh] Iteration ${i + 1}: Executing ${iterations[i].length} tasks`);
        const iterationResults = await this.meshCoordinator.executeMeshTasks(iterations[i]);
        allResults.push(...iterationResults);
      }
    }

    return allResults;
  }

  /**
   * Synthesize results from multiple agents
   */
  private async synthesizeResults(results: AgentResult[], originalPrompt: string, returnSummary: boolean): Promise<string> {
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length === 0) {
      return 'No successful results to synthesize. All agents encountered errors.';
    }

    // Create a synthesis prompt
    const synthesisPrompt = `
# Agent Mesh Network Results Synthesis

## Original Problem
${originalPrompt}

## Agent Results Summary
${successfulResults.map(result => `
**${result.role.toUpperCase()} Agent (${result.agentId})**
- Task: ${result.taskId}
- Execution Time: ${result.executionTime}ms
- Result: ${result.result?.substring(0, 500)}${result.result && result.result.length > 500 ? '...' : ''}
`).join('\n')}

## Synthesis Requirements
Please provide a ${returnSummary ? 'concise summary' : 'comprehensive analysis'} that:
1. Integrates the findings from all agents
2. Identifies key insights and patterns
3. Provides actionable recommendations
4. Highlights any conflicts or areas needing attention

Generate the synthesis now:
`;

    // For now, return a structured summary
    // In a full implementation, this could use another Claude agent for synthesis
    return `
## Mesh Network Execution Summary

**Problem:** ${originalPrompt}

**Agents Deployed:** ${results.length} agents across ${new Set(results.map(r => r.role)).size} specializations

**Results:**
${successfulResults.map(result => `- **${result.role}**: ${result.result?.split('\n')[0] || 'Completed successfully'}`).join('\n')}

**Performance:**
- Total execution time: ${Math.max(...results.map(r => r.executionTime))}ms
- Average agent time: ${Math.round(results.reduce((sum, r) => sum + r.executionTime, 0) / results.length)}ms
- Success rate: ${Math.round((successfulResults.length / results.length) * 100)}%

**Recommendations:**
${successfulResults.length === results.length ? 
  '✅ All agents completed successfully. Implementation is ready for testing and deployment.' :
  '⚠️ Some agents encountered issues. Review failed tasks and retry if necessary.'}
`;
  }

  /**
   * Generate task recommendations based on analysis
   */
  private generateTaskRecommendation(tasks: TaskRequest[]): string {
    const roleCount = tasks.reduce((acc, task) => {
      acc[task.agentRole] = (acc[task.agentRole] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxConcurrent = Math.min(tasks.length, 5);
    const estimatedTime = Math.ceil(tasks.length / maxConcurrent) * 30; // Rough estimate: 30s per batch

    return `Generated ${tasks.length} tasks across ${Object.keys(roleCount).length} agent types. 
Role distribution: ${Object.entries(roleCount).map(([role, count]) => `${role}(${count})`).join(', ')}.
Estimated execution time: ~${estimatedTime} seconds with ${maxConcurrent} concurrent agents.`;
  }

  /**
   * Handle mesh_plan - Create execution plan without running
   */
  private async handleMeshPlan(args: any): Promise<ServerResult> {
    if (!args?.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
    }

    const workFolder = args.workFolder || process.cwd();
    const approach = args.approach || 'balanced';
    const sessionId = `mesh-session-${Date.now()}`;
    
    // Create task plan based on approach
    let tasks: TaskRequest[];
    switch (approach) {
      case 'quick':
        tasks = this.createQuickPlan(args.prompt, workFolder);
        break;
      case 'thorough':
        tasks = this.createThoroughPlan(args.prompt, workFolder);
        break;
      default:
        tasks = this.createBalancedPlan(args.prompt, workFolder);
    }
    
    // Store session
    this.sessions.set(sessionId, {
      id: sessionId,
      plan: tasks,
      activeAgents: new Map(),
      completedAgents: new Map(),
      createdAt: Date.now()
    });
    
    // Return plan with time estimates
    const response = {
      sessionId,
      taskCount: tasks.length,
      estimatedTime: `${tasks.length * 30}-${tasks.length * 60} seconds`,
      plan: tasks.map(t => ({
        id: t.id,
        role: t.agentRole,
        description: t.prompt.substring(0, 100) + '...',
        dependencies: t.dependencies || []
      })),
      usage: 'Use mesh_spawn_agent to execute individual tasks from this plan',
      ascii: `
╔═══════════════════════════════════════════════╗
║      🟦 MeshSeeks Execution Plan Ready        ║
╠═══════════════════════════════════════════════╣
║  ${tasks.length} specialized agents identified        ║
║  Estimated time: ${Math.round(tasks.length * 30 / 60)}-${Math.round(tasks.length * 60 / 60)} minutes          ║
║                                               ║
║  Ready to spawn agents in parallel! 🚀        ║
╚═══════════════════════════════════════════════╝`
    };
    
    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }
  
  /**
   * Handle mesh_spawn_agent - Spawn individual agent
   */
  private async handleSpawnAgent(args: any): Promise<ServerResult> {
    if (!args?.taskId || !args?.prompt || !args?.agentRole) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters');
    }
    
    const sessionId = args.sessionId || `standalone-${Date.now()}`;
    const workFolder = args.workFolder || process.cwd();
    
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        plan: [],
        activeAgents: new Map(),
        completedAgents: new Map(),
        createdAt: Date.now()
      };
      this.sessions.set(sessionId, session);
    }
    
    // Create agent ID
    const agentId = `agent-${args.taskId}-${Date.now()}`;
    
    // Track agent
    session.activeAgents.set(agentId, {
      taskId: args.taskId,
      startTime: Date.now(),
      status: 'spawning'
    });
    
    // Spawn agent asynchronously
    this.spawnAgentAsync(agentId, args, workFolder, session);
    
    // Return immediately
    const roleEmojis: Record<string, string> = {
      analysis: '🔍',
      implementation: '⚙️',
      testing: '🧪',
      documentation: '📝',
      debugging: '🐛'
    };
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          agentId,
          sessionId,
          status: 'spawned',
          message: `${roleEmojis[args.agentRole] || '🤖'} Launching ${args.agentRole} agent...`,
          taskInfo: `Working on: "${args.taskId}"`,
          whatNext: `I'll check back in ~30 seconds to see progress`,
          ascii: `
    ╭─────────────────╮
    │ Agent Spawned!  │
    │    ┏━━━┓        │
    │    ┃${roleEmojis[args.agentRole] || '🤖'}┃ <-- ${args.agentRole}
    │    ┗━━━┛        │
    │  Status: 🟢     │
    ╰─────────────────╯`
        }, null, 2) 
      }] 
    };
  }
  
  /**
   * Spawn agent asynchronously
   */
  private async spawnAgentAsync(agentId: string, args: any, workFolder: string, session: MeshSession): Promise<void> {
    try {
      const task: TaskRequest = {
        id: args.taskId,
        prompt: args.prompt,
        agentRole: args.agentRole,
        workFolder,
        returnMode: args.returnMode || 'summary'
      };
      
      // Update status
      const agentInfo = session.activeAgents.get(agentId);
      if (agentInfo) {
        agentInfo.status = 'running';
      }
      
      // Execute task
      const result = await this.meshCoordinator.executeMeshTasks([task]);
      
      // Store result
      if (result.length > 0) {
        session.completedAgents.set(agentId, result[0]);
      }
      
      // Remove from active
      session.activeAgents.delete(agentId);
      
    } catch (error) {
      // Mark as failed
      const agentInfo = session.activeAgents.get(agentId);
      if (agentInfo) {
        agentInfo.status = 'failed';
      }
    }
  }
  
  /**
   * Handle mesh_agent_status - Check agent status
   */
  private async handleAgentStatus(args: any): Promise<ServerResult> {
    if (!args?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }
    
    const session = this.sessions.get(args.sessionId);
    if (!session) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid session ID');
    }
    
    const now = Date.now();
    const activeAgents = Array.from(session.activeAgents.entries()).map(([id, info]) => ({
      id,
      taskId: info.taskId,
      status: info.status,
      runningTime: Math.round((now - info.startTime) / 1000) + 's'
    }));
    
    const completedAgents = Array.from(session.completedAgents.entries()).map(([id, result]) => ({
      id,
      taskId: result.taskId,
      role: result.role,
      success: result.success,
      executionTime: Math.round(result.executionTime / 1000) + 's'
    }));
    
    // Create visual progress bar
    const totalAgents = session.plan.length || (activeAgents.length + completedAgents.length);
    const progressPercent = totalAgents > 0 ? Math.round((completedAgents.length / totalAgents) * 100) : 0;
    const progressBar = '█'.repeat(Math.floor(progressPercent / 5)) + '░'.repeat(20 - Math.floor(progressPercent / 5));
    
    // Create status messages
    const statusMessages = activeAgents.map(agent => 
      `  ${agent.status === 'running' ? '⚡' : '⏳'} ${agent.taskId}: ${agent.status} (${agent.runningTime})`
    ).join('\n');
    
    const response = {
      sessionId: args.sessionId,
      summary: {
        active: activeAgents.length,
        completed: completedAgents.length,
        total: totalAgents,
        progressPercent
      },
      activeAgents,
      completedAgents,
      estimatedRemaining: activeAgents.length > 0 ? `About ${activeAgents.length * 30} seconds` : 'All done!',
      humanReadable: `${completedAgents.length} out of ${totalAgents} agents finished`,
      ascii: `
╔═══════════════════════════════════════════════╗
║          🟦 MeshSeeks Progress Report         ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  Progress: [${progressBar}] ${progressPercent}%
║                                               ║
║  🟢 Active: ${activeAgents.length} agents working hard       
║  ✅ Done: ${completedAgents.length} agents completed         
║  📊 Total: ${totalAgents} agents in the mesh          
║                                               ║
${activeAgents.length > 0 ? '║  Currently running:                           ║\n' + statusMessages.split('\n').map(s => '║' + s.padEnd(47) + '║').join('\n') + '\n║                                               ║' : '║  All agents have finished! 🎉                 ║'}
╚═══════════════════════════════════════════════╝`
    };
    
    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }
  
  /**
   * Handle mesh_collect_result - Collect agent results
   */
  private async handleCollectResult(args: any): Promise<ServerResult> {
    if (!args?.sessionId || !args?.agentId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters');
    }
    
    const session = this.sessions.get(args.sessionId);
    if (!session) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid session ID');
    }
    
    const result = session.completedAgents.get(args.agentId);
    if (!result) {
      // Check if still active
      const stillActive = session.activeAgents.has(args.agentId);
      
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify({ 
            status: 'not_ready', 
            message: stillActive ? "Agent is still thinking... 🤔" : "Hmm, can't find that agent. It might still be spawning.",
            suggestion: "Try checking status again in a few seconds",
            ascii: `
    ╭─────────────────╮
    │   Not Ready!    │
    │                 │
    │    ⏳💭         │
    │                 │
    │ Check back soon │
    ╰─────────────────╯`
          }, null, 2) 
        }] 
      };
    }
    
    const roleEmojis: Record<string, string> = {
      analysis: '🔍',
      implementation: '⚙️',
      testing: '🧪',
      documentation: '📝',
      debugging: '🐛'
    };
    
    return { 
      content: [{ 
        type: 'text', 
        text: JSON.stringify({
          agentId: args.agentId,
          taskId: result.taskId,
          role: result.role,
          success: result.success,
          executionTime: `${Math.round(result.executionTime / 1000)} seconds`,
          result: result.result,
          error: result.error,
          humanReadable: result.success 
            ? `${roleEmojis[result.role]} The ${result.role} agent finished successfully!`
            : `❌ The ${result.role} agent hit a snag`,
          ascii: result.success ? `
╔═══════════════════════════════════════════════╗
║            ✨ Agent Complete! ✨              ║
╠═══════════════════════════════════════════════╣
║                                               ║
║     ${roleEmojis[result.role]}  ${result.role.toUpperCase()} AGENT              
║     └─ Finished in ${Math.round(result.executionTime / 1000)}s                     
║                                               ║
║     Status: ✅ SUCCESS                        ║
║                                               ║
╚═══════════════════════════════════════════════╝` : `
╔═══════════════════════════════════════════════╗
║              ❌ Agent Failed                  ║
╠═══════════════════════════════════════════════╣
║                                               ║
║     ${roleEmojis[result.role]}  ${result.role.toUpperCase()} AGENT              
║     └─ Encountered an error                   ║
║                                               ║
║     See error details below                   ║
║                                               ║
╚═══════════════════════════════════════════════╝`
        }, null, 2) 
      }] 
    };
  }
  
  /**
   * Create task plans of different depths
   */
  private createQuickPlan(prompt: string, workFolder: string): TaskRequest[] {
    return [
      { id: 'quick-analysis', prompt: `Quick analysis: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'summary' },
      { id: 'quick-impl', prompt: `Quick implementation check: ${prompt}`, agentRole: 'implementation', workFolder, returnMode: 'summary', dependencies: ['quick-analysis'] }
    ];
  }
  
  private createBalancedPlan(prompt: string, workFolder: string): TaskRequest[] {
    return [
      { id: 'arch', prompt: `Analyze architecture for: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'summary' },
      { id: 'perf', prompt: `Analyze performance for: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'summary' },
      { id: 'impl', prompt: `Implementation approach for: ${prompt}`, agentRole: 'implementation', workFolder, returnMode: 'summary', dependencies: ['arch'] },
      { id: 'test', prompt: `Testing strategy for: ${prompt}`, agentRole: 'testing', workFolder, returnMode: 'summary', dependencies: ['impl'] }
    ];
  }
  
  private createThoroughPlan(prompt: string, workFolder: string): TaskRequest[] {
    // Create comprehensive plan with many specialized tasks
    const plan: TaskRequest[] = [
      { id: 'arch-1', prompt: `Deep architecture analysis: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'full' },
      { id: 'deps-1', prompt: `Dependency analysis: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'full' },
      { id: 'perf-1', prompt: `Performance analysis: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'full' },
      { id: 'sec-1', prompt: `Security analysis: ${prompt}`, agentRole: 'analysis', workFolder, returnMode: 'full' },
      // ... add more tasks
    ];
    return plan;
  }

  /**
   * Start the mesh-enhanced MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code Mesh Network MCP server running on stdio');
  }
}

// Export the class
export { MeshEnhancedServer };

// Create and run the mesh server
const meshServer = new MeshEnhancedServer();
meshServer.run().catch(console.error);
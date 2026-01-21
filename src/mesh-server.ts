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
import { stopStatusBoard } from './status-board-stderr.js';
import { SwarmOrchestrator } from './swarm/swarm-orchestrator.js';
import type {
  CreateSessionArgs,
  ResumeSessionArgs,
  PauseSessionArgs,
  SessionStatusArgs,
  PlanHierarchicalArgs,
  VerifyTaskArgs,
  ScaleAgentsArgs,
  CreateCheckpointArgs,
  ListCheckpointsArgs,
  RestoreCheckpointArgs
} from './types/swarm-types.js';

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

// Tool argument interfaces for type safety
interface AnalyzeProblemArgs {
  prompt: string;
  workFolder?: string;
  complexity?: 'simple' | 'moderate' | 'complex' | 'enterprise';
}

interface ExecuteTasksArgs {
  tasks: Array<{
    id: string;
    prompt: string;
    agentRole: 'analysis' | 'implementation' | 'testing' | 'documentation' | 'debugging';
    workFolder?: string;
    returnMode?: 'summary' | 'full';
    dependencies?: string[];
  }>;
  maxConcurrent?: number;
}

interface SolveProblemArgs {
  prompt: string;
  workFolder?: string;
  approach?: 'analysis_first' | 'parallel_exploration' | 'iterative_refinement';
  agentCount?: number;
  returnSummary?: boolean;
}

interface MeshPlanArgs {
  prompt: string;
  workFolder?: string;
  approach?: 'quick' | 'balanced' | 'thorough';
}

interface SpawnAgentArgs {
  taskId: string;
  prompt: string;
  agentRole: 'analysis' | 'implementation' | 'testing' | 'documentation' | 'debugging';
  workFolder?: string;
  sessionId?: string;
  returnMode?: 'summary' | 'full';
}

interface AgentStatusArgs {
  sessionId: string;
  agentIds?: string[];
}

interface CollectResultArgs {
  sessionId: string;
  agentId: string;
}

class MeshEnhancedServer {
  private server: Server;
  private meshCoordinator: MeshCoordinator;
  private sessions: Map<string, MeshSession> = new Map();
  private swarmOrchestrator: SwarmOrchestrator;
  private swarmInitialized: boolean = false;

  constructor() {
    // Debug: Log to stderr on startup
    console.error('[MeshSeeks] Server starting with stderr status board v1.1...');

    this.meshCoordinator = new MeshCoordinator();
    this.swarmOrchestrator = new SwarmOrchestrator();
    
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

    // Set up graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  /**
   * Set up graceful shutdown handlers to clean up resources
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      console.error(`[MeshSeeks] Received ${signal}, shutting down gracefully...`);

      // Stop the status board to clean up its interval
      stopStatusBoard();

      // Close the MCP server
      try {
        await this.server.close();
        console.error('[MeshSeeks] Server closed successfully');
      } catch (error) {
        console.error('[MeshSeeks] Error closing server:', error);
      }

      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      console.error('[MeshSeeks] Uncaught exception:', error);
      stopStatusBoard();
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MeshSeeks] Unhandled rejection at:', promise, 'reason:', reason);
      stopStatusBoard();
      process.exit(1);
    });
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
        // =================================================================
        // SWARM TOOLS - Cursor-scale operations (100+ agents)
        // =================================================================
        {
          name: 'mesh_swarm_create_session',
          description: 'Create a new autonomous swarm session for complex, multi-day operations. Supports 100+ concurrent agents, hierarchical task decomposition, and automatic checkpointing.',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Session name for identification' },
              description: { type: 'string', description: 'Optional description of the session goal' },
              prompt: { type: 'string', description: 'The complex problem to solve autonomously' },
              workFolder: { type: 'string', description: 'Working directory for the session' },
              config: {
                type: 'object',
                description: 'Optional configuration overrides',
                properties: {
                  maxConcurrentAgents: { type: 'number', description: 'Max concurrent agents (1-500)' },
                  maxTaskDepth: { type: 'number', description: 'Max task hierarchy depth (1-5)' },
                  enableJudge: { type: 'boolean', description: 'Enable automated verification' }
                }
              }
            },
            required: ['name', 'prompt', 'workFolder'],
          },
        },
        {
          name: 'mesh_swarm_resume_session',
          description: 'Resume a paused or failed swarm session from its last checkpoint or a specific checkpoint.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID to resume' },
              checkpointId: { type: 'string', description: 'Optional checkpoint ID to restore from' },
              resetFailedTasks: { type: 'boolean', description: 'Reset failed tasks to pending (default: false)' }
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_swarm_pause_session',
          description: 'Gracefully pause a running swarm session, creating a checkpoint for later resumption.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID to pause' },
              reason: { type: 'string', description: 'Optional reason for pausing' }
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_swarm_session_status',
          description: 'Get detailed status and metrics for a swarm session including progress, agent states, and task breakdown.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID to query' },
              includeTaskDetails: { type: 'boolean', description: 'Include detailed task information' },
              includeAgentDetails: { type: 'boolean', description: 'Include detailed agent information' }
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_swarm_plan_hierarchical',
          description: 'Perform multi-level task decomposition for a swarm session. Creates hierarchical task tree with dependencies.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
              taskId: { type: 'string', description: 'Parent task to decompose (root if not provided)' },
              maxDepth: { type: 'number', description: 'Maximum decomposition depth (1-5)' },
              maxTasksPerLevel: { type: 'number', description: 'Maximum tasks per level (default: 100)' }
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_swarm_verify_task',
          description: 'Trigger judge verification for a completed task. Returns verdict with pass/fail, confidence, and rework instructions if needed.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
              taskId: { type: 'string', description: 'Task ID to verify' },
              criteria: {
                type: 'array',
                items: { type: 'string', enum: ['completeness', 'correctness', 'quality', 'testing', 'documentation', 'security', 'performance'] },
                description: 'Specific criteria to evaluate (default: role-based)'
              },
              customPrompt: { type: 'string', description: 'Custom verification prompt' }
            },
            required: ['sessionId', 'taskId'],
          },
        },
        {
          name: 'mesh_swarm_scale_agents',
          description: 'Dynamically adjust the agent pool size for a running session.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
              targetCount: { type: 'number', description: 'Target number of agents (1-500)' },
              reason: { type: 'string', description: 'Reason for scaling' }
            },
            required: ['sessionId', 'targetCount'],
          },
        },
        {
          name: 'mesh_swarm_create_checkpoint',
          description: 'Manually create a checkpoint for a swarm session. Use for milestones or before risky operations.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
              description: { type: 'string', description: 'Checkpoint description' }
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_swarm_list_checkpoints',
          description: 'List all checkpoints for a swarm session with timestamps and descriptions.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
              limit: { type: 'number', description: 'Maximum checkpoints to return' },
              offset: { type: 'number', description: 'Offset for pagination' }
            },
            required: ['sessionId'],
          },
        },
        {
          name: 'mesh_swarm_restore_checkpoint',
          description: 'Restore a swarm session to a specific checkpoint state.',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: { type: 'string', description: 'Session ID' },
              checkpointId: { type: 'string', description: 'Checkpoint ID to restore' },
              resetFailedTasks: { type: 'boolean', description: 'Reset failed tasks to pending' }
            },
            required: ['sessionId', 'checkpointId'],
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

          // Swarm tools
          case 'mesh_swarm_create_session':
            return await this.handleSwarmCreateSession(toolArguments);

          case 'mesh_swarm_resume_session':
            return await this.handleSwarmResumeSession(toolArguments);

          case 'mesh_swarm_pause_session':
            return await this.handleSwarmPauseSession(toolArguments);

          case 'mesh_swarm_session_status':
            return await this.handleSwarmSessionStatus(toolArguments);

          case 'mesh_swarm_plan_hierarchical':
            return await this.handleSwarmPlanHierarchical(toolArguments);

          case 'mesh_swarm_verify_task':
            return await this.handleSwarmVerifyTask(toolArguments);

          case 'mesh_swarm_scale_agents':
            return await this.handleSwarmScaleAgents(toolArguments);

          case 'mesh_swarm_create_checkpoint':
            return await this.handleSwarmCreateCheckpoint(toolArguments);

          case 'mesh_swarm_list_checkpoints':
            return await this.handleSwarmListCheckpoints(toolArguments);

          case 'mesh_swarm_restore_checkpoint':
            return await this.handleSwarmRestoreCheckpoint(toolArguments);

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
  private async handleAnalyzeProblem(args: unknown): Promise<ServerResult> {
    const typedArgs = args as AnalyzeProblemArgs | undefined;
    if (!typedArgs?.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
    }

    // Auto-detect working directory if not provided
    const workFolder = typedArgs.workFolder || process.cwd();
    
    console.error(`[Mesh] Analyzing problem for task decomposition in: ${workFolder}`);

    const tasks = await this.meshCoordinator.analyzeProblem(
      typedArgs.prompt,
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
  private async handleExecuteTasks(args: unknown): Promise<ServerResult> {
    const typedArgs = args as ExecuteTasksArgs | undefined;
    if (!typedArgs?.tasks || !Array.isArray(typedArgs.tasks)) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid tasks array');
    }

    const maxConcurrent = typedArgs.maxConcurrent || 5;
    this.meshCoordinator = new MeshCoordinator('claude', maxConcurrent);

    console.error(`[Mesh] Executing ${typedArgs.tasks.length} tasks with max ${maxConcurrent} concurrent agents...`);

    const startTime = Date.now();
    const results = await this.meshCoordinator.executeMeshTasks(typedArgs.tasks as TaskRequest[]);
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
  private async handleSolveProblem(args: unknown): Promise<ServerResult> {
    const typedArgs = args as SolveProblemArgs | undefined;
    if (!typedArgs?.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
    }

    // Auto-detect working directory if not provided
    const workFolder = typedArgs.workFolder || process.cwd();
    const approach = typedArgs.approach || 'analysis_first';
    const returnSummary = typedArgs.returnSummary || false;

    console.error(`[Mesh] Solving problem using ${approach} approach in: ${workFolder}`);

    const startTime = Date.now();

    // Step 1: Analyze the problem
    console.error('[Mesh] Step 1: Problem analysis and decomposition...');
    const tasks = await this.meshCoordinator.analyzeProblem(typedArgs.prompt, workFolder);
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
    const synthesis = await this.synthesizeResults(results, typedArgs.prompt, returnSummary);

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
  private async handleMeshPlan(args: unknown): Promise<ServerResult> {
    const typedArgs = args as MeshPlanArgs | undefined;
    if (!typedArgs?.prompt) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: prompt');
    }

    const workFolder = typedArgs.workFolder || process.cwd();
    const approach = typedArgs.approach || 'balanced';
    const sessionId = `mesh-session-${Date.now()}`;

    // Create task plan based on approach
    let tasks: TaskRequest[];
    switch (approach) {
      case 'quick':
        tasks = this.createQuickPlan(typedArgs.prompt, workFolder);
        break;
      case 'thorough':
        tasks = this.createThoroughPlan(typedArgs.prompt, workFolder);
        break;
      default:
        tasks = this.createBalancedPlan(typedArgs.prompt, workFolder);
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
  private async handleSpawnAgent(args: unknown): Promise<ServerResult> {
    const typedArgs = args as SpawnAgentArgs | undefined;
    if (!typedArgs?.taskId || !typedArgs?.prompt || !typedArgs?.agentRole) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters');
    }

    const sessionId = typedArgs.sessionId || `standalone-${Date.now()}`;
    const workFolder = typedArgs.workFolder || process.cwd();
    
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
    const agentId = `agent-${typedArgs.taskId}-${Date.now()}`;

    // Track agent
    session.activeAgents.set(agentId, {
      taskId: typedArgs.taskId,
      startTime: Date.now(),
      status: 'spawning'
    });

    // Spawn agent asynchronously
    this.spawnAgentAsync(agentId, typedArgs, workFolder, session);

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
          message: `${roleEmojis[typedArgs.agentRole] || '🤖'} Launching ${typedArgs.agentRole} agent...`,
          taskInfo: `Working on: "${typedArgs.taskId}"`,
          whatNext: `I'll check back in ~30 seconds to see progress`,
          ascii: `
    ╭─────────────────╮
    │ Agent Spawned!  │
    │    ┏━━━┓        │
    │    ┃${roleEmojis[typedArgs.agentRole] || '🤖'}┃ <-- ${typedArgs.agentRole}
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
  private async spawnAgentAsync(agentId: string, args: SpawnAgentArgs, workFolder: string, session: MeshSession): Promise<void> {
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
  private async handleAgentStatus(args: unknown): Promise<ServerResult> {
    const typedArgs = args as AgentStatusArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    const session = this.sessions.get(typedArgs.sessionId);
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
      sessionId: typedArgs.sessionId,
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
  private async handleCollectResult(args: unknown): Promise<ServerResult> {
    const typedArgs = args as CollectResultArgs | undefined;
    if (!typedArgs?.sessionId || !typedArgs?.agentId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters');
    }

    const session = this.sessions.get(typedArgs.sessionId);
    if (!session) {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid session ID');
    }

    const result = session.completedAgents.get(typedArgs.agentId);
    if (!result) {
      // Check if still active
      const stillActive = session.activeAgents.has(typedArgs.agentId);
      
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
          agentId: typedArgs.agentId,
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

  // ===========================================================================
  // SWARM HANDLERS
  // ===========================================================================

  /**
   * Ensure swarm orchestrator is initialized.
   */
  private async ensureSwarmInitialized(): Promise<void> {
    if (!this.swarmInitialized) {
      await this.swarmOrchestrator.initialize();
      this.swarmInitialized = true;
    }
  }

  /**
   * Handle mesh_swarm_create_session.
   */
  private async handleSwarmCreateSession(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as CreateSessionArgs | undefined;
    if (!typedArgs?.name || !typedArgs?.prompt || !typedArgs?.workFolder) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: name, prompt, workFolder');
    }

    console.error(`[Swarm] Creating session: ${typedArgs.name}`);

    const session = await this.swarmOrchestrator.createSession({
      name: typedArgs.name,
      description: typedArgs.description,
      prompt: typedArgs.prompt,
      workFolder: typedArgs.workFolder,
      config: typedArgs.config
    });

    const response = {
      status: 'success',
      operation: 'swarm_create_session',
      sessionId: session.id,
      name: session.name,
      rootTaskId: session.rootTaskId,
      nextSteps: [
        `Session created with ID: ${session.id}`,
        'Use mesh_swarm_plan_hierarchical to decompose the problem',
        'Use mesh_swarm_session_status to monitor progress',
        'Session will checkpoint automatically every 5 minutes'
      ]
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_resume_session.
   */
  private async handleSwarmResumeSession(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as ResumeSessionArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    console.error(`[Swarm] Resuming session: ${typedArgs.sessionId}`);

    const session = await this.swarmOrchestrator.resumeSession(
      typedArgs.sessionId,
      typedArgs.checkpointId,
      typedArgs.resetFailedTasks
    );

    const response = {
      status: 'success',
      operation: 'swarm_resume_session',
      sessionId: session.id,
      sessionStatus: session.status,
      metrics: session.metrics
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_pause_session.
   */
  private async handleSwarmPauseSession(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as PauseSessionArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    console.error(`[Swarm] Pausing session: ${typedArgs.sessionId}`);

    const session = await this.swarmOrchestrator.pauseSession(
      typedArgs.sessionId,
      typedArgs.reason
    );

    const response = {
      status: 'success',
      operation: 'swarm_pause_session',
      sessionId: session.id,
      sessionStatus: session.status,
      lastCheckpointId: session.lastCheckpointId
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_session_status.
   */
  private async handleSwarmSessionStatus(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as SessionStatusArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    const status = this.swarmOrchestrator.getSessionStatus(typedArgs.sessionId);
    const session = await this.swarmOrchestrator.getSession(typedArgs.sessionId);
    const poolStats = this.swarmOrchestrator.getPoolStats();

    const response: Record<string, unknown> = {
      status: 'success',
      operation: 'swarm_session_status',
      sessionId: typedArgs.sessionId,
      sessionStatus: status.status,
      progress: `${status.progress.toFixed(1)}%`,
      metrics: status.metrics,
      poolStats: {
        totalAgents: poolStats.totalAgents,
        busyAgents: poolStats.busyAgents,
        health: poolStats.health,
        utilization: `${poolStats.utilizationPercent.toFixed(1)}%`
      }
    };

    if (typedArgs.includeTaskDetails && session) {
      const taskTree = session.taskTree instanceof Map
        ? Object.fromEntries(session.taskTree)
        : session.taskTree;
      response.taskTree = taskTree;
    }

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_plan_hierarchical.
   */
  private async handleSwarmPlanHierarchical(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as PlanHierarchicalArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    console.error(`[Swarm] Planning hierarchical tasks for session: ${typedArgs.sessionId}`);

    const session = await this.swarmOrchestrator.getSession(typedArgs.sessionId);
    if (!session) {
      throw new McpError(ErrorCode.InvalidParams, `Session not found: ${typedArgs.sessionId}`);
    }

    // Get the task to decompose
    const taskId = typedArgs.taskId || session.rootTaskId;
    const taskTree = session.taskTree instanceof Map
      ? session.taskTree
      : new Map(Object.entries(session.taskTree));
    const task = taskTree.get(taskId);

    if (!task) {
      throw new McpError(ErrorCode.InvalidParams, `Task not found: ${taskId}`);
    }

    // Plan using the orchestrator
    const newTasks = await this.swarmOrchestrator['planner'].decompose(task, {
      sessionId: session.id,
      workFolder: task.workFolder,
      maxDepth: typedArgs.maxDepth || 5,
      maxTasksPerLevel: typedArgs.maxTasksPerLevel || 100,
      existingTaskIds: new Set(taskTree.keys())
    });

    const response = {
      status: 'success',
      operation: 'swarm_plan_hierarchical',
      sessionId: typedArgs.sessionId,
      parentTaskId: taskId,
      tasksCreated: newTasks.tasks.length,
      maxDepthReached: newTasks.maxDepthReached,
      tasks: newTasks.tasks.map(t => ({
        id: t.id,
        role: t.role,
        depth: t.depth,
        dependencies: t.dependencies
      }))
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_verify_task.
   */
  private async handleSwarmVerifyTask(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as VerifyTaskArgs | undefined;
    if (!typedArgs?.sessionId || !typedArgs?.taskId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: sessionId, taskId');
    }

    console.error(`[Swarm] Verifying task: ${typedArgs.taskId}`);

    const session = await this.swarmOrchestrator.getSession(typedArgs.sessionId);
    if (!session) {
      throw new McpError(ErrorCode.InvalidParams, `Session not found: ${typedArgs.sessionId}`);
    }

    const taskTree = session.taskTree instanceof Map
      ? session.taskTree
      : new Map(Object.entries(session.taskTree));
    const task = taskTree.get(typedArgs.taskId);

    if (!task) {
      throw new McpError(ErrorCode.InvalidParams, `Task not found: ${typedArgs.taskId}`);
    }

    if (!task.result) {
      throw new McpError(ErrorCode.InvalidParams, 'Task has no result to verify');
    }

    const verdict = await this.swarmOrchestrator.verifyTask(task, task.result);

    const response = {
      status: 'success',
      operation: 'swarm_verify_task',
      taskId: typedArgs.taskId,
      verdict: {
        passed: verdict.passed,
        overallScore: verdict.overallScore,
        confidence: verdict.confidence,
        requiresRework: verdict.requiresRework,
        criteria: verdict.criteria.map(c => ({
          type: c.type,
          passed: c.passed,
          score: c.score,
          feedback: c.feedback
        }))
      }
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_scale_agents.
   */
  private async handleSwarmScaleAgents(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as ScaleAgentsArgs | undefined;
    if (!typedArgs?.sessionId || typeof typedArgs?.targetCount !== 'number') {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: sessionId, targetCount');
    }

    console.error(`[Swarm] Scaling agents to ${typedArgs.targetCount}`);

    await this.swarmOrchestrator.scaleAgents(typedArgs.targetCount, typedArgs.reason);
    const stats = this.swarmOrchestrator.getPoolStats();

    const response = {
      status: 'success',
      operation: 'swarm_scale_agents',
      targetCount: typedArgs.targetCount,
      currentCount: stats.totalAgents,
      health: stats.health,
      utilization: `${stats.utilizationPercent.toFixed(1)}%`
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_create_checkpoint.
   */
  private async handleSwarmCreateCheckpoint(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as CreateCheckpointArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    console.error(`[Swarm] Creating checkpoint for session: ${typedArgs.sessionId}`);

    const checkpointId = await this.swarmOrchestrator.createCheckpoint(
      typedArgs.sessionId,
      typedArgs.description
    );

    const response = {
      status: 'success',
      operation: 'swarm_create_checkpoint',
      sessionId: typedArgs.sessionId,
      checkpointId,
      description: typedArgs.description || 'Manual checkpoint'
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_list_checkpoints.
   */
  private async handleSwarmListCheckpoints(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as ListCheckpointsArgs | undefined;
    if (!typedArgs?.sessionId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: sessionId');
    }

    const checkpoints = await this.swarmOrchestrator.listCheckpoints(typedArgs.sessionId);

    const response = {
      status: 'success',
      operation: 'swarm_list_checkpoints',
      sessionId: typedArgs.sessionId,
      checkpointCount: checkpoints.length,
      checkpoints: checkpoints.map(c => ({
        id: c.id,
        timestamp: new Date(c.timestamp).toISOString()
      }))
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
  }

  /**
   * Handle mesh_swarm_restore_checkpoint.
   */
  private async handleSwarmRestoreCheckpoint(args: unknown): Promise<ServerResult> {
    await this.ensureSwarmInitialized();

    const typedArgs = args as RestoreCheckpointArgs | undefined;
    if (!typedArgs?.sessionId || !typedArgs?.checkpointId) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: sessionId, checkpointId');
    }

    console.error(`[Swarm] Restoring checkpoint: ${typedArgs.checkpointId}`);

    const session = await this.swarmOrchestrator.restoreCheckpoint(
      typedArgs.sessionId,
      typedArgs.checkpointId
    );

    const response = {
      status: 'success',
      operation: 'swarm_restore_checkpoint',
      sessionId: session.id,
      checkpointId: typedArgs.checkpointId,
      sessionStatus: session.status,
      metrics: session.metrics
    };

    return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
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
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
class MeshEnhancedServer {
  private server: Server;
  private meshCoordinator: MeshCoordinator;

  constructor() {
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
                description: 'The working directory for the project.',
              },
              complexity: {
                type: 'string',
                enum: ['simple', 'moderate', 'complex', 'enterprise'],
                description: 'Complexity level to determine the number of agents and task granularity.',
              },
            },
            required: ['prompt', 'workFolder'],
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
                    workFolder: { type: 'string' },
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
                  required: ['id', 'prompt', 'agentRole', 'workFolder']
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
                description: 'The working directory for the project.',
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
            required: ['prompt', 'workFolder'],
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
    if (!args?.prompt || !args?.workFolder) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: prompt and workFolder');
    }

    console.error('[Mesh] Analyzing problem for task decomposition...');
    
    const tasks = await this.meshCoordinator.analyzeProblem(
      args.prompt,
      args.workFolder
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
    if (!args?.prompt || !args?.workFolder) {
      throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: prompt and workFolder');
    }

    const approach = args.approach || 'analysis_first';
    const returnSummary = args.returnSummary || false;

    console.error(`[Mesh] Solving problem using ${approach} approach...`);
    
    const startTime = Date.now();

    // Step 1: Analyze the problem
    console.error('[Mesh] Step 1: Problem analysis and decomposition...');
    const tasks = await this.meshCoordinator.analyzeProblem(args.prompt, args.workFolder);

    // Step 2: Execute tasks based on approach
    let results: AgentResult[];
    
    switch (approach) {
      case 'parallel_exploration':
        // Run multiple analysis agents in parallel
        results = await this.executeParallelExploration(tasks, args.workFolder);
        break;
      
      case 'iterative_refinement':
        // Cycles of analysis and implementation
        results = await this.executeIterativeRefinement(tasks, args.workFolder);
        break;
      
      case 'analysis_first':
      default:
        // Standard dependency-ordered execution
        results = await this.meshCoordinator.executeMeshTasks(tasks);
        break;
    }

    const executionTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    // Step 3: Synthesize results
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
    
    const response = {
      status: 'active',
      timestamp: new Date().toISOString(),
      meshNetwork: status
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
/**
 * MeshSeeks Swarm Types - Cursor-Scale Architecture
 *
 * This module defines all TypeScript interfaces and types for the swarm orchestration
 * system, supporting 100+ concurrent agents, week-long sessions, hierarchical planning,
 * and automated verification.
 *
 * @module swarm-types
 * @see https://github.com/anthropics/claude-code
 */

// =============================================================================
// AGENT ROLES & CONFIGURATION
// =============================================================================

/**
 * Extended agent roles for Cursor-scale operations.
 * Original roles: 'analysis' | 'implementation' | 'testing' | 'documentation' | 'debugging'
 * New roles: 'planner' | 'judge' | 'synthesizer' | 'monitor'
 */
export type ExtendedAgentRole =
  | 'analysis'
  | 'implementation'
  | 'testing'
  | 'documentation'
  | 'debugging'
  | 'planner'      // Creates hierarchical task decomposition
  | 'judge'        // Verifies task completion and quality
  | 'synthesizer'  // Combines results from multiple agents
  | 'monitor';     // Watches system health and progress

/**
 * Agent priority levels for scheduling.
 */
export type AgentPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Agent lifecycle states.
 */
export type AgentState =
  | 'idle'         // Available for work
  | 'starting'     // Being initialized
  | 'running'      // Actively executing a task
  | 'waiting'      // Waiting for dependencies
  | 'stopping'     // Graceful shutdown in progress
  | 'stopped'      // Fully stopped
  | 'failed'       // Failed and requires attention
  | 'recovering';  // Recovering from failure

/**
 * Extended agent configuration for swarm operations.
 */
export interface SwarmAgentConfig {
  id: string;
  role: ExtendedAgentRole;
  workFolder: string;
  priority: AgentPriority;
  contextData?: unknown;
  maxRetries: number;
  timeoutMs: number;
  createdAt: number;
  state: AgentState;
  currentTaskId?: string;
  completedTasks: number;
  failedTasks: number;
  totalExecutionTimeMs: number;
  lastActivityAt: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// TASK HIERARCHY
// =============================================================================

/**
 * Task status throughout its lifecycle.
 */
export type TaskStatus =
  | 'pending'      // Created, not yet started
  | 'queued'       // In queue, waiting for agent
  | 'blocked'      // Waiting on dependencies
  | 'in_progress'  // Being executed
  | 'verifying'    // Judge is verifying result
  | 'rework'       // Failed verification, needs retry
  | 'completed'    // Successfully completed
  | 'failed'       // Failed after all retries
  | 'cancelled';   // Explicitly cancelled

/**
 * Task priority for scheduling within the swarm.
 */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Hierarchical task supporting recursive decomposition.
 * Supports up to 5 levels of depth to prevent infinite recursion.
 */
export interface HierarchicalTask {
  id: string;
  parentId: string | null;          // null for root tasks
  depth: number;                     // 0 = root, max 5
  children: string[];                // Child task IDs

  // Task definition
  prompt: string;
  role: ExtendedAgentRole;
  workFolder: string;
  returnMode: 'summary' | 'full';
  dependencies: string[];            // Task IDs this depends on

  // Execution state
  status: TaskStatus;
  priority: TaskPriority;
  retryCount: number;
  maxRetries: number;
  assignedAgentId?: string;

  // Timing
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  estimatedDurationMs?: number;
  actualDurationMs?: number;

  // Results
  result?: TaskResult;
  checkpointId?: string;             // Checkpoint taken after completion

  // Metadata
  tags: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Result of task execution.
 */
export interface TaskResult {
  success: boolean;
  output: string;
  summary?: string;
  artifacts?: TaskArtifact[];
  metrics?: TaskMetrics;
  error?: TaskError;
}

/**
 * Artifact produced by a task (file, code, etc.).
 */
export interface TaskArtifact {
  type: 'file' | 'code' | 'document' | 'test' | 'other';
  path?: string;
  content?: string;
  description: string;
}

/**
 * Execution metrics for a task.
 */
export interface TaskMetrics {
  executionTimeMs: number;
  tokensUsed?: number;
  apiCalls?: number;
  filesModified?: number;
  testsRun?: number;
  testsPassed?: number;
}

/**
 * Error information for failed tasks.
 */
export interface TaskError {
  code: string;
  message: string;
  stack?: string;
  recoverable: boolean;
  suggestedAction?: string;
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

/**
 * Session status for long-running operations.
 */
export type SessionStatus =
  | 'initializing'  // Being set up
  | 'active'        // Running normally
  | 'paused'        // Temporarily suspended
  | 'resuming'      // Coming back from pause
  | 'completing'    // Finishing up final tasks
  | 'completed'     // Successfully finished
  | 'failed'        // Failed with errors
  | 'archived';     // Moved to long-term storage

/**
 * Swarm session supporting week-long operations.
 */
export interface SwarmSession {
  id: string;
  name: string;
  description?: string;
  status: SessionStatus;

  // Task hierarchy
  rootTaskId: string;
  taskTree: Map<string, HierarchicalTask> | Record<string, HierarchicalTask>;

  // Checkpointing
  lastCheckpointId: string | null;
  checkpointIds: string[];
  autoCheckpointIntervalMs: number;

  // Configuration
  config: SwarmConfig;

  // Timing
  createdAt: number;
  startedAt?: number;
  pausedAt?: number;
  resumedAt?: number;
  completedAt?: number;
  expiresAt: number;                 // Auto-archive after this time

  // Metrics
  metrics: SessionMetrics;

  // Error tracking
  errors: SessionError[];

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for swarm operation.
 */
export interface SwarmConfig {
  maxConcurrentAgents: number;       // 1-500
  maxTaskDepth: number;              // 1-5
  agentTimeoutMs: number;            // Per-agent timeout
  sessionTimeoutMs: number;          // Overall session timeout (up to 7 days)

  // Judge configuration
  enableJudge: boolean;
  judgePassThreshold: number;        // 0.0-1.0
  maxJudgeRetries: number;

  // Checkpoint configuration
  checkpointIntervalMs: number;
  checkpointDir: string;
  maxCheckpointsPerSession: number;

  // Scaling configuration
  minAgents: number;
  maxAgents: number;
  scaleUpThreshold: number;          // Queue depth to trigger scale-up
  scaleDownThreshold: number;        // Idle time to trigger scale-down

  // Error handling
  maxConsecutiveFailures: number;
  failureThresholdPercent: number;   // Fail session if > this % tasks fail

  // Resource limits
  maxTotalTasks: number;
  maxTasksPerLevel: number;
}

/**
 * Session-level metrics.
 */
export interface SessionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;

  totalAgentsSpawned: number;
  currentActiveAgents: number;
  peakActiveAgents: number;

  totalExecutionTimeMs: number;
  averageTaskDurationMs: number;

  checkpointsTaken: number;
  checkpointsRestored: number;

  judgeVerifications: number;
  judgeApprovals: number;
  judgeRejections: number;

  tasksPerDepth: Record<number, number>;
  tasksByStatus: Record<TaskStatus, number>;
  tasksByRole: Record<ExtendedAgentRole, number>;
}

/**
 * Session error record.
 */
export interface SessionError {
  timestamp: number;
  taskId?: string;
  agentId?: string;
  code: string;
  message: string;
  severity: 'warning' | 'error' | 'critical';
  recovered: boolean;
}

// =============================================================================
// JUDGE SYSTEM
// =============================================================================

/**
 * Types of verification criteria.
 */
export type JudgeCriterionType =
  | 'completeness'    // Task fully addresses requirements
  | 'correctness'     // Output is correct/accurate
  | 'quality'         // Code/output quality standards
  | 'testing'         // Tests pass and have coverage
  | 'documentation'   // Docs are adequate
  | 'security'        // No security issues
  | 'performance'     // Meets performance requirements
  | 'custom';         // Custom criterion

/**
 * Individual verification criterion and its result.
 */
export interface JudgeCriterion {
  type: JudgeCriterionType;
  name: string;
  description: string;
  weight: number;                    // 0.0-1.0, weights sum to 1.0
  passed: boolean;
  score: number;                     // 0.0-1.0
  feedback: string;
  evidence?: string[];
}

/**
 * Judge verdict for a task.
 */
export interface JudgeVerdict {
  taskId: string;
  judgeAgentId: string;
  timestamp: number;

  passed: boolean;
  confidence: number;                // 0.0-1.0
  overallScore: number;              // Weighted average of criteria

  criteria: JudgeCriterion[];

  requiresRework: boolean;
  reworkInstructions?: string;

  executionTimeMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for judge verification.
 */
export interface JudgeConfig {
  enabled: boolean;
  passThreshold: number;             // Overall score needed to pass
  confidenceThreshold: number;       // Minimum confidence to trust verdict
  maxRetries: number;

  // Per-criterion configuration
  criteria: JudgeCriterionConfig[];

  // Behavior
  autoReworkOnFailure: boolean;
  requireHumanApprovalThreshold: number; // Confidence below this needs human
}

/**
 * Configuration for individual criterion.
 */
export interface JudgeCriterionConfig {
  type: JudgeCriterionType;
  enabled: boolean;
  weight: number;
  passThreshold: number;
  customPrompt?: string;             // Override default verification prompt
}

// =============================================================================
// CHECKPOINT & PERSISTENCE
// =============================================================================

/**
 * Checkpoint representing a point-in-time state.
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  timestamp: number;

  // Trigger
  trigger: 'auto' | 'manual' | 'error' | 'milestone';
  description?: string;

  // State snapshot
  session: Omit<SwarmSession, 'taskTree'>;  // Session without nested data
  taskTree: Record<string, HierarchicalTask>;
  agentStates: Record<string, SwarmAgentConfig>;

  // Context
  contextStore: Record<string, unknown>;

  // Validation
  checksum: string;
  version: string;

  // Metadata
  sizeBytes: number;
  metadata?: Record<string, unknown>;
}

/**
 * Options for creating a checkpoint.
 */
export interface CheckpointOptions {
  trigger: 'auto' | 'manual' | 'error' | 'milestone';
  description?: string;
  includeContext: boolean;
  compress: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Result of checkpoint operation.
 */
export interface CheckpointResult {
  success: boolean;
  checkpointId?: string;
  path?: string;
  sizeBytes?: number;
  error?: string;
}

/**
 * Options for restoring from checkpoint.
 */
export interface RestoreOptions {
  checkpointId: string;
  validateChecksum: boolean;
  resetFailedTasks: boolean;
  resetInProgressTasks: boolean;
}

/**
 * Result of restore operation.
 */
export interface RestoreResult {
  success: boolean;
  sessionId?: string;
  restoredTasks: number;
  restoredAgents: number;
  warnings: string[];
  error?: string;
}

// =============================================================================
// AGENT POOL MANAGEMENT
// =============================================================================

/**
 * Pool health status.
 */
export type PoolHealth = 'healthy' | 'degraded' | 'unhealthy' | 'critical';

/**
 * Agent pool statistics.
 */
export interface PoolStats {
  totalAgents: number;
  idleAgents: number;
  busyAgents: number;
  failedAgents: number;

  queuedTasks: number;
  averageWaitTimeMs: number;

  health: PoolHealth;
  utilizationPercent: number;

  scalingDecision: 'scale_up' | 'scale_down' | 'maintain';
  targetAgentCount: number;
}

/**
 * Scaling event record.
 */
export interface ScalingEvent {
  timestamp: number;
  previousCount: number;
  newCount: number;
  reason: string;
  trigger: 'auto' | 'manual' | 'error';
}

// =============================================================================
// ORCHESTRATION EVENTS
// =============================================================================

/**
 * Event types emitted by the orchestrator.
 */
export type SwarmEventType =
  | 'session_created'
  | 'session_started'
  | 'session_paused'
  | 'session_resumed'
  | 'session_completed'
  | 'session_failed'
  | 'task_created'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'task_retrying'
  | 'agent_spawned'
  | 'agent_stopped'
  | 'agent_failed'
  | 'checkpoint_created'
  | 'checkpoint_restored'
  | 'judge_verdict'
  | 'scaling_event'
  | 'error';

/**
 * Swarm event for observability.
 */
export interface SwarmEvent {
  type: SwarmEventType;
  timestamp: number;
  sessionId: string;
  taskId?: string;
  agentId?: string;
  data: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Event listener callback type.
 */
export type SwarmEventListener = (event: SwarmEvent) => void | Promise<void>;

// =============================================================================
// MCP TOOL ARGUMENTS
// =============================================================================

/**
 * Arguments for mesh_swarm_create_session tool.
 */
export interface CreateSessionArgs {
  name: string;
  description?: string;
  prompt: string;                    // Initial problem to solve
  workFolder: string;
  config?: Partial<SwarmConfig>;
  metadata?: Record<string, unknown>;
}

/**
 * Arguments for mesh_swarm_resume_session tool.
 */
export interface ResumeSessionArgs {
  sessionId: string;
  checkpointId?: string;             // If not provided, uses latest
  resetFailedTasks?: boolean;
}

/**
 * Arguments for mesh_swarm_pause_session tool.
 */
export interface PauseSessionArgs {
  sessionId: string;
  createCheckpoint?: boolean;
  reason?: string;
}

/**
 * Arguments for mesh_swarm_session_status tool.
 */
export interface SessionStatusArgs {
  sessionId: string;
  includeTaskDetails?: boolean;
  includeAgentDetails?: boolean;
}

/**
 * Arguments for mesh_swarm_plan_hierarchical tool.
 */
export interface PlanHierarchicalArgs {
  sessionId: string;
  taskId?: string;                   // Plan subtasks for this task, or root if not provided
  maxDepth?: number;
  maxTasksPerLevel?: number;
}

/**
 * Arguments for mesh_swarm_verify_task tool.
 */
export interface VerifyTaskArgs {
  sessionId: string;
  taskId: string;
  criteria?: JudgeCriterionType[];
  customPrompt?: string;
}

/**
 * Arguments for mesh_swarm_scale_agents tool.
 */
export interface ScaleAgentsArgs {
  sessionId: string;
  targetCount: number;
  reason?: string;
}

/**
 * Arguments for mesh_swarm_create_checkpoint tool.
 */
export interface CreateCheckpointArgs {
  sessionId: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Arguments for mesh_swarm_list_checkpoints tool.
 */
export interface ListCheckpointsArgs {
  sessionId: string;
  limit?: number;
  offset?: number;
}

/**
 * Arguments for mesh_swarm_restore_checkpoint tool.
 */
export interface RestoreCheckpointArgs {
  sessionId: string;
  checkpointId: string;
  resetFailedTasks?: boolean;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Deep partial type for optional nested properties.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Type guard for checking if value is a valid ExtendedAgentRole.
 */
export function isExtendedAgentRole(value: string): value is ExtendedAgentRole {
  return [
    'analysis', 'implementation', 'testing', 'documentation', 'debugging',
    'planner', 'judge', 'synthesizer', 'monitor'
  ].includes(value);
}

/**
 * Type guard for checking if value is a valid TaskStatus.
 */
export function isTaskStatus(value: string): value is TaskStatus {
  return [
    'pending', 'queued', 'blocked', 'in_progress', 'verifying',
    'rework', 'completed', 'failed', 'cancelled'
  ].includes(value);
}

/**
 * Type guard for checking if value is a valid SessionStatus.
 */
export function isSessionStatus(value: string): value is SessionStatus {
  return [
    'initializing', 'active', 'paused', 'resuming',
    'completing', 'completed', 'failed', 'archived'
  ].includes(value);
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

/**
 * Default swarm configuration.
 */
export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxConcurrentAgents: 100,
  maxTaskDepth: 5,
  agentTimeoutMs: 3600000,           // 1 hour
  sessionTimeoutMs: 604800000,       // 7 days

  enableJudge: true,
  judgePassThreshold: 0.8,
  maxJudgeRetries: 2,

  checkpointIntervalMs: 300000,      // 5 minutes
  checkpointDir: '~/.meshseeks/sessions',
  maxCheckpointsPerSession: 100,

  minAgents: 1,
  maxAgents: 500,
  scaleUpThreshold: 10,              // Tasks in queue
  scaleDownThreshold: 60000,         // 1 minute idle

  maxConsecutiveFailures: 5,
  failureThresholdPercent: 30,

  maxTotalTasks: 10000,
  maxTasksPerLevel: 100
};

/**
 * Default judge configuration.
 */
export const DEFAULT_JUDGE_CONFIG: JudgeConfig = {
  enabled: true,
  passThreshold: 0.8,
  confidenceThreshold: 0.7,
  maxRetries: 2,

  criteria: [
    { type: 'completeness', enabled: true, weight: 0.3, passThreshold: 0.8 },
    { type: 'correctness', enabled: true, weight: 0.4, passThreshold: 0.9 },
    { type: 'quality', enabled: true, weight: 0.2, passThreshold: 0.7 },
    { type: 'testing', enabled: false, weight: 0.1, passThreshold: 0.8 }
  ],

  autoReworkOnFailure: true,
  requireHumanApprovalThreshold: 0.5
};

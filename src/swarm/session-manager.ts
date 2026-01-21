/**
 * Session Manager - Week-long swarm session lifecycle management
 *
 * Manages the complete lifecycle of swarm sessions including creation,
 * pause/resume, auto-checkpointing, and graceful shutdown. Supports
 * sessions lasting up to 7 days with automatic state preservation.
 *
 * @module session-manager
 * @see CheckpointStore for persistence operations
 * @see SwarmSession for session structure
 *
 * Sample usage:
 *   const manager = new SessionManager(checkpointStore);
 *   const session = await manager.createSession({ name: 'Feature Dev', prompt: '...' });
 *   await manager.pauseSession(session.id);
 *   await manager.resumeSession(session.id);
 */

import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { CheckpointStore } from '../persistence/checkpoint-store.js';
import type {
  SwarmSession,
  SwarmConfig,
  SessionStatus,
  SessionMetrics,
  SessionError,
  HierarchicalTask,
  SwarmAgentConfig,
  CheckpointOptions,
  TaskStatus,
  ExtendedAgentRole,
  SwarmEvent,
  SwarmEventType,
  SwarmEventListener,
  DEFAULT_SWARM_CONFIG
} from '../types/swarm-types.js';

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  name: string;
  description?: string;
  prompt: string;
  workFolder: string;
  config?: Partial<SwarmConfig>;
  metadata?: Record<string, unknown>;
}

/**
 * Options for pausing a session.
 */
export interface PauseSessionOptions {
  createCheckpoint?: boolean;
  reason?: string;
}

/**
 * Options for resuming a session.
 */
export interface ResumeSessionOptions {
  checkpointId?: string;
  resetFailedTasks?: boolean;
}

/**
 * Default swarm configuration.
 */
const DEFAULT_CONFIG: SwarmConfig = {
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
  scaleUpThreshold: 10,
  scaleDownThreshold: 60000,

  maxConsecutiveFailures: 5,
  failureThresholdPercent: 30,

  maxTotalTasks: 10000,
  maxTasksPerLevel: 100
};

/**
 * Session manager for week-long swarm operations.
 */
export class SessionManager extends EventEmitter {
  private checkpointStore: CheckpointStore;
  private activeSessions: Map<string, SwarmSession> = new Map();
  private agentStates: Map<string, Map<string, SwarmAgentConfig>> = new Map();
  private contextStores: Map<string, Map<string, unknown>> = new Map();
  private autoCheckpointTimers: Map<string, NodeJS.Timeout> = new Map();
  private sessionExpiryTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventListeners: Map<SwarmEventType, Set<SwarmEventListener>> = new Map();

  constructor(checkpointStore: CheckpointStore) {
    super();
    this.checkpointStore = checkpointStore;
  }

  // ===========================================================================
  // SESSION LIFECYCLE
  // ===========================================================================

  /**
   * Create a new swarm session.
   */
  async createSession(options: CreateSessionOptions): Promise<SwarmSession> {
    const sessionId = this.generateSessionId();
    const config = { ...DEFAULT_CONFIG, ...options.config };
    const now = Date.now();

    // Create root task for the session
    const rootTaskId = `task-${sessionId}-root`;
    const rootTask: HierarchicalTask = {
      id: rootTaskId,
      parentId: null,
      depth: 0,
      children: [],
      prompt: options.prompt,
      role: 'planner',
      workFolder: options.workFolder,
      returnMode: 'full',
      dependencies: [],
      status: 'pending',
      priority: 'high',
      retryCount: 0,
      maxRetries: config.maxJudgeRetries,
      createdAt: now,
      tags: ['root']
    };

    // Initialize session
    const session: SwarmSession = {
      id: sessionId,
      name: options.name,
      description: options.description,
      status: 'initializing',
      rootTaskId,
      taskTree: new Map([[rootTaskId, rootTask]]),
      lastCheckpointId: null,
      checkpointIds: [],
      autoCheckpointIntervalMs: config.checkpointIntervalMs,
      config,
      createdAt: now,
      expiresAt: now + config.sessionTimeoutMs,
      metrics: this.createInitialMetrics(),
      errors: [],
      metadata: options.metadata
    };

    // Initialize agent states and context for this session
    this.agentStates.set(sessionId, new Map());
    this.contextStores.set(sessionId, new Map());

    // Create session directory
    await this.checkpointStore.createSessionDirectory(sessionId);

    // Save initial state
    await this.checkpointStore.saveSession(session);
    await this.checkpointStore.saveTaskTree(sessionId, session.taskTree);

    // Store in active sessions
    this.activeSessions.set(sessionId, session);

    // Emit event
    this.emitEvent('session_created', sessionId, { session });

    return session;
  }

  /**
   * Start a session (transition from initializing to active).
   */
  async startSession(sessionId: string): Promise<SwarmSession> {
    const session = this.getActiveSession(sessionId);

    if (session.status !== 'initializing' && session.status !== 'resuming') {
      throw new Error(`Cannot start session in status: ${session.status}`);
    }

    session.status = 'active';
    session.startedAt = Date.now();

    // Start auto-checkpoint timer
    this.startAutoCheckpoint(sessionId);

    // Start session expiry timer
    this.startExpiryTimer(sessionId);

    // Save state
    await this.checkpointStore.saveSession(session);

    // Emit event
    this.emitEvent('session_started', sessionId, { session });

    return session;
  }

  /**
   * Pause a running session.
   */
  async pauseSession(sessionId: string, options: PauseSessionOptions = {}): Promise<SwarmSession> {
    const session = this.getActiveSession(sessionId);

    if (session.status !== 'active') {
      throw new Error(`Cannot pause session in status: ${session.status}`);
    }

    session.status = 'paused';
    session.pausedAt = Date.now();

    // Stop auto-checkpoint
    this.stopAutoCheckpoint(sessionId);

    // Create checkpoint if requested (default: true)
    if (options.createCheckpoint !== false) {
      await this.createCheckpoint(sessionId, {
        trigger: 'manual',
        description: options.reason || 'Session paused',
        includeContext: true,
        compress: true
      });
    }

    // Save state
    await this.checkpointStore.saveSession(session);

    // Log error if reason provided
    if (options.reason) {
      this.logSessionError(session, {
        code: 'SESSION_PAUSED',
        message: options.reason,
        severity: 'warning',
        recovered: false
      });
    }

    // Emit event
    this.emitEvent('session_paused', sessionId, { session, reason: options.reason });

    return session;
  }

  /**
   * Resume a paused session.
   */
  async resumeSession(sessionId: string, options: ResumeSessionOptions = {}): Promise<SwarmSession> {
    let session = this.activeSessions.get(sessionId);

    // If not in memory, load from storage
    if (!session) {
      session = await this.loadSession(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
    }

    if (session.status !== 'paused' && session.status !== 'failed') {
      throw new Error(`Cannot resume session in status: ${session.status}`);
    }

    // Restore from specific checkpoint if provided
    if (options.checkpointId) {
      const restoreResult = await this.checkpointStore.restoreCheckpoint({
        checkpointId: options.checkpointId,
        validateChecksum: true,
        resetFailedTasks: options.resetFailedTasks || false,
        resetInProgressTasks: true
      });

      if (!restoreResult.success) {
        throw new Error(`Failed to restore checkpoint: ${restoreResult.error}`);
      }

      // Reload session after restore
      const restored = await this.loadSession(sessionId);
      if (!restored) {
        throw new Error(`Failed to load restored session: ${sessionId}`);
      }
      session = restored;
    }

    session.status = 'resuming';
    session.resumedAt = Date.now();

    // Reset failed tasks if requested
    if (options.resetFailedTasks && !options.checkpointId) {
      this.resetFailedTasks(session);
    }

    // Reset in-progress tasks (they were interrupted)
    this.resetInProgressTasks(session);

    // Store in active sessions
    this.activeSessions.set(sessionId, session);

    // Reinitialize agent states and context if needed
    if (!this.agentStates.has(sessionId)) {
      this.agentStates.set(sessionId, new Map());
    }
    if (!this.contextStores.has(sessionId)) {
      this.contextStores.set(sessionId, new Map());
    }

    // Save state
    await this.checkpointStore.saveSession(session);
    await this.checkpointStore.saveTaskTree(sessionId, session.taskTree);

    // Emit event
    this.emitEvent('session_resumed', sessionId, { session });

    // Automatically start the session
    return this.startSession(sessionId);
  }

  /**
   * Complete a session (all tasks done).
   */
  async completeSession(sessionId: string): Promise<SwarmSession> {
    const session = this.getActiveSession(sessionId);

    session.status = 'completing';

    // Create final checkpoint
    await this.createCheckpoint(sessionId, {
      trigger: 'milestone',
      description: 'Session completing',
      includeContext: true,
      compress: true
    });

    session.status = 'completed';
    session.completedAt = Date.now();

    // Stop timers
    this.stopAutoCheckpoint(sessionId);
    this.stopExpiryTimer(sessionId);

    // Save final state
    await this.checkpointStore.saveSession(session);

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    // Emit event
    this.emitEvent('session_completed', sessionId, { session });

    return session;
  }

  /**
   * Fail a session (unrecoverable error).
   */
  async failSession(sessionId: string, error: string): Promise<SwarmSession> {
    const session = this.getActiveSession(sessionId);

    // Create error checkpoint before failing
    try {
      await this.createCheckpoint(sessionId, {
        trigger: 'error',
        description: `Session failed: ${error}`,
        includeContext: true,
        compress: true
      });
    } catch {
      // Ignore checkpoint errors during failure
    }

    session.status = 'failed';
    session.completedAt = Date.now();

    this.logSessionError(session, {
      code: 'SESSION_FAILED',
      message: error,
      severity: 'critical',
      recovered: false
    });

    // Stop timers
    this.stopAutoCheckpoint(sessionId);
    this.stopExpiryTimer(sessionId);

    // Save state
    await this.checkpointStore.saveSession(session);

    // Emit event
    this.emitEvent('session_failed', sessionId, { session, error });

    return session;
  }

  /**
   * Archive a completed/failed session.
   */
  async archiveSession(sessionId: string): Promise<void> {
    let session = this.activeSessions.get(sessionId);

    if (!session) {
      session = await this.loadSession(sessionId);
    }

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.status !== 'completed' && session.status !== 'failed') {
      throw new Error(`Cannot archive session in status: ${session.status}`);
    }

    session.status = 'archived';

    await this.checkpointStore.saveSession(session);

    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    this.agentStates.delete(sessionId);
    this.contextStores.delete(sessionId);
  }

  // ===========================================================================
  // CHECKPOINT MANAGEMENT
  // ===========================================================================

  /**
   * Create a checkpoint for a session.
   */
  async createCheckpoint(
    sessionId: string,
    options: CheckpointOptions
  ): Promise<string> {
    const session = this.getActiveSession(sessionId);
    const agentStates = this.agentStates.get(sessionId) || new Map();
    const contextStore = this.contextStores.get(sessionId) || new Map();

    const result = await this.checkpointStore.createCheckpoint(
      session,
      agentStates,
      contextStore,
      options
    );

    if (!result.success || !result.checkpointId) {
      throw new Error(`Failed to create checkpoint: ${result.error}`);
    }

    // Update session checkpoint tracking
    session.lastCheckpointId = result.checkpointId;
    session.checkpointIds.push(result.checkpointId);
    session.metrics.checkpointsTaken++;

    // Emit event
    this.emitEvent('checkpoint_created', sessionId, {
      checkpointId: result.checkpointId,
      trigger: options.trigger,
      sizeBytes: result.sizeBytes
    });

    return result.checkpointId;
  }

  /**
   * Start auto-checkpoint timer for a session.
   */
  private startAutoCheckpoint(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    // Clear existing timer
    this.stopAutoCheckpoint(sessionId);

    const intervalMs = session.autoCheckpointIntervalMs;

    const timer = setInterval(async () => {
      try {
        await this.createCheckpoint(sessionId, {
          trigger: 'auto',
          includeContext: true,
          compress: true
        });
      } catch (error) {
        console.error(`Auto-checkpoint failed for session ${sessionId}:`, error);
      }
    }, intervalMs);

    this.autoCheckpointTimers.set(sessionId, timer);
  }

  /**
   * Stop auto-checkpoint timer for a session.
   */
  private stopAutoCheckpoint(sessionId: string): void {
    const timer = this.autoCheckpointTimers.get(sessionId);
    if (timer) {
      clearInterval(timer);
      this.autoCheckpointTimers.delete(sessionId);
    }
  }

  /**
   * Start session expiry timer.
   */
  private startExpiryTimer(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.stopExpiryTimer(sessionId);

    const timeUntilExpiry = session.expiresAt - Date.now();

    if (timeUntilExpiry <= 0) {
      // Already expired
      this.failSession(sessionId, 'Session expired');
      return;
    }

    const timer = setTimeout(async () => {
      try {
        await this.failSession(sessionId, 'Session expired');
      } catch (error) {
        console.error(`Failed to expire session ${sessionId}:`, error);
      }
    }, timeUntilExpiry);

    this.sessionExpiryTimers.set(sessionId, timer);
  }

  /**
   * Stop session expiry timer.
   */
  private stopExpiryTimer(sessionId: string): void {
    const timer = this.sessionExpiryTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionExpiryTimers.delete(sessionId);
    }
  }

  // ===========================================================================
  // TASK MANAGEMENT
  // ===========================================================================

  /**
   * Add a task to a session.
   */
  addTask(sessionId: string, task: HierarchicalTask): void {
    const session = this.getActiveSession(sessionId);
    const taskTree = session.taskTree instanceof Map
      ? session.taskTree
      : new Map(Object.entries(session.taskTree));

    taskTree.set(task.id, task);
    session.taskTree = taskTree;

    // Update parent's children
    if (task.parentId) {
      const parent = taskTree.get(task.parentId);
      if (parent && !parent.children.includes(task.id)) {
        parent.children.push(task.id);
      }
    }

    // Update metrics
    session.metrics.totalTasks++;
    session.metrics.pendingTasks++;
    const depthKey = task.depth;
    session.metrics.tasksPerDepth[depthKey] = (session.metrics.tasksPerDepth[depthKey] || 0) + 1;
  }

  /**
   * Update task status.
   */
  updateTaskStatus(
    sessionId: string,
    taskId: string,
    status: TaskStatus,
    result?: unknown
  ): void {
    const session = this.getActiveSession(sessionId);
    const taskTree = session.taskTree instanceof Map
      ? session.taskTree
      : new Map(Object.entries(session.taskTree));

    const task = taskTree.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const previousStatus = task.status;
    task.status = status;

    // Update timing
    if (status === 'in_progress' && !task.startedAt) {
      task.startedAt = Date.now();
    } else if (status === 'completed' || status === 'failed') {
      task.completedAt = Date.now();
      if (task.startedAt) {
        task.actualDurationMs = task.completedAt - task.startedAt;
      }
    }

    // Update metrics
    this.updateMetricsForStatusChange(session.metrics, previousStatus, status);

    // Store result if provided
    if (result !== undefined) {
      task.result = result as HierarchicalTask['result'];
    }

    // Emit event
    const eventType: SwarmEventType = status === 'completed'
      ? 'task_completed'
      : status === 'failed'
        ? 'task_failed'
        : 'task_started';

    this.emitEvent(eventType, sessionId, { taskId, status, previousStatus });
  }

  /**
   * Reset all failed tasks to pending.
   */
  private resetFailedTasks(session: SwarmSession): void {
    const taskTree = session.taskTree instanceof Map
      ? session.taskTree
      : new Map(Object.entries(session.taskTree));

    for (const [, task] of taskTree) {
      if (task.status === 'failed') {
        task.status = 'pending';
        task.retryCount = 0;
        task.result = undefined;
        task.assignedAgentId = undefined;
        task.startedAt = undefined;
        task.completedAt = undefined;
      }
    }
  }

  /**
   * Reset in-progress tasks to pending.
   */
  private resetInProgressTasks(session: SwarmSession): void {
    const taskTree = session.taskTree instanceof Map
      ? session.taskTree
      : new Map(Object.entries(session.taskTree));

    for (const [, task] of taskTree) {
      if (task.status === 'in_progress') {
        task.status = 'pending';
        task.assignedAgentId = undefined;
        task.startedAt = undefined;
      }
    }
  }

  // ===========================================================================
  // AGENT STATE MANAGEMENT
  // ===========================================================================

  /**
   * Register an agent with a session.
   */
  registerAgent(sessionId: string, agent: SwarmAgentConfig): void {
    const agents = this.agentStates.get(sessionId);
    if (!agents) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    agents.set(agent.id, agent);

    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.metrics.totalAgentsSpawned++;
      session.metrics.currentActiveAgents++;
      if (session.metrics.currentActiveAgents > session.metrics.peakActiveAgents) {
        session.metrics.peakActiveAgents = session.metrics.currentActiveAgents;
      }
    }

    this.emitEvent('agent_spawned', sessionId, { agentId: agent.id, role: agent.role });
  }

  /**
   * Update agent state.
   */
  updateAgentState(sessionId: string, agentId: string, updates: Partial<SwarmAgentConfig>): void {
    const agents = this.agentStates.get(sessionId);
    if (!agents) return;

    const agent = agents.get(agentId);
    if (agent) {
      Object.assign(agent, updates, { lastActivityAt: Date.now() });
    }
  }

  /**
   * Remove an agent from a session.
   */
  removeAgent(sessionId: string, agentId: string): void {
    const agents = this.agentStates.get(sessionId);
    if (agents) {
      agents.delete(agentId);
    }

    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.metrics.currentActiveAgents = Math.max(0, session.metrics.currentActiveAgents - 1);
    }

    this.emitEvent('agent_stopped', sessionId, { agentId });
  }

  /**
   * Get all agents for a session.
   */
  getAgents(sessionId: string): Map<string, SwarmAgentConfig> {
    return this.agentStates.get(sessionId) || new Map();
  }

  // ===========================================================================
  // CONTEXT STORE MANAGEMENT
  // ===========================================================================

  /**
   * Store context data for a session.
   */
  setContext(sessionId: string, key: string, value: unknown): void {
    const context = this.contextStores.get(sessionId);
    if (context) {
      context.set(key, value);
    }
  }

  /**
   * Get context data from a session.
   */
  getContext<T = unknown>(sessionId: string, key: string): T | undefined {
    const context = this.contextStores.get(sessionId);
    return context?.get(key) as T | undefined;
  }

  /**
   * Get all context for a session.
   */
  getAllContext(sessionId: string): Map<string, unknown> {
    return this.contextStores.get(sessionId) || new Map();
  }

  // ===========================================================================
  // SESSION QUERIES
  // ===========================================================================

  /**
   * Get an active session (throws if not found).
   */
  getActiveSession(sessionId: string): SwarmSession {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Active session not found: ${sessionId}`);
    }
    return session;
  }

  /**
   * Get session (active or from storage).
   */
  async getSession(sessionId: string): Promise<SwarmSession | undefined> {
    const active = this.activeSessions.get(sessionId);
    if (active) return active;

    return this.loadSession(sessionId);
  }

  /**
   * Load session from storage.
   */
  private async loadSession(sessionId: string): Promise<SwarmSession | undefined> {
    const sessionData = await this.checkpointStore.loadSession(sessionId);
    if (!sessionData) return undefined;

    const taskTree = await this.checkpointStore.loadTaskTree(sessionId);

    return {
      ...sessionData,
      taskTree: taskTree || {}
    } as SwarmSession;
  }

  /**
   * List all active sessions.
   */
  getActiveSessions(): SwarmSession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * List all session IDs (including persisted).
   */
  async listAllSessions(): Promise<string[]> {
    return this.checkpointStore.listSessions();
  }

  /**
   * Get session status summary.
   */
  getSessionStatus(sessionId: string): {
    status: SessionStatus;
    metrics: SessionMetrics;
    progress: number;
  } {
    const session = this.getActiveSession(sessionId);

    const progress = session.metrics.totalTasks > 0
      ? (session.metrics.completedTasks / session.metrics.totalTasks) * 100
      : 0;

    return {
      status: session.status,
      metrics: session.metrics,
      progress
    };
  }

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  /**
   * Subscribe to swarm events.
   */
  onEvent(eventType: SwarmEventType, listener: SwarmEventListener): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Emit a swarm event.
   */
  private emitEvent(
    type: SwarmEventType,
    sessionId: string,
    data: unknown,
    taskId?: string,
    agentId?: string
  ): void {
    const event: SwarmEvent = {
      type,
      timestamp: Date.now(),
      sessionId,
      taskId,
      agentId,
      data
    };

    // Emit to specific listeners
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          const result = listener(event);
          if (result instanceof Promise) {
            result.catch(err => console.error(`Event listener error:`, err));
          }
        } catch (err) {
          console.error(`Event listener error:`, err);
        }
      }
    }

    // Also emit via EventEmitter
    this.emit(type, event);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Generate a unique session ID.
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `sess-${timestamp}-${random}`;
  }

  /**
   * Create initial metrics object.
   */
  private createInitialMetrics(): SessionMetrics {
    return {
      totalTasks: 1,             // Root task
      completedTasks: 0,
      failedTasks: 0,
      pendingTasks: 1,
      inProgressTasks: 0,
      totalAgentsSpawned: 0,
      currentActiveAgents: 0,
      peakActiveAgents: 0,
      totalExecutionTimeMs: 0,
      averageTaskDurationMs: 0,
      checkpointsTaken: 0,
      checkpointsRestored: 0,
      judgeVerifications: 0,
      judgeApprovals: 0,
      judgeRejections: 0,
      tasksPerDepth: { 0: 1 },
      tasksByStatus: { pending: 1 } as Record<TaskStatus, number>,
      tasksByRole: { planner: 1 } as Record<ExtendedAgentRole, number>
    };
  }

  /**
   * Update metrics when task status changes.
   */
  private updateMetricsForStatusChange(
    metrics: SessionMetrics,
    previousStatus: TaskStatus,
    newStatus: TaskStatus
  ): void {
    // Decrement previous status count
    switch (previousStatus) {
      case 'pending':
      case 'queued':
      case 'blocked':
        metrics.pendingTasks = Math.max(0, metrics.pendingTasks - 1);
        break;
      case 'in_progress':
      case 'verifying':
        metrics.inProgressTasks = Math.max(0, metrics.inProgressTasks - 1);
        break;
    }

    // Increment new status count
    switch (newStatus) {
      case 'pending':
      case 'queued':
      case 'blocked':
      case 'rework':
        metrics.pendingTasks++;
        break;
      case 'in_progress':
      case 'verifying':
        metrics.inProgressTasks++;
        break;
      case 'completed':
        metrics.completedTasks++;
        break;
      case 'failed':
      case 'cancelled':
        metrics.failedTasks++;
        break;
    }

    // Update status breakdown
    if (metrics.tasksByStatus[previousStatus]) {
      metrics.tasksByStatus[previousStatus]--;
    }
    metrics.tasksByStatus[newStatus] = (metrics.tasksByStatus[newStatus] || 0) + 1;
  }

  /**
   * Log an error to the session.
   */
  private logSessionError(
    session: SwarmSession,
    error: Omit<SessionError, 'timestamp'>
  ): void {
    session.errors.push({
      ...error,
      timestamp: Date.now()
    });
  }

  /**
   * Shutdown all active sessions gracefully.
   */
  async shutdown(): Promise<void> {
    const sessionIds = Array.from(this.activeSessions.keys());

    for (const sessionId of sessionIds) {
      try {
        await this.pauseSession(sessionId, {
          createCheckpoint: true,
          reason: 'System shutdown'
        });
      } catch (error) {
        console.error(`Failed to pause session ${sessionId} during shutdown:`, error);
      }
    }

    // Clear all timers
    for (const timer of this.autoCheckpointTimers.values()) {
      clearInterval(timer);
    }
    for (const timer of this.sessionExpiryTimers.values()) {
      clearTimeout(timer);
    }

    this.autoCheckpointTimers.clear();
    this.sessionExpiryTimers.clear();
    this.activeSessions.clear();
    this.agentStates.clear();
    this.contextStores.clear();
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  (async () => {
    const tmpDir = `/tmp/meshseeks-session-test-${Date.now()}`;
    const checkpointStore = new CheckpointStore(tmpDir);
    await checkpointStore.initialize();

    const manager = new SessionManager(checkpointStore);

    const allValidationFailures: string[] = [];
    let totalTests = 0;

    console.log('Testing SessionManager...\n');

    let testSessionId: string | undefined;

    // Test 1: Create session
    totalTests++;
    try {
      const session = await manager.createSession({
        name: 'Test Session',
        prompt: 'Build a test feature',
        workFolder: '/tmp/test'
      });
      testSessionId = session.id;
      if (!session.id || session.status !== 'initializing') {
        allValidationFailures.push(`CreateSession: Invalid session state (status: ${session.status})`);
      } else {
        console.log('  ✓ Create session');
      }
    } catch (error) {
      allValidationFailures.push(`CreateSession: ${error}`);
    }

    // Test 2: Start session
    totalTests++;
    if (testSessionId) {
      try {
        const session = await manager.startSession(testSessionId);
        if (session.status !== 'active') {
          allValidationFailures.push(`StartSession: Expected status 'active', got '${session.status}'`);
        } else {
          console.log('  ✓ Start session');
        }
      } catch (error) {
        allValidationFailures.push(`StartSession: ${error}`);
      }
    }

    // Test 3: Add task
    totalTests++;
    if (testSessionId) {
      try {
        manager.addTask(testSessionId, {
          id: 'task-test-1',
          parentId: `task-${testSessionId}-root`,
          depth: 1,
          children: [],
          prompt: 'Test task',
          role: 'implementation',
          workFolder: '/tmp/test',
          returnMode: 'summary',
          dependencies: [],
          status: 'pending',
          priority: 'medium',
          retryCount: 0,
          maxRetries: 3,
          createdAt: Date.now(),
          tags: []
        });
        const session = manager.getActiveSession(testSessionId);
        if (session.metrics.totalTasks !== 2) {
          allValidationFailures.push(`AddTask: Expected 2 total tasks, got ${session.metrics.totalTasks}`);
        } else {
          console.log('  ✓ Add task');
        }
      } catch (error) {
        allValidationFailures.push(`AddTask: ${error}`);
      }
    }

    // Test 4: Update task status
    totalTests++;
    if (testSessionId) {
      try {
        manager.updateTaskStatus(testSessionId, 'task-test-1', 'in_progress');
        const session = manager.getActiveSession(testSessionId);
        if (session.metrics.inProgressTasks !== 1) {
          allValidationFailures.push(`UpdateTaskStatus: Expected 1 in-progress task, got ${session.metrics.inProgressTasks}`);
        } else {
          console.log('  ✓ Update task status');
        }
      } catch (error) {
        allValidationFailures.push(`UpdateTaskStatus: ${error}`);
      }
    }

    // Test 5: Register agent
    totalTests++;
    if (testSessionId) {
      try {
        manager.registerAgent(testSessionId, {
          id: 'agent-test-1',
          role: 'implementation',
          workFolder: '/tmp/test',
          priority: 'medium',
          maxRetries: 3,
          timeoutMs: 3600000,
          createdAt: Date.now(),
          state: 'running',
          completedTasks: 0,
          failedTasks: 0,
          totalExecutionTimeMs: 0,
          lastActivityAt: Date.now()
        });
        const agents = manager.getAgents(testSessionId);
        if (agents.size !== 1) {
          allValidationFailures.push(`RegisterAgent: Expected 1 agent, got ${agents.size}`);
        } else {
          console.log('  ✓ Register agent');
        }
      } catch (error) {
        allValidationFailures.push(`RegisterAgent: ${error}`);
      }
    }

    // Test 6: Create checkpoint
    totalTests++;
    if (testSessionId) {
      try {
        const checkpointId = await manager.createCheckpoint(testSessionId, {
          trigger: 'manual',
          description: 'Test checkpoint',
          includeContext: true,
          compress: false
        });
        if (!checkpointId) {
          allValidationFailures.push('CreateCheckpoint: No checkpoint ID returned');
        } else {
          console.log('  ✓ Create checkpoint');
        }
      } catch (error) {
        allValidationFailures.push(`CreateCheckpoint: ${error}`);
      }
    }

    // Test 7: Pause session
    totalTests++;
    if (testSessionId) {
      try {
        const session = await manager.pauseSession(testSessionId, { reason: 'Test pause' });
        if (session.status !== 'paused') {
          allValidationFailures.push(`PauseSession: Expected status 'paused', got '${session.status}'`);
        } else {
          console.log('  ✓ Pause session');
        }
      } catch (error) {
        allValidationFailures.push(`PauseSession: ${error}`);
      }
    }

    // Test 8: Resume session
    totalTests++;
    if (testSessionId) {
      try {
        const session = await manager.resumeSession(testSessionId);
        if (session.status !== 'active') {
          allValidationFailures.push(`ResumeSession: Expected status 'active', got '${session.status}'`);
        } else {
          console.log('  ✓ Resume session');
        }
      } catch (error) {
        allValidationFailures.push(`ResumeSession: ${error}`);
      }
    }

    // Test 9: Get session status
    totalTests++;
    if (testSessionId) {
      try {
        const status = manager.getSessionStatus(testSessionId);
        if (status.status !== 'active') {
          allValidationFailures.push(`GetSessionStatus: Expected 'active', got '${status.status}'`);
        } else {
          console.log('  ✓ Get session status');
        }
      } catch (error) {
        allValidationFailures.push(`GetSessionStatus: ${error}`);
      }
    }

    // Test 10: Complete session
    totalTests++;
    if (testSessionId) {
      try {
        const session = await manager.completeSession(testSessionId);
        if (session.status !== 'completed') {
          allValidationFailures.push(`CompleteSession: Expected status 'completed', got '${session.status}'`);
        } else {
          console.log('  ✓ Complete session');
        }
      } catch (error) {
        allValidationFailures.push(`CompleteSession: ${error}`);
      }
    }

    // Cleanup
    await manager.shutdown();

    // Report results
    console.log('\n' + '─'.repeat(50));
    if (allValidationFailures.length > 0) {
      console.log(`❌ VALIDATION FAILED - ${allValidationFailures.length} of ${totalTests} tests failed:`);
      for (const failure of allValidationFailures) {
        console.log(`  - ${failure}`);
      }
      process.exit(1);
    } else {
      console.log(`✅ VALIDATION PASSED - All ${totalTests} tests produced expected results`);
      process.exit(0);
    }
  })();
}

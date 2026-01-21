/**
 * Checkpoint Store - High-level state persistence and recovery
 *
 * Manages checkpoint creation, storage, and restoration for swarm sessions.
 * Supports automatic checkpointing, manual checkpoints, and crash recovery.
 *
 * @module checkpoint-store
 * @see FileBackend for low-level file operations
 * @see SwarmSession for session state structure
 *
 * Sample usage:
 *   const store = new CheckpointStore('~/.meshseeks/sessions');
 *   await store.initialize();
 *   const checkpointId = await store.createCheckpoint(session, { trigger: 'auto' });
 *   const restored = await store.restoreCheckpoint(sessionId, checkpointId);
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { FileBackend } from './file-backend.js';
import type {
  Checkpoint,
  CheckpointOptions,
  CheckpointResult,
  RestoreOptions,
  RestoreResult,
  SwarmSession,
  HierarchicalTask,
  SwarmAgentConfig,
  SessionMetrics,
  DEFAULT_SWARM_CONFIG
} from '../types/swarm-types.js';

/**
 * Version for checkpoint format compatibility.
 */
const CHECKPOINT_VERSION = '1.0.0';

/**
 * Directory structure within a session folder.
 */
const SESSION_DIRS = {
  checkpoints: 'checkpoints',
  results: 'results',
  logs: 'logs'
};

/**
 * Session metadata file name.
 */
const SESSION_FILE = 'session.json';

/**
 * Task tree file name.
 */
const TASK_TREE_FILE = 'task-tree.json';

/**
 * High-level checkpoint store for session persistence.
 */
export class CheckpointStore {
  private backend: FileBackend;
  private initialized: boolean = false;
  private maxCheckpointsPerSession: number;

  constructor(
    baseDir: string = '~/.meshseeks/sessions',
    maxCheckpointsPerSession: number = 100
  ) {
    this.backend = new FileBackend(baseDir);
    this.maxCheckpointsPerSession = maxCheckpointsPerSession;
  }

  /**
   * Initialize the checkpoint store.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.backend.initialize();
    this.initialized = true;
  }

  /**
   * Ensure initialized before operations.
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('CheckpointStore not initialized. Call initialize() first.');
    }
  }

  // ===========================================================================
  // SESSION MANAGEMENT
  // ===========================================================================

  /**
   * Create a new session directory structure.
   */
  async createSessionDirectory(sessionId: string): Promise<void> {
    this.ensureInitialized();

    const sessionPath = sessionId;
    await this.backend.createDirectory(sessionPath);
    await this.backend.createDirectory(path.join(sessionPath, SESSION_DIRS.checkpoints));
    await this.backend.createDirectory(path.join(sessionPath, SESSION_DIRS.results));
    await this.backend.createDirectory(path.join(sessionPath, SESSION_DIRS.logs));
  }

  /**
   * Save session metadata (without full task tree).
   */
  async saveSession(session: SwarmSession): Promise<CheckpointResult> {
    this.ensureInitialized();

    const sessionPath = path.join(session.id, SESSION_FILE);

    // Strip taskTree from session (saved separately)
    const sessionData: Omit<SwarmSession, 'taskTree'> & { taskTree?: never } = {
      ...session,
      taskTree: undefined
    };
    delete sessionData.taskTree;

    const result = await this.backend.writeJSON(sessionPath, sessionData);

    return {
      success: result.success,
      path: result.path,
      sizeBytes: result.sizeBytes,
      error: result.error
    };
  }

  /**
   * Load session metadata.
   */
  async loadSession(sessionId: string): Promise<Omit<SwarmSession, 'taskTree'> | null> {
    this.ensureInitialized();

    const sessionPath = path.join(sessionId, SESSION_FILE);
    return this.backend.readJSON(sessionPath);
  }

  /**
   * Save task tree separately (can be large).
   */
  async saveTaskTree(
    sessionId: string,
    taskTree: Map<string, HierarchicalTask> | Record<string, HierarchicalTask>
  ): Promise<CheckpointResult> {
    this.ensureInitialized();

    const taskTreePath = path.join(sessionId, TASK_TREE_FILE);

    // Convert Map to Record if needed
    const taskTreeData: Record<string, HierarchicalTask> =
      taskTree instanceof Map
        ? Object.fromEntries(taskTree)
        : taskTree;

    const result = await this.backend.writeJSON(taskTreePath, taskTreeData);

    return {
      success: result.success,
      path: result.path,
      sizeBytes: result.sizeBytes,
      error: result.error
    };
  }

  /**
   * Load task tree.
   */
  async loadTaskTree(sessionId: string): Promise<Record<string, HierarchicalTask> | null> {
    this.ensureInitialized();

    const taskTreePath = path.join(sessionId, TASK_TREE_FILE);
    return this.backend.readJSON(taskTreePath);
  }

  /**
   * List all sessions.
   */
  async listSessions(): Promise<string[]> {
    this.ensureInitialized();

    const files = await this.backend.listFiles('', { recursive: false });
    const sessions: string[] = [];

    for (const file of files) {
      if (file.isDirectory) {
        // Check if it has a session.json file
        const hasSession = await this.backend.exists(path.join(file.name, SESSION_FILE));
        if (hasSession) {
          sessions.push(file.name);
        }
      }
    }

    return sessions;
  }

  /**
   * Delete a session and all its data.
   */
  async deleteSession(sessionId: string): Promise<CheckpointResult> {
    this.ensureInitialized();

    const result = await this.backend.deleteDirectory(sessionId);

    return {
      success: result.success,
      error: result.error
    };
  }

  // ===========================================================================
  // CHECKPOINT OPERATIONS
  // ===========================================================================

  /**
   * Create a checkpoint of the current session state.
   */
  async createCheckpoint(
    session: SwarmSession,
    agentStates: Map<string, SwarmAgentConfig> | Record<string, SwarmAgentConfig>,
    contextStore: Map<string, unknown> | Record<string, unknown>,
    options: CheckpointOptions
  ): Promise<CheckpointResult> {
    this.ensureInitialized();

    const checkpointId = this.generateCheckpointId();
    const timestamp = Date.now();

    // Convert Maps to Records for serialization
    const taskTreeData: Record<string, HierarchicalTask> =
      session.taskTree instanceof Map
        ? Object.fromEntries(session.taskTree)
        : session.taskTree;

    const agentStatesData: Record<string, SwarmAgentConfig> =
      agentStates instanceof Map
        ? Object.fromEntries(agentStates)
        : agentStates;

    const contextStoreData: Record<string, unknown> =
      contextStore instanceof Map
        ? Object.fromEntries(contextStore)
        : contextStore;

    // Create checkpoint object
    const checkpoint: Checkpoint = {
      id: checkpointId,
      sessionId: session.id,
      timestamp,

      trigger: options.trigger,
      description: options.description,

      session: {
        id: session.id,
        name: session.name,
        description: session.description,
        status: session.status,
        rootTaskId: session.rootTaskId,
        lastCheckpointId: checkpointId,
        checkpointIds: [...session.checkpointIds, checkpointId],
        autoCheckpointIntervalMs: session.autoCheckpointIntervalMs,
        config: session.config,
        createdAt: session.createdAt,
        startedAt: session.startedAt,
        pausedAt: session.pausedAt,
        resumedAt: session.resumedAt,
        completedAt: session.completedAt,
        expiresAt: session.expiresAt,
        metrics: session.metrics,
        errors: session.errors,
        metadata: session.metadata
      },
      taskTree: taskTreeData,
      agentStates: agentStatesData,
      contextStore: options.includeContext ? contextStoreData : {},

      checksum: '', // Will be calculated
      version: CHECKPOINT_VERSION,
      sizeBytes: 0, // Will be calculated

      metadata: options.metadata
    };

    // Calculate checksum (before adding it to the object)
    const checksumData = {
      sessionId: checkpoint.sessionId,
      timestamp: checkpoint.timestamp,
      taskTree: checkpoint.taskTree,
      agentStates: checkpoint.agentStates
    };
    checkpoint.checksum = this.backend.calculateDataChecksum(checksumData);

    // Determine file path
    const checkpointPath = path.join(
      session.id,
      SESSION_DIRS.checkpoints,
      `${checkpointId}.json${options.compress ? '.gz' : ''}`
    );

    // Write checkpoint
    const result = options.compress
      ? await this.backend.writeCompressedJSON(checkpointPath, checkpoint)
      : await this.backend.writeJSON(checkpointPath, checkpoint);

    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }

    // Update checkpoint size
    checkpoint.sizeBytes = result.sizeBytes || 0;

    // Cleanup old checkpoints if needed
    await this.cleanupOldCheckpoints(session.id);

    return {
      success: true,
      checkpointId,
      path: result.path,
      sizeBytes: result.sizeBytes
    };
  }

  /**
   * List checkpoints for a session.
   */
  async listCheckpoints(
    sessionId: string,
    limit?: number,
    offset?: number
  ): Promise<{ checkpoints: Checkpoint[]; total: number }> {
    this.ensureInitialized();

    const checkpointsDir = path.join(sessionId, SESSION_DIRS.checkpoints);
    const files = await this.backend.listFiles(checkpointsDir, {
      pattern: /\.json(\.gz)?$/,
      sortBy: 'modified',
      sortOrder: 'desc'
    });

    const total = files.length;
    const paginatedFiles = files.slice(offset || 0, (offset || 0) + (limit || files.length));

    const checkpoints: Checkpoint[] = [];

    for (const file of paginatedFiles) {
      const filePath = path.join(checkpointsDir, file.name);
      const checkpoint = file.name.endsWith('.gz')
        ? await this.backend.readCompressedJSON<Checkpoint>(filePath)
        : await this.backend.readJSON<Checkpoint>(filePath);

      if (checkpoint) {
        checkpoints.push(checkpoint);
      }
    }

    return { checkpoints, total };
  }

  /**
   * Get a specific checkpoint.
   */
  async getCheckpoint(sessionId: string, checkpointId: string): Promise<Checkpoint | null> {
    this.ensureInitialized();

    const checkpointsDir = path.join(sessionId, SESSION_DIRS.checkpoints);

    // Try uncompressed first
    const uncompressedPath = path.join(checkpointsDir, `${checkpointId}.json`);
    if (await this.backend.exists(uncompressedPath)) {
      return this.backend.readJSON<Checkpoint>(uncompressedPath);
    }

    // Try compressed
    const compressedPath = path.join(checkpointsDir, `${checkpointId}.json.gz`);
    if (await this.backend.exists(compressedPath)) {
      return this.backend.readCompressedJSON<Checkpoint>(compressedPath);
    }

    return null;
  }

  /**
   * Get the latest checkpoint for a session.
   */
  async getLatestCheckpoint(sessionId: string): Promise<Checkpoint | null> {
    this.ensureInitialized();

    const { checkpoints } = await this.listCheckpoints(sessionId, 1, 0);
    return checkpoints[0] || null;
  }

  /**
   * Restore session state from a checkpoint.
   */
  async restoreCheckpoint(options: RestoreOptions): Promise<RestoreResult> {
    this.ensureInitialized();

    const checkpoint = await this.getCheckpoint(options.checkpointId.split('/')[0] || '', options.checkpointId);

    if (!checkpoint) {
      // Try parsing sessionId from checkpointId or search for it
      const { checkpoints } = await this.listCheckpoints(options.checkpointId, 1, 0);
      if (checkpoints.length === 0) {
        return {
          success: false,
          restoredTasks: 0,
          restoredAgents: 0,
          warnings: [],
          error: `Checkpoint not found: ${options.checkpointId}`
        };
      }
    }

    const actualCheckpoint = checkpoint || await this.findCheckpointById(options.checkpointId);

    if (!actualCheckpoint) {
      return {
        success: false,
        restoredTasks: 0,
        restoredAgents: 0,
        warnings: [],
        error: `Checkpoint not found: ${options.checkpointId}`
      };
    }

    const warnings: string[] = [];

    // Validate checksum if requested
    if (options.validateChecksum) {
      const checksumData = {
        sessionId: actualCheckpoint.sessionId,
        timestamp: actualCheckpoint.timestamp,
        taskTree: actualCheckpoint.taskTree,
        agentStates: actualCheckpoint.agentStates
      };
      const calculatedChecksum = this.backend.calculateDataChecksum(checksumData);

      if (calculatedChecksum !== actualCheckpoint.checksum) {
        return {
          success: false,
          restoredTasks: 0,
          restoredAgents: 0,
          warnings: [],
          error: 'Checkpoint checksum validation failed - data may be corrupted'
        };
      }
    }

    // Process task tree based on options
    const taskTree = { ...actualCheckpoint.taskTree };
    let restoredTasks = Object.keys(taskTree).length;

    if (options.resetFailedTasks) {
      for (const taskId of Object.keys(taskTree)) {
        if (taskTree[taskId].status === 'failed') {
          taskTree[taskId] = {
            ...taskTree[taskId],
            status: 'pending',
            retryCount: 0,
            result: undefined,
            assignedAgentId: undefined,
            startedAt: undefined,
            completedAt: undefined
          };
          warnings.push(`Reset failed task: ${taskId}`);
        }
      }
    }

    if (options.resetInProgressTasks) {
      for (const taskId of Object.keys(taskTree)) {
        if (taskTree[taskId].status === 'in_progress') {
          taskTree[taskId] = {
            ...taskTree[taskId],
            status: 'pending',
            assignedAgentId: undefined,
            startedAt: undefined
          };
          warnings.push(`Reset in-progress task: ${taskId}`);
        }
      }
    }

    // Save restored state
    const session: SwarmSession = {
      ...actualCheckpoint.session,
      taskTree,
      lastCheckpointId: actualCheckpoint.id
    };

    await this.saveSession(session);
    await this.saveTaskTree(session.id, taskTree);

    return {
      success: true,
      sessionId: session.id,
      restoredTasks,
      restoredAgents: Object.keys(actualCheckpoint.agentStates).length,
      warnings
    };
  }

  /**
   * Find checkpoint by ID across all sessions.
   */
  private async findCheckpointById(checkpointId: string): Promise<Checkpoint | null> {
    const sessions = await this.listSessions();

    for (const sessionId of sessions) {
      const checkpoint = await this.getCheckpoint(sessionId, checkpointId);
      if (checkpoint) {
        return checkpoint;
      }
    }

    return null;
  }

  /**
   * Delete a checkpoint.
   */
  async deleteCheckpoint(sessionId: string, checkpointId: string): Promise<CheckpointResult> {
    this.ensureInitialized();

    const checkpointsDir = path.join(sessionId, SESSION_DIRS.checkpoints);

    // Try both compressed and uncompressed
    const uncompressedPath = path.join(checkpointsDir, `${checkpointId}.json`);
    const compressedPath = path.join(checkpointsDir, `${checkpointId}.json.gz`);

    let result = await this.backend.deleteFile(uncompressedPath);
    if (!result.success) {
      result = await this.backend.deleteFile(compressedPath);
    }

    return {
      success: result.success,
      error: result.error
    };
  }

  /**
   * Cleanup old checkpoints exceeding the limit.
   */
  private async cleanupOldCheckpoints(sessionId: string): Promise<void> {
    const { checkpoints, total } = await this.listCheckpoints(sessionId);

    if (total <= this.maxCheckpointsPerSession) {
      return;
    }

    // Delete oldest checkpoints (list is sorted by modified desc)
    const toDelete = checkpoints.slice(this.maxCheckpointsPerSession);

    for (const checkpoint of toDelete) {
      await this.deleteCheckpoint(sessionId, checkpoint.id);
    }
  }

  // ===========================================================================
  // TASK RESULTS
  // ===========================================================================

  /**
   * Save a task result.
   */
  async saveTaskResult(
    sessionId: string,
    taskId: string,
    result: unknown
  ): Promise<CheckpointResult> {
    this.ensureInitialized();

    const resultPath = path.join(sessionId, SESSION_DIRS.results, `${taskId}.json`);
    const writeResult = await this.backend.writeJSON(resultPath, result);

    return {
      success: writeResult.success,
      path: writeResult.path,
      sizeBytes: writeResult.sizeBytes,
      error: writeResult.error
    };
  }

  /**
   * Load a task result.
   */
  async loadTaskResult<T = unknown>(sessionId: string, taskId: string): Promise<T | null> {
    this.ensureInitialized();

    const resultPath = path.join(sessionId, SESSION_DIRS.results, `${taskId}.json`);
    return this.backend.readJSON<T>(resultPath);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  /**
   * Generate a unique checkpoint ID.
   */
  private generateCheckpointId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `cp-${timestamp}-${random}`;
  }

  /**
   * Get storage statistics for a session.
   */
  async getSessionStorageStats(sessionId: string): Promise<{
    totalSizeBytes: number;
    checkpointCount: number;
    resultCount: number;
  }> {
    this.ensureInitialized();

    const totalSizeBytes = await this.backend.getDirectorySize(sessionId);

    const checkpointsDir = path.join(sessionId, SESSION_DIRS.checkpoints);
    const checkpointFiles = await this.backend.listFiles(checkpointsDir, {
      pattern: /\.json(\.gz)?$/
    });

    const resultsDir = path.join(sessionId, SESSION_DIRS.results);
    const resultFiles = await this.backend.listFiles(resultsDir, {
      pattern: /\.json$/
    });

    return {
      totalSizeBytes,
      checkpointCount: checkpointFiles.length,
      resultCount: resultFiles.length
    };
  }

  /**
   * Get the base directory path.
   */
  getBaseDir(): string {
    return this.backend.getBaseDir();
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  (async () => {
    const tmpDir = `/tmp/meshseeks-checkpoint-test-${Date.now()}`;
    const store = new CheckpointStore(tmpDir, 5);

    const allValidationFailures: string[] = [];
    let totalTests = 0;

    console.log('Testing CheckpointStore...\n');

    // Test 1: Initialize
    totalTests++;
    try {
      await store.initialize();
      console.log('  ✓ Initialize');
    } catch (error) {
      allValidationFailures.push(`Initialize: ${error}`);
    }

    // Test 2: Create session directory
    totalTests++;
    const testSessionId = 'test-session-001';
    try {
      await store.createSessionDirectory(testSessionId);
      console.log('  ✓ Create session directory');
    } catch (error) {
      allValidationFailures.push(`CreateSessionDirectory: ${error}`);
    }

    // Test 3: Save and load session
    totalTests++;
    const mockSession: SwarmSession = {
      id: testSessionId,
      name: 'Test Session',
      description: 'A test session',
      status: 'active',
      rootTaskId: 'task-root',
      taskTree: {
        'task-root': {
          id: 'task-root',
          parentId: null,
          depth: 0,
          children: ['task-1'],
          prompt: 'Root task',
          role: 'planner',
          workFolder: '/tmp/test',
          returnMode: 'summary',
          dependencies: [],
          status: 'completed',
          priority: 'high',
          retryCount: 0,
          maxRetries: 3,
          createdAt: Date.now(),
          tags: []
        },
        'task-1': {
          id: 'task-1',
          parentId: 'task-root',
          depth: 1,
          children: [],
          prompt: 'Child task',
          role: 'implementation',
          workFolder: '/tmp/test',
          returnMode: 'full',
          dependencies: ['task-root'],
          status: 'pending',
          priority: 'medium',
          retryCount: 0,
          maxRetries: 3,
          createdAt: Date.now(),
          tags: []
        }
      },
      lastCheckpointId: null,
      checkpointIds: [],
      autoCheckpointIntervalMs: 300000,
      config: {
        maxConcurrentAgents: 10,
        maxTaskDepth: 5,
        agentTimeoutMs: 3600000,
        sessionTimeoutMs: 604800000,
        enableJudge: true,
        judgePassThreshold: 0.8,
        maxJudgeRetries: 2,
        checkpointIntervalMs: 300000,
        checkpointDir: tmpDir,
        maxCheckpointsPerSession: 5,
        minAgents: 1,
        maxAgents: 100,
        scaleUpThreshold: 10,
        scaleDownThreshold: 60000,
        maxConsecutiveFailures: 5,
        failureThresholdPercent: 30,
        maxTotalTasks: 1000,
        maxTasksPerLevel: 50
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + 604800000,
      metrics: {
        totalTasks: 2,
        completedTasks: 1,
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
        tasksPerDepth: { 0: 1, 1: 1 },
        tasksByStatus: { completed: 1, pending: 1 } as Record<string, number>,
        tasksByRole: { planner: 1, implementation: 1 } as Record<string, number>
      },
      errors: []
    };

    try {
      await store.saveSession(mockSession);
      const loaded = await store.loadSession(testSessionId);
      if (!loaded || loaded.id !== testSessionId) {
        allValidationFailures.push('SaveSession/LoadSession: Data mismatch');
      } else {
        console.log('  ✓ Save and load session');
      }
    } catch (error) {
      allValidationFailures.push(`SaveSession/LoadSession: ${error}`);
    }

    // Test 4: Save and load task tree
    totalTests++;
    try {
      await store.saveTaskTree(testSessionId, mockSession.taskTree);
      const loadedTree = await store.loadTaskTree(testSessionId);
      if (!loadedTree || !loadedTree['task-root']) {
        allValidationFailures.push('SaveTaskTree/LoadTaskTree: Data mismatch');
      } else {
        console.log('  ✓ Save and load task tree');
      }
    } catch (error) {
      allValidationFailures.push(`SaveTaskTree/LoadTaskTree: ${error}`);
    }

    // Test 5: Create checkpoint
    totalTests++;
    let createdCheckpointId: string | undefined;
    try {
      const result = await store.createCheckpoint(
        mockSession,
        {},
        {},
        {
          trigger: 'manual',
          description: 'Test checkpoint',
          includeContext: true,
          compress: false
        }
      );
      if (!result.success || !result.checkpointId) {
        allValidationFailures.push(`CreateCheckpoint: ${result.error}`);
      } else {
        createdCheckpointId = result.checkpointId;
        console.log('  ✓ Create checkpoint');
      }
    } catch (error) {
      allValidationFailures.push(`CreateCheckpoint: ${error}`);
    }

    // Test 6: List checkpoints
    totalTests++;
    try {
      const { checkpoints, total } = await store.listCheckpoints(testSessionId);
      if (total < 1 || checkpoints.length < 1) {
        allValidationFailures.push(`ListCheckpoints: Expected at least 1 checkpoint, got ${total}`);
      } else {
        console.log('  ✓ List checkpoints');
      }
    } catch (error) {
      allValidationFailures.push(`ListCheckpoints: ${error}`);
    }

    // Test 7: Get checkpoint
    totalTests++;
    if (createdCheckpointId) {
      try {
        const checkpoint = await store.getCheckpoint(testSessionId, createdCheckpointId);
        if (!checkpoint || checkpoint.id !== createdCheckpointId) {
          allValidationFailures.push('GetCheckpoint: Checkpoint not found or ID mismatch');
        } else {
          console.log('  ✓ Get checkpoint');
        }
      } catch (error) {
        allValidationFailures.push(`GetCheckpoint: ${error}`);
      }
    } else {
      allValidationFailures.push('GetCheckpoint: No checkpoint ID available');
    }

    // Test 8: Get latest checkpoint
    totalTests++;
    try {
      const latest = await store.getLatestCheckpoint(testSessionId);
      if (!latest) {
        allValidationFailures.push('GetLatestCheckpoint: No checkpoint found');
      } else {
        console.log('  ✓ Get latest checkpoint');
      }
    } catch (error) {
      allValidationFailures.push(`GetLatestCheckpoint: ${error}`);
    }

    // Test 9: Save and load task result
    totalTests++;
    try {
      const taskResult = { success: true, output: 'Test output' };
      await store.saveTaskResult(testSessionId, 'task-1', taskResult);
      const loaded = await store.loadTaskResult(testSessionId, 'task-1');
      if (!loaded || (loaded as { success: boolean }).success !== true) {
        allValidationFailures.push('SaveTaskResult/LoadTaskResult: Data mismatch');
      } else {
        console.log('  ✓ Save and load task result');
      }
    } catch (error) {
      allValidationFailures.push(`SaveTaskResult/LoadTaskResult: ${error}`);
    }

    // Test 10: List sessions
    totalTests++;
    try {
      const sessions = await store.listSessions();
      if (!sessions.includes(testSessionId)) {
        allValidationFailures.push('ListSessions: Test session not found');
      } else {
        console.log('  ✓ List sessions');
      }
    } catch (error) {
      allValidationFailures.push(`ListSessions: ${error}`);
    }

    // Test 11: Get storage stats
    totalTests++;
    try {
      const stats = await store.getSessionStorageStats(testSessionId);
      if (stats.totalSizeBytes <= 0 || stats.checkpointCount < 1) {
        allValidationFailures.push(`GetStorageStats: Invalid stats - size: ${stats.totalSizeBytes}, checkpoints: ${stats.checkpointCount}`);
      } else {
        console.log('  ✓ Get storage stats');
      }
    } catch (error) {
      allValidationFailures.push(`GetStorageStats: ${error}`);
    }

    // Cleanup
    await store.deleteSession(testSessionId);

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

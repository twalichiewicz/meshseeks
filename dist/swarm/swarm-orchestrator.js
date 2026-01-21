/**
 * Swarm Orchestrator - Top-level coordination for Cursor-scale operations
 *
 * Integrates all swarm components (SessionManager, HierarchicalPlanner,
 * JudgeSystem, AgentPoolManager) into a unified orchestration layer.
 * Provides the main interface for autonomous problem-solving.
 *
 * @module swarm-orchestrator
 * @see SessionManager for session lifecycle
 * @see HierarchicalPlanner for task decomposition
 * @see JudgeSystem for verification
 * @see AgentPoolManager for agent scaling
 *
 * Sample usage:
 *   const orchestrator = new SwarmOrchestrator(config);
 *   await orchestrator.initialize();
 *   const session = await orchestrator.createSession({ name: 'Feature', prompt: '...' });
 *   await orchestrator.run(session.id);
 */
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { CheckpointStore } from '../persistence/checkpoint-store.js';
import { SessionManager } from './session-manager.js';
import { HierarchicalPlanner } from './hierarchical-planner.js';
import { JudgeSystem } from './judge-system.js';
import { AgentPoolManager } from './agent-pool-manager.js';
/**
 * Default orchestrator configuration.
 */
const DEFAULT_ORCHESTRATOR_CONFIG = {
    checkpointDir: '~/.meshseeks/sessions',
    maxConcurrentAgents: 100,
    maxTaskDepth: 5,
    enableJudge: true,
    judgePassThreshold: 0.8,
    maxJudgeRetries: 2,
    checkpointIntervalMs: 300000,
    agentTimeoutMs: 3600000,
    sessionTimeoutMs: 604800000
};
/**
 * Swarm orchestrator for Cursor-scale autonomous operations.
 */
export class SwarmOrchestrator extends EventEmitter {
    config;
    checkpointStore;
    sessionManager;
    planner;
    judge;
    agentPool;
    executionStates = new Map();
    taskExecutor;
    initialized = false;
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
        // Initialize components
        this.checkpointStore = new CheckpointStore(this.config.checkpointDir);
        this.sessionManager = new SessionManager(this.checkpointStore);
        this.planner = new HierarchicalPlanner({
            maxDepth: this.config.maxTaskDepth,
            maxTasksPerLevel: 100
        });
        this.judge = new JudgeSystem({
            enabled: this.config.enableJudge,
            passThreshold: this.config.judgePassThreshold,
            maxRetries: this.config.maxJudgeRetries
        });
        this.agentPool = new AgentPoolManager({
            maxAgents: this.config.maxConcurrentAgents,
            agentTimeoutMs: this.config.agentTimeoutMs
        });
        // Forward events
        this.setupEventForwarding();
    }
    /**
     * Set up event forwarding from components.
     */
    setupEventForwarding() {
        // Forward session manager events
        this.sessionManager.on('session_created', (e) => this.emit('session_created', e));
        this.sessionManager.on('session_started', (e) => this.emit('session_started', e));
        this.sessionManager.on('session_paused', (e) => this.emit('session_paused', e));
        this.sessionManager.on('session_completed', (e) => this.emit('session_completed', e));
        this.sessionManager.on('session_failed', (e) => this.emit('session_failed', e));
        this.sessionManager.on('task_started', (e) => this.emit('task_started', e));
        this.sessionManager.on('task_completed', (e) => this.emit('task_completed', e));
        this.sessionManager.on('task_failed', (e) => this.emit('task_failed', e));
        this.sessionManager.on('checkpoint_created', (e) => this.emit('checkpoint_created', e));
        // Forward agent pool events
        this.agentPool.on('agent_created', (e) => this.emit('agent_spawned', e));
        this.agentPool.on('agent_failed', (e) => this.emit('agent_failed', e));
        this.agentPool.on('scale_up', (e) => this.emit('scaling_event', e));
        this.agentPool.on('scale_down', (e) => this.emit('scaling_event', e));
    }
    // ===========================================================================
    // INITIALIZATION
    // ===========================================================================
    /**
     * Initialize the orchestrator.
     */
    async initialize() {
        if (this.initialized)
            return;
        await this.checkpointStore.initialize();
        await this.agentPool.initialize();
        this.initialized = true;
    }
    /**
     * Set the task executor function.
     */
    setTaskExecutor(executor) {
        this.taskExecutor = executor;
    }
    // ===========================================================================
    // SESSION MANAGEMENT
    // ===========================================================================
    /**
     * Create a new swarm session.
     */
    async createSession(options) {
        this.ensureInitialized();
        const session = await this.sessionManager.createSession({
            ...options,
            config: {
                maxConcurrentAgents: this.config.maxConcurrentAgents,
                maxTaskDepth: this.config.maxTaskDepth,
                agentTimeoutMs: this.config.agentTimeoutMs,
                sessionTimeoutMs: this.config.sessionTimeoutMs,
                enableJudge: this.config.enableJudge,
                judgePassThreshold: this.config.judgePassThreshold,
                maxJudgeRetries: this.config.maxJudgeRetries,
                checkpointIntervalMs: this.config.checkpointIntervalMs,
                checkpointDir: this.config.checkpointDir,
                maxCheckpointsPerSession: 100,
                minAgents: 1,
                maxAgents: this.config.maxConcurrentAgents,
                scaleUpThreshold: 10,
                scaleDownThreshold: 60000,
                maxConsecutiveFailures: 5,
                failureThresholdPercent: 30,
                maxTotalTasks: 10000,
                maxTasksPerLevel: 100,
                ...options.config
            }
        });
        // Initialize execution state
        this.executionStates.set(session.id, {
            sessionId: session.id,
            isRunning: false,
            isPaused: false,
            currentBatch: [],
            completedInBatch: 0,
            totalInBatch: 0
        });
        return session;
    }
    /**
     * Start and run a session to completion.
     */
    async run(sessionId) {
        this.ensureInitialized();
        const session = await this.sessionManager.startSession(sessionId);
        const state = this.executionStates.get(sessionId);
        if (!state) {
            throw new Error(`Execution state not found for session: ${sessionId}`);
        }
        state.isRunning = true;
        try {
            // Execute until all tasks are done
            await this.executeSession(session);
            // Complete session
            return await this.sessionManager.completeSession(sessionId);
        }
        catch (error) {
            await this.sessionManager.failSession(sessionId, String(error));
            throw error;
        }
        finally {
            state.isRunning = false;
        }
    }
    /**
     * Execute session tasks.
     */
    async executeSession(session) {
        const sessionId = session.id;
        const state = this.executionStates.get(sessionId);
        let iterations = 0;
        const maxIterations = 1000; // Safety limit
        // Main execution loop
        while (!state.isPaused && iterations < maxIterations) {
            iterations++;
            // Refresh session to get latest task tree
            const refreshed = this.sessionManager.getActiveSession(sessionId);
            if (refreshed) {
                session.taskTree = refreshed.taskTree;
                session.metrics = refreshed.metrics;
            }
            // Plan tasks if root task is pending
            const rootTask = this.getTask(session, session.rootTaskId);
            if (rootTask && rootTask.status === 'pending') {
                await this.planTask(session, rootTask);
                continue; // Refresh and check for new tasks
            }
            // Get executable tasks
            const executableTasks = this.planner.getExecutableTasks(session.taskTree);
            if (executableTasks.length === 0) {
                // Check if all tasks are completed or failed
                const allDone = this.areAllTasksDone(session);
                if (allDone) {
                    break;
                }
                // Check for stuck state (no executable tasks but not all done)
                const inProgress = this.countTasksByStatus(session, 'in_progress');
                if (inProgress === 0) {
                    // No tasks running and no executable tasks - might be stuck
                    break;
                }
                // Wait briefly for in-progress tasks
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }
            // Execute batch of tasks
            await this.executeBatch(session, executableTasks);
        }
    }
    /**
     * Check if all tasks are done (completed, failed, or cancelled).
     */
    areAllTasksDone(session) {
        const tree = session.taskTree instanceof Map
            ? session.taskTree
            : new Map(Object.entries(session.taskTree));
        for (const task of tree.values()) {
            if (task.status !== 'completed' && task.status !== 'failed' && task.status !== 'cancelled') {
                return false;
            }
        }
        return true;
    }
    /**
     * Count tasks by status.
     */
    countTasksByStatus(session, status) {
        const tree = session.taskTree instanceof Map
            ? session.taskTree
            : new Map(Object.entries(session.taskTree));
        return Array.from(tree.values()).filter(t => t.status === status).length;
    }
    /**
     * Plan subtasks for a task.
     */
    async planTask(session, task, instruction) {
        const context = {
            sessionId: session.id,
            workFolder: task.workFolder,
            maxDepth: this.config.maxTaskDepth,
            maxTasksPerLevel: 100,
            existingTaskIds: new Set(Array.from(session.taskTree instanceof Map
                ? session.taskTree.keys()
                : Object.keys(session.taskTree)))
        };
        const result = await this.planner.decompose(task, context, instruction);
        if (!result.success) {
            throw new Error(`Planning failed: ${result.errors.join(', ')}`);
        }
        // Add tasks to session
        for (const subtask of result.tasks) {
            this.sessionManager.addTask(session.id, subtask);
        }
        // Mark parent as completed (planning done)
        if (task.role === 'planner' && result.tasks.length > 0) {
            this.sessionManager.updateTaskStatus(session.id, task.id, 'completed');
        }
        return result.tasks;
    }
    /**
     * Execute a batch of tasks concurrently.
     */
    async executeBatch(session, tasks) {
        const state = this.executionStates.get(session.id);
        const maxConcurrent = Math.min(tasks.length, this.config.maxConcurrentAgents);
        state.currentBatch = tasks.slice(0, maxConcurrent).map(t => t.id);
        state.totalInBatch = state.currentBatch.length;
        state.completedInBatch = 0;
        // Execute tasks concurrently
        const promises = state.currentBatch.map(taskId => this.executeTaskWithRetry(session, taskId));
        await Promise.allSettled(promises);
        state.currentBatch = [];
    }
    /**
     * Execute a single task with retry logic.
     */
    async executeTaskWithRetry(session, taskId) {
        const task = this.getTask(session, taskId);
        if (!task)
            return;
        // Acquire agent
        let agentId;
        try {
            agentId = await this.agentPool.acquireAgent(task.role, task.priority, taskId);
            this.sessionManager.registerAgent(session.id, this.agentPool.getAgent(agentId));
        }
        catch (error) {
            this.sessionManager.updateTaskStatus(session.id, taskId, 'failed', {
                success: false,
                output: '',
                error: { code: 'NO_AGENT', message: String(error), recoverable: true }
            });
            return;
        }
        try {
            // Update status
            this.sessionManager.updateTaskStatus(session.id, taskId, 'in_progress');
            // Execute task
            const result = await this.executeTask(session, task);
            // Verify with judge if enabled
            if (this.config.enableJudge && task.role !== 'planner') {
                const verdict = await this.verifyTask(task, result);
                if (!verdict.passed) {
                    // Handle rework
                    if (verdict.requiresRework && task.retryCount < task.maxRetries) {
                        task.retryCount++;
                        task.status = 'rework';
                        this.sessionManager.updateTaskStatus(session.id, taskId, 'rework');
                        // Re-queue for execution
                        return;
                    }
                    // Failed verification
                    this.sessionManager.updateTaskStatus(session.id, taskId, 'failed', {
                        ...result,
                        success: false
                    });
                    return;
                }
            }
            // Success
            this.sessionManager.updateTaskStatus(session.id, taskId, 'completed', result);
            // Store context for dependent tasks
            this.sessionManager.setContext(session.id, taskId, result);
            // Check if task should be decomposed
            if (this.planner.shouldAutoDecompose(task, {
                sessionId: session.id,
                workFolder: task.workFolder,
                maxDepth: this.config.maxTaskDepth,
                maxTasksPerLevel: 100,
                existingTaskIds: new Set()
            })) {
                await this.planTask(session, task);
            }
        }
        catch (error) {
            this.sessionManager.updateTaskStatus(session.id, taskId, 'failed', {
                success: false,
                output: '',
                error: { code: 'EXECUTION_ERROR', message: String(error), recoverable: true }
            });
        }
        finally {
            // Release agent
            if (agentId) {
                const success = task.status === 'completed';
                this.agentPool.releaseAgent(agentId, success);
                this.sessionManager.removeAgent(session.id, agentId);
            }
            // Update batch completion
            const state = this.executionStates.get(session.id);
            if (state) {
                state.completedInBatch++;
            }
        }
    }
    /**
     * Execute a task using the task executor.
     */
    async executeTask(session, task) {
        if (!this.taskExecutor) {
            // Default mock executor for testing
            return {
                success: true,
                output: `Executed task: ${task.prompt}`,
                summary: 'Task completed successfully',
                metrics: {
                    executionTimeMs: 100,
                    tokensUsed: 500
                }
            };
        }
        // Gather context from dependencies
        const context = {};
        for (const depId of task.dependencies) {
            const depContext = this.sessionManager.getContext(session.id, depId);
            if (depContext) {
                context[depId] = depContext;
            }
        }
        return this.taskExecutor(task, context);
    }
    /**
     * Verify a task result with the judge.
     */
    async verifyTask(task, result) {
        const request = {
            task,
            result,
            previousVerdicts: this.judge.getVerdictHistory(task.id)
        };
        const verdict = await this.judge.verify(request);
        this.emit('judge_verdict', {
            taskId: task.id,
            passed: verdict.passed,
            score: verdict.overallScore
        });
        return verdict;
    }
    // ===========================================================================
    // SESSION CONTROL
    // ===========================================================================
    /**
     * Pause a running session.
     */
    async pauseSession(sessionId, reason) {
        const state = this.executionStates.get(sessionId);
        if (state) {
            state.isPaused = true;
        }
        return this.sessionManager.pauseSession(sessionId, {
            createCheckpoint: true,
            reason
        });
    }
    /**
     * Resume a paused session.
     */
    async resumeSession(sessionId, checkpointId, resetFailedTasks) {
        const session = await this.sessionManager.resumeSession(sessionId, {
            checkpointId,
            resetFailedTasks
        });
        const state = this.executionStates.get(sessionId);
        if (state) {
            state.isPaused = false;
        }
        return session;
    }
    /**
     * Get session status.
     */
    getSessionStatus(sessionId) {
        const status = this.sessionManager.getSessionStatus(sessionId);
        const executionState = this.executionStates.get(sessionId);
        return {
            ...status,
            executionState
        };
    }
    /**
     * Get session by ID.
     */
    async getSession(sessionId) {
        return this.sessionManager.getSession(sessionId);
    }
    /**
     * List all sessions.
     */
    async listSessions() {
        return this.sessionManager.listAllSessions();
    }
    // ===========================================================================
    // CHECKPOINTING
    // ===========================================================================
    /**
     * Create a manual checkpoint.
     */
    async createCheckpoint(sessionId, description) {
        return this.sessionManager.createCheckpoint(sessionId, {
            trigger: 'manual',
            description,
            includeContext: true,
            compress: true
        });
    }
    /**
     * List checkpoints for a session.
     */
    async listCheckpoints(sessionId) {
        const { checkpoints } = await this.checkpointStore.listCheckpoints(sessionId);
        return checkpoints.map(c => ({ id: c.id, timestamp: c.timestamp }));
    }
    /**
     * Restore from checkpoint.
     */
    async restoreCheckpoint(sessionId, checkpointId) {
        return this.resumeSession(sessionId, checkpointId, true);
    }
    // ===========================================================================
    // SCALING
    // ===========================================================================
    /**
     * Scale agent pool.
     */
    async scaleAgents(targetCount, reason) {
        await this.agentPool.setTargetAgentCount(targetCount, reason || 'Manual scaling');
    }
    /**
     * Get pool statistics.
     */
    getPoolStats() {
        return this.agentPool.getStats();
    }
    // ===========================================================================
    // UTILITIES
    // ===========================================================================
    /**
     * Get a task from session.
     */
    getTask(session, taskId) {
        const tree = session.taskTree instanceof Map
            ? session.taskTree
            : new Map(Object.entries(session.taskTree));
        return tree.get(taskId);
    }
    /**
     * Check if all tasks are completed.
     */
    areAllTasksCompleted(session) {
        const tree = session.taskTree instanceof Map
            ? session.taskTree
            : new Map(Object.entries(session.taskTree));
        for (const task of tree.values()) {
            if (task.status !== 'completed' && task.status !== 'cancelled') {
                return false;
            }
        }
        return true;
    }
    /**
     * Ensure orchestrator is initialized.
     */
    ensureInitialized() {
        if (!this.initialized) {
            throw new Error('Orchestrator not initialized. Call initialize() first.');
        }
    }
    /**
     * Get configuration.
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Shutdown the orchestrator.
     */
    async shutdown() {
        await this.sessionManager.shutdown();
        await this.agentPool.shutdown();
    }
}
// =============================================================================
// VALIDATION
// =============================================================================
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    (async () => {
        const tmpDir = `/tmp/meshseeks-orchestrator-test-${Date.now()}`;
        const orchestrator = new SwarmOrchestrator({
            checkpointDir: tmpDir,
            maxConcurrentAgents: 5,
            maxTaskDepth: 3,
            enableJudge: true,
            judgePassThreshold: 0.5 // Lower for testing
        });
        const allValidationFailures = [];
        let totalTests = 0;
        console.log('Testing SwarmOrchestrator...\n');
        // Test 1: Initialize
        totalTests++;
        try {
            await orchestrator.initialize();
            console.log('  ✓ Initialize');
        }
        catch (error) {
            allValidationFailures.push(`Initialize: ${error}`);
        }
        let testSessionId;
        // Test 2: Create session
        totalTests++;
        try {
            const session = await orchestrator.createSession({
                name: 'Test Session',
                prompt: 'Implement a simple feature with testing',
                workFolder: '/tmp/test'
            });
            testSessionId = session.id;
            if (!session.id || session.status !== 'initializing') {
                allValidationFailures.push(`CreateSession: Invalid session state`);
            }
            else {
                console.log('  ✓ Create session');
            }
        }
        catch (error) {
            allValidationFailures.push(`CreateSession: ${error}`);
        }
        // Test 3: Set task executor
        totalTests++;
        try {
            orchestrator.setTaskExecutor(async (task, _context) => ({
                success: true,
                output: `Completed: ${task.prompt}`,
                summary: 'Done',
                metrics: { executionTimeMs: 50 }
            }));
            console.log('  ✓ Set task executor');
        }
        catch (error) {
            allValidationFailures.push(`SetTaskExecutor: ${error}`);
        }
        // Test 4: Run session
        totalTests++;
        if (testSessionId) {
            try {
                const session = await orchestrator.run(testSessionId);
                if (session.status !== 'completed') {
                    allValidationFailures.push(`RunSession: Expected completed, got ${session.status}`);
                }
                else {
                    console.log(`  ✓ Run session (${session.metrics.completedTasks} tasks completed)`);
                }
            }
            catch (error) {
                allValidationFailures.push(`RunSession: ${error}`);
            }
        }
        // Test 5: Create new session, start it, and checkpoint
        let checkpointSessionId;
        totalTests++;
        try {
            const session = await orchestrator.createSession({
                name: 'Checkpoint Test',
                prompt: 'Test checkpointing',
                workFolder: '/tmp/test'
            });
            checkpointSessionId = session.id;
            // Need to manually start the session before pausing
            await orchestrator['sessionManager'].startSession(session.id);
            // Now pause it (creates checkpoint)
            await orchestrator.pauseSession(session.id);
            const checkpoints = await orchestrator.listCheckpoints(session.id);
            if (checkpoints.length === 0) {
                allValidationFailures.push('Checkpoint: No checkpoint created on pause');
            }
            else {
                console.log(`  ✓ Checkpoint (${checkpoints.length} checkpoint(s))`);
            }
        }
        catch (error) {
            allValidationFailures.push(`Checkpoint: ${error}`);
        }
        // Test 6: Get session status (use the checkpoint session which is still active)
        totalTests++;
        if (checkpointSessionId) {
            try {
                const status = orchestrator.getSessionStatus(checkpointSessionId);
                if (!status.metrics) {
                    allValidationFailures.push('GetStatus: Missing metrics');
                }
                else {
                    console.log(`  ✓ Get session status (status: ${status.status})`);
                }
            }
            catch (error) {
                allValidationFailures.push(`GetStatus: ${error}`);
            }
        }
        // Test 7: Pool stats
        totalTests++;
        try {
            const stats = orchestrator.getPoolStats();
            if (typeof stats.totalAgents !== 'number') {
                allValidationFailures.push('PoolStats: Invalid stats');
            }
            else {
                console.log(`  ✓ Pool stats (${stats.totalAgents} agents, ${stats.health})`);
            }
        }
        catch (error) {
            allValidationFailures.push(`PoolStats: ${error}`);
        }
        // Test 8: Scale agents
        totalTests++;
        try {
            await orchestrator.scaleAgents(3, 'Test scaling');
            const stats = orchestrator.getPoolStats();
            if (stats.targetAgentCount !== 3) {
                allValidationFailures.push(`ScaleAgents: Target not updated (${stats.targetAgentCount})`);
            }
            else {
                console.log('  ✓ Scale agents');
            }
        }
        catch (error) {
            allValidationFailures.push(`ScaleAgents: ${error}`);
        }
        // Test 9: List sessions
        totalTests++;
        try {
            const sessions = await orchestrator.listSessions();
            if (!Array.isArray(sessions)) {
                allValidationFailures.push('ListSessions: Not an array');
            }
            else {
                console.log(`  ✓ List sessions (${sessions.length} sessions)`);
            }
        }
        catch (error) {
            allValidationFailures.push(`ListSessions: ${error}`);
        }
        // Test 10: Configuration
        totalTests++;
        try {
            const config = orchestrator.getConfig();
            if (config.maxConcurrentAgents !== 5) {
                allValidationFailures.push('GetConfig: Wrong maxConcurrentAgents');
            }
            else {
                console.log('  ✓ Get configuration');
            }
        }
        catch (error) {
            allValidationFailures.push(`GetConfig: ${error}`);
        }
        // Cleanup
        await orchestrator.shutdown();
        // Report results
        console.log('\n' + '─'.repeat(50));
        if (allValidationFailures.length > 0) {
            console.log(`❌ VALIDATION FAILED - ${allValidationFailures.length} of ${totalTests} tests failed:`);
            for (const failure of allValidationFailures) {
                console.log(`  - ${failure}`);
            }
            process.exit(1);
        }
        else {
            console.log(`✅ VALIDATION PASSED - All ${totalTests} tests produced expected results`);
            process.exit(0);
        }
    })();
}

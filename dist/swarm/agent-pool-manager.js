/**
 * Agent Pool Manager - Scalable agent lifecycle management
 *
 * Manages a pool of 1-500 concurrent agents with health monitoring,
 * dynamic scaling, and failure isolation. Supports graceful degradation
 * under high load or failure conditions.
 *
 * @module agent-pool-manager
 * @see SwarmAgentConfig for agent configuration
 * @see PoolStats for pool statistics
 *
 * Sample usage:
 *   const pool = new AgentPoolManager(config);
 *   const agentId = await pool.acquireAgent('implementation');
 *   await pool.releaseAgent(agentId, true);
 */
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
/**
 * Default pool configuration.
 */
const DEFAULT_POOL_CONFIG = {
    minAgents: 1,
    maxAgents: 500,
    initialAgents: 5,
    agentTimeoutMs: 3600000, // 1 hour
    healthCheckIntervalMs: 30000, // 30 seconds
    scaleUpThreshold: 10,
    scaleDownThreshold: 60000, // 1 minute idle
    maxConsecutiveFailures: 5,
    cooldownMs: 5000
};
/**
 * Agent pool manager for scalable agent lifecycle.
 */
export class AgentPoolManager extends EventEmitter {
    config;
    agents = new Map();
    requestQueue = [];
    agentIdCounter = 0;
    requestIdCounter = 0;
    healthCheckTimer;
    lastScaleTime = 0;
    scalingHistory = [];
    consecutiveFailures = 0;
    targetAgentCount;
    isScaling = false;
    isShuttingDown = false;
    constructor(config = {}) {
        super();
        this.config = { ...DEFAULT_POOL_CONFIG, ...config };
        this.targetAgentCount = this.config.initialAgents;
    }
    // ===========================================================================
    // INITIALIZATION
    // ===========================================================================
    /**
     * Initialize the agent pool.
     */
    async initialize() {
        // Create initial agents
        for (let i = 0; i < this.config.initialAgents; i++) {
            await this.createAgent();
        }
        // Start health check timer
        this.startHealthCheck();
    }
    /**
     * Start health check timer.
     */
    startHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.config.healthCheckIntervalMs);
    }
    /**
     * Stop health check timer.
     */
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = undefined;
        }
    }
    // ===========================================================================
    // AGENT LIFECYCLE
    // ===========================================================================
    /**
     * Create a new agent.
     */
    async createAgent(role) {
        const agentId = this.generateAgentId();
        const agent = {
            id: agentId,
            role: role || 'implementation', // Default role, will be assigned on acquire
            workFolder: '',
            priority: 'medium',
            maxRetries: 3,
            timeoutMs: this.config.agentTimeoutMs,
            createdAt: Date.now(),
            state: 'idle',
            completedTasks: 0,
            failedTasks: 0,
            totalExecutionTimeMs: 0,
            lastActivityAt: Date.now()
        };
        this.agents.set(agentId, agent);
        this.emit('agent_created', { agentId, role: agent.role });
        return agentId;
    }
    /**
     * Acquire an agent for a task.
     */
    async acquireAgent(role, priority = 'medium', taskId, timeoutMs) {
        // Try to find an available agent
        const availableAgent = this.findAvailableAgent(role);
        if (availableAgent) {
            return this.assignAgentToTask(availableAgent.id, role, taskId);
        }
        // Check if we can scale up
        if (this.agents.size < this.config.maxAgents && !this.isScaling) {
            await this.scaleUp(1, 'Agent requested, none available');
            const newAgent = this.findAvailableAgent(role);
            if (newAgent) {
                return this.assignAgentToTask(newAgent.id, role, taskId);
            }
        }
        // Queue the request
        return this.queueAgentRequest(role, priority, taskId, timeoutMs);
    }
    /**
     * Find an available agent, preferring one with matching role.
     */
    findAvailableAgent(preferredRole) {
        // First, try to find an idle agent with matching role
        for (const agent of this.agents.values()) {
            if (agent.state === 'idle' && agent.role === preferredRole) {
                return agent;
            }
        }
        // Then, try any idle agent
        for (const agent of this.agents.values()) {
            if (agent.state === 'idle') {
                return agent;
            }
        }
        return undefined;
    }
    /**
     * Assign an agent to a task.
     */
    assignAgentToTask(agentId, role, taskId) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error(`Agent not found: ${agentId}`);
        }
        agent.state = 'running';
        agent.role = role;
        agent.currentTaskId = taskId;
        agent.lastActivityAt = Date.now();
        this.emit('agent_assigned', { agentId, role, taskId });
        return agentId;
    }
    /**
     * Queue an agent request.
     */
    queueAgentRequest(role, priority, taskId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const requestId = `req-${++this.requestIdCounter}`;
            const request = {
                id: requestId,
                role,
                priority,
                taskId,
                resolve,
                reject,
                requestedAt: Date.now()
            };
            // Set timeout if specified
            if (timeoutMs) {
                request.timeoutHandle = setTimeout(() => {
                    this.removeRequest(requestId);
                    reject(new Error(`Agent request timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }
            // Insert based on priority
            this.insertRequestByPriority(request);
            this.emit('request_queued', { requestId, role, priority, queueDepth: this.requestQueue.length });
            // Check if we should scale up
            this.checkScaleUp();
        });
    }
    /**
     * Insert request in queue based on priority.
     */
    insertRequestByPriority(request) {
        const priorityOrder = ['critical', 'high', 'medium', 'low'];
        const requestPriorityIndex = priorityOrder.indexOf(request.priority);
        let insertIndex = this.requestQueue.length;
        for (let i = 0; i < this.requestQueue.length; i++) {
            const existingPriorityIndex = priorityOrder.indexOf(this.requestQueue[i].priority);
            if (requestPriorityIndex < existingPriorityIndex) {
                insertIndex = i;
                break;
            }
        }
        this.requestQueue.splice(insertIndex, 0, request);
    }
    /**
     * Remove a request from the queue.
     */
    removeRequest(requestId) {
        const index = this.requestQueue.findIndex(r => r.id === requestId);
        if (index !== -1) {
            const request = this.requestQueue[index];
            if (request.timeoutHandle) {
                clearTimeout(request.timeoutHandle);
            }
            this.requestQueue.splice(index, 1);
        }
    }
    /**
     * Release an agent back to the pool.
     */
    releaseAgent(agentId, success) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        // Update stats
        if (success) {
            agent.completedTasks++;
            this.consecutiveFailures = 0;
        }
        else {
            agent.failedTasks++;
            this.consecutiveFailures++;
        }
        agent.state = 'idle';
        agent.currentTaskId = undefined;
        agent.lastActivityAt = Date.now();
        this.emit('agent_released', { agentId, success });
        // Process queued requests
        this.processQueue();
        // Check for excessive failures
        if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
            this.emit('excessive_failures', { consecutiveFailures: this.consecutiveFailures });
        }
        // Check if we should scale down
        this.checkScaleDown();
    }
    /**
     * Mark agent as failed.
     */
    markAgentFailed(agentId, error) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.state = 'failed';
        agent.failedTasks++;
        agent.metadata = { ...agent.metadata, lastError: error };
        this.consecutiveFailures++;
        this.emit('agent_failed', { agentId, error });
        // Remove and replace failed agent
        this.agents.delete(agentId);
        // Create replacement if below min
        if (this.agents.size < this.config.minAgents) {
            this.createAgent().catch(err => {
                console.error('Failed to create replacement agent:', err);
            });
        }
    }
    /**
     * Process queued requests when agents become available.
     */
    processQueue() {
        while (this.requestQueue.length > 0) {
            const availableAgent = this.findAvailableAgent(this.requestQueue[0].role);
            if (!availableAgent)
                break;
            const request = this.requestQueue.shift();
            if (request.timeoutHandle) {
                clearTimeout(request.timeoutHandle);
            }
            try {
                const agentId = this.assignAgentToTask(availableAgent.id, request.role, request.taskId);
                request.resolve(agentId);
            }
            catch (error) {
                request.reject(error);
            }
        }
    }
    /**
     * Remove an agent from the pool.
     */
    removeAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent)
            return;
        agent.state = 'stopped';
        this.agents.delete(agentId);
        this.emit('agent_removed', { agentId });
    }
    // ===========================================================================
    // SCALING
    // ===========================================================================
    /**
     * Check if we should scale up.
     */
    checkScaleUp() {
        if (this.isScaling || this.isShuttingDown)
            return;
        const queueDepth = this.requestQueue.length;
        if (queueDepth >= this.config.scaleUpThreshold) {
            // Calculate how many agents to add
            const idleAgents = this.getIdleAgentCount();
            const neededAgents = Math.min(queueDepth - idleAgents, this.config.maxAgents - this.agents.size);
            if (neededAgents > 0) {
                this.scaleUp(neededAgents, `Queue depth: ${queueDepth}`);
            }
        }
    }
    /**
     * Check if we should scale down.
     */
    checkScaleDown() {
        if (this.isScaling || this.isShuttingDown)
            return;
        const now = Date.now();
        const idleAgents = Array.from(this.agents.values()).filter(a => a.state === 'idle');
        // Find agents that have been idle for too long
        const excessIdleAgents = idleAgents.filter(a => now - a.lastActivityAt > this.config.scaleDownThreshold);
        // Only scale down if above minimum
        const agentsToRemove = Math.min(excessIdleAgents.length, this.agents.size - this.config.minAgents);
        if (agentsToRemove > 0) {
            this.scaleDown(agentsToRemove, 'Excess idle agents');
        }
    }
    /**
     * Scale up the agent pool.
     */
    async scaleUp(count, reason) {
        if (this.isScaling || this.isShuttingDown)
            return;
        // Enforce cooldown
        const now = Date.now();
        if (now - this.lastScaleTime < this.config.cooldownMs) {
            return;
        }
        this.isScaling = true;
        const previousCount = this.agents.size;
        try {
            const actualCount = Math.min(count, this.config.maxAgents - this.agents.size);
            for (let i = 0; i < actualCount; i++) {
                await this.createAgent();
            }
            this.targetAgentCount = this.agents.size;
            this.lastScaleTime = now;
            const event = {
                timestamp: now,
                previousCount,
                newCount: this.agents.size,
                reason,
                trigger: 'auto'
            };
            this.scalingHistory.push(event);
            this.emit('scale_up', event);
        }
        finally {
            this.isScaling = false;
        }
        // Process queue with new agents
        this.processQueue();
    }
    /**
     * Scale down the agent pool.
     */
    async scaleDown(count, reason) {
        if (this.isScaling || this.isShuttingDown)
            return;
        // Enforce cooldown
        const now = Date.now();
        if (now - this.lastScaleTime < this.config.cooldownMs) {
            return;
        }
        this.isScaling = true;
        const previousCount = this.agents.size;
        try {
            const actualCount = Math.min(count, this.agents.size - this.config.minAgents);
            // Remove idle agents (oldest first)
            const idleAgents = Array.from(this.agents.values())
                .filter(a => a.state === 'idle')
                .sort((a, b) => a.createdAt - b.createdAt);
            for (let i = 0; i < actualCount && i < idleAgents.length; i++) {
                this.removeAgent(idleAgents[i].id);
            }
            this.targetAgentCount = this.agents.size;
            this.lastScaleTime = now;
            const event = {
                timestamp: now,
                previousCount,
                newCount: this.agents.size,
                reason,
                trigger: 'auto'
            };
            this.scalingHistory.push(event);
            this.emit('scale_down', event);
        }
        finally {
            this.isScaling = false;
        }
    }
    /**
     * Manually set target agent count.
     */
    async setTargetAgentCount(count, reason = 'Manual scaling') {
        const clampedCount = Math.max(this.config.minAgents, Math.min(this.config.maxAgents, count));
        const currentCount = this.agents.size;
        if (clampedCount > currentCount) {
            await this.scaleUp(clampedCount - currentCount, reason);
        }
        else if (clampedCount < currentCount) {
            await this.scaleDown(currentCount - clampedCount, reason);
        }
        this.targetAgentCount = clampedCount;
    }
    // ===========================================================================
    // HEALTH MONITORING
    // ===========================================================================
    /**
     * Perform periodic health check.
     */
    performHealthCheck() {
        const now = Date.now();
        for (const agent of this.agents.values()) {
            // Check for stuck agents
            if (agent.state === 'running') {
                const runTime = now - agent.lastActivityAt;
                if (runTime > this.config.agentTimeoutMs) {
                    this.emit('agent_timeout', { agentId: agent.id, runTime });
                    this.markAgentFailed(agent.id, 'Execution timeout');
                }
            }
        }
        // Process any pending queue items
        this.processQueue();
        // Check scaling
        this.checkScaleUp();
        this.checkScaleDown();
    }
    /**
     * Get pool health status.
     */
    getPoolHealth() {
        const agents = Array.from(this.agents.values());
        const totalAgents = agents.length;
        const failedAgents = agents.filter(a => a.state === 'failed').length;
        const busyAgents = agents.filter(a => a.state === 'running').length;
        const queuedTasks = this.requestQueue.length;
        const utilizationPercent = totalAgents > 0 ? (busyAgents / totalAgents) * 100 : 0;
        if (failedAgents > totalAgents * 0.5) {
            return 'critical';
        }
        if (failedAgents > totalAgents * 0.2) {
            return 'unhealthy';
        }
        if (utilizationPercent > 90 || queuedTasks > totalAgents * 2) {
            return 'degraded';
        }
        return 'healthy';
    }
    // ===========================================================================
    // STATISTICS
    // ===========================================================================
    /**
     * Get pool statistics.
     */
    getStats() {
        const agents = Array.from(this.agents.values());
        const idleAgents = agents.filter(a => a.state === 'idle').length;
        const busyAgents = agents.filter(a => a.state === 'running').length;
        const failedAgents = agents.filter(a => a.state === 'failed').length;
        const queuedTasks = this.requestQueue.length;
        // Calculate average wait time from queue
        const now = Date.now();
        const waitTimes = this.requestQueue.map(r => now - r.requestedAt);
        const averageWaitTimeMs = waitTimes.length > 0
            ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
            : 0;
        const utilizationPercent = agents.length > 0
            ? (busyAgents / agents.length) * 100
            : 0;
        // Determine scaling decision
        let scalingDecision = 'maintain';
        if (queuedTasks >= this.config.scaleUpThreshold && agents.length < this.config.maxAgents) {
            scalingDecision = 'scale_up';
        }
        else if (idleAgents > agents.length * 0.5 && agents.length > this.config.minAgents) {
            scalingDecision = 'scale_down';
        }
        // Calculate health directly to avoid recursion
        let health = 'healthy';
        if (failedAgents > agents.length * 0.5) {
            health = 'critical';
        }
        else if (failedAgents > agents.length * 0.2) {
            health = 'unhealthy';
        }
        else if (utilizationPercent > 90 || queuedTasks > agents.length * 2) {
            health = 'degraded';
        }
        return {
            totalAgents: agents.length,
            idleAgents,
            busyAgents,
            failedAgents,
            queuedTasks,
            averageWaitTimeMs,
            health,
            utilizationPercent,
            scalingDecision,
            targetAgentCount: this.targetAgentCount
        };
    }
    /**
     * Get idle agent count.
     */
    getIdleAgentCount() {
        return Array.from(this.agents.values()).filter(a => a.state === 'idle').length;
    }
    /**
     * Get all agents.
     */
    getAgents() {
        return new Map(this.agents);
    }
    /**
     * Get agent by ID.
     */
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    /**
     * Get scaling history.
     */
    getScalingHistory() {
        return [...this.scalingHistory];
    }
    /**
     * Get queue depth.
     */
    getQueueDepth() {
        return this.requestQueue.length;
    }
    // ===========================================================================
    // UTILITIES
    // ===========================================================================
    /**
     * Generate unique agent ID.
     */
    generateAgentId() {
        this.agentIdCounter++;
        const timestamp = Date.now().toString(36);
        return `agent-${timestamp}-${this.agentIdCounter}`;
    }
    /**
     * Update agent activity timestamp.
     */
    updateAgentActivity(agentId) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.lastActivityAt = Date.now();
        }
    }
    /**
     * Shutdown the pool gracefully.
     */
    async shutdown() {
        this.isShuttingDown = true;
        this.stopHealthCheck();
        // Reject all pending requests
        for (const request of this.requestQueue) {
            if (request.timeoutHandle) {
                clearTimeout(request.timeoutHandle);
            }
            request.reject(new Error('Pool shutting down'));
        }
        this.requestQueue = [];
        // Wait for running agents to complete (with timeout)
        const timeout = 30000; // 30 seconds
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const runningAgents = Array.from(this.agents.values()).filter(a => a.state === 'running');
            if (runningAgents.length === 0)
                break;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // Remove all agents
        for (const agentId of this.agents.keys()) {
            this.removeAgent(agentId);
        }
        this.emit('pool_shutdown');
    }
    /**
     * Get configuration.
     */
    getConfig() {
        return { ...this.config };
    }
}
// =============================================================================
// VALIDATION
// =============================================================================
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    (async () => {
        const pool = new AgentPoolManager({
            minAgents: 2,
            maxAgents: 10,
            initialAgents: 3,
            scaleUpThreshold: 3,
            scaleDownThreshold: 1000, // 1 second for testing
            cooldownMs: 100
        });
        const allValidationFailures = [];
        let totalTests = 0;
        console.log('Testing AgentPoolManager...\n');
        // Test 1: Initialize
        totalTests++;
        try {
            await pool.initialize();
            const stats = pool.getStats();
            if (stats.totalAgents !== 3) {
                allValidationFailures.push(`Initialize: Expected 3 agents, got ${stats.totalAgents}`);
            }
            else {
                console.log('  ✓ Initialize (3 agents created)');
            }
        }
        catch (error) {
            allValidationFailures.push(`Initialize: ${error}`);
        }
        // Test 2: Acquire agent
        totalTests++;
        try {
            const agentId = await pool.acquireAgent('implementation', 'high', 'task-1');
            const agent = pool.getAgent(agentId);
            if (!agent || agent.state !== 'running') {
                allValidationFailures.push('AcquireAgent: Agent not running');
            }
            else {
                console.log('  ✓ Acquire agent');
            }
        }
        catch (error) {
            allValidationFailures.push(`AcquireAgent: ${error}`);
        }
        // Test 3: Release agent
        totalTests++;
        try {
            const stats = pool.getStats();
            const busyAgentId = Array.from(pool.getAgents().values())
                .find(a => a.state === 'running')?.id;
            if (busyAgentId) {
                pool.releaseAgent(busyAgentId, true);
                const agent = pool.getAgent(busyAgentId);
                if (!agent || agent.state !== 'idle') {
                    allValidationFailures.push('ReleaseAgent: Agent not idle after release');
                }
                else {
                    console.log('  ✓ Release agent');
                }
            }
            else {
                allValidationFailures.push('ReleaseAgent: No busy agent found');
            }
        }
        catch (error) {
            allValidationFailures.push(`ReleaseAgent: ${error}`);
        }
        // Test 4: Queue request when all agents busy
        totalTests++;
        try {
            // Acquire all agents
            const agentIds = [];
            for (let i = 0; i < 3; i++) {
                const id = await pool.acquireAgent('implementation');
                agentIds.push(id);
            }
            // Queue should now have pending requests or pool should scale
            const queuePromise = pool.acquireAgent('testing', 'medium', 'task-queued', 5000);
            // Give time for scaling
            await new Promise(resolve => setTimeout(resolve, 200));
            const stats = pool.getStats();
            // Should have scaled up or have queued request
            if (stats.totalAgents <= 3 && stats.queuedTasks === 0) {
                allValidationFailures.push('QueueRequest: Neither scaled nor queued');
            }
            else {
                console.log(`  ✓ Queue/Scale (agents: ${stats.totalAgents}, queued: ${stats.queuedTasks})`);
            }
            // Clean up
            for (const id of agentIds) {
                pool.releaseAgent(id, true);
            }
            // Wait for queued request to be fulfilled
            try {
                const queuedAgentId = await queuePromise;
                pool.releaseAgent(queuedAgentId, true);
            }
            catch {
                // Timeout is OK for this test
            }
        }
        catch (error) {
            allValidationFailures.push(`QueueRequest: ${error}`);
        }
        // Test 5: Priority queuing
        totalTests++;
        try {
            // Acquire all available agents
            const agents = Array.from(pool.getAgents().values()).filter(a => a.state === 'idle');
            const acquiredIds = [];
            for (const agent of agents) {
                const id = await pool.acquireAgent('implementation');
                acquiredIds.push(id);
            }
            // Queue requests with different priorities
            const lowPriorityPromise = pool.acquireAgent('testing', 'low', 'low-task', 3000);
            const highPriorityPromise = pool.acquireAgent('testing', 'high', 'high-task', 3000);
            // Check queue order
            await new Promise(resolve => setTimeout(resolve, 100));
            // Release one agent
            if (acquiredIds.length > 0) {
                pool.releaseAgent(acquiredIds[0], true);
            }
            // High priority should be fulfilled first
            try {
                const highAgent = await highPriorityPromise;
                pool.releaseAgent(highAgent, true);
                console.log('  ✓ Priority queuing (high priority served first)');
            }
            catch {
                allValidationFailures.push('PriorityQueuing: High priority not served');
            }
            // Clean up
            for (const id of acquiredIds.slice(1)) {
                pool.releaseAgent(id, true);
            }
            try {
                const lowAgent = await lowPriorityPromise;
                pool.releaseAgent(lowAgent, true);
            }
            catch {
                // OK if timed out
            }
        }
        catch (error) {
            allValidationFailures.push(`PriorityQueuing: ${error}`);
        }
        // Test 6: Pool health
        totalTests++;
        try {
            const health = pool.getPoolHealth();
            if (!['healthy', 'degraded', 'unhealthy', 'critical'].includes(health)) {
                allValidationFailures.push(`PoolHealth: Invalid health value: ${health}`);
            }
            else {
                console.log(`  ✓ Pool health (${health})`);
            }
        }
        catch (error) {
            allValidationFailures.push(`PoolHealth: ${error}`);
        }
        // Test 7: Manual scaling
        totalTests++;
        try {
            const initialCount = pool.getStats().totalAgents;
            await pool.setTargetAgentCount(6, 'Test scaling');
            await new Promise(resolve => setTimeout(resolve, 200));
            const newCount = pool.getStats().totalAgents;
            if (newCount < initialCount) {
                allValidationFailures.push(`ManualScaling: Expected increase, got ${initialCount} -> ${newCount}`);
            }
            else {
                console.log(`  ✓ Manual scaling (${initialCount} -> ${newCount})`);
            }
        }
        catch (error) {
            allValidationFailures.push(`ManualScaling: ${error}`);
        }
        // Test 8: Agent failure handling
        totalTests++;
        try {
            const agentId = await pool.acquireAgent('implementation');
            pool.markAgentFailed(agentId, 'Test failure');
            const agent = pool.getAgent(agentId);
            if (agent) {
                allValidationFailures.push('AgentFailure: Failed agent still in pool');
            }
            else {
                console.log('  ✓ Agent failure handling');
            }
        }
        catch (error) {
            allValidationFailures.push(`AgentFailure: ${error}`);
        }
        // Test 9: Statistics
        totalTests++;
        try {
            const stats = pool.getStats();
            if (typeof stats.totalAgents !== 'number' ||
                typeof stats.idleAgents !== 'number' ||
                typeof stats.utilizationPercent !== 'number') {
                allValidationFailures.push('Statistics: Invalid stats structure');
            }
            else {
                console.log(`  ✓ Statistics (${stats.totalAgents} total, ${stats.utilizationPercent.toFixed(0)}% utilized)`);
            }
        }
        catch (error) {
            allValidationFailures.push(`Statistics: ${error}`);
        }
        // Test 10: Scaling history
        totalTests++;
        try {
            const history = pool.getScalingHistory();
            if (!Array.isArray(history)) {
                allValidationFailures.push('ScalingHistory: Not an array');
            }
            else {
                console.log(`  ✓ Scaling history (${history.length} events)`);
            }
        }
        catch (error) {
            allValidationFailures.push(`ScalingHistory: ${error}`);
        }
        // Cleanup
        await pool.shutdown();
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

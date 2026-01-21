#!/usr/bin/env node
/**
 * MeshSeeks Real-Time Status Board - stderr version for Claude Code
 *
 * Outputs status updates to stderr so they appear in Claude Code terminal
 * Enhanced for swarm-scale operations (100+ agents, hierarchical tasks)
 *
 * @author Claude Code
 * @version 2.0.0
 */
import { performance } from 'perf_hooks';
class MeshStatusBoard {
    agents = new Map();
    tasks = new Map();
    startTime = performance.now();
    updateInterval = null;
    isDisplayActive = false;
    lastDisplayUpdate = 0;
    lastFullDisplay = 0;
    // Swarm-scale tracking
    swarmSessions = new Map();
    hierarchicalTasks = new Map();
    recentJudgeVerdicts = [];
    checkpointHistory = [];
    isSwarmMode = false;
    // Role emoji mapping including extended roles
    roleEmojis = {
        analysis: '🔍',
        implementation: '⚙️',
        testing: '🧪',
        documentation: '📝',
        debugging: '🐛',
        planner: '🗂️',
        judge: '⚖️',
        synthesizer: '🔀',
        monitor: '📡'
    };
    constructor() {
        // Initialize with emoji indicators for better visual feedback
        console.error('\n🟦 MeshSeeks Status Board Initialized (stderr output)\n');
        this.startStatusDisplay();
    }
    // ===========================================================================
    // SWARM SESSION MANAGEMENT
    // ===========================================================================
    /**
     * Enable swarm mode for large-scale visualization.
     */
    enableSwarmMode() {
        this.isSwarmMode = true;
        this.logEvent('🐝 Swarm mode enabled - scaling for 100+ agents');
    }
    /**
     * Register a swarm session.
     */
    registerSwarmSession(session) {
        this.swarmSessions.set(session.id, session);
        this.logEvent(`🐝 Swarm session started: ${session.name} (${session.id})`);
        if (!this.isSwarmMode) {
            this.enableSwarmMode();
        }
    }
    /**
     * Update swarm session status.
     */
    updateSwarmSession(sessionId, updates) {
        const session = this.swarmSessions.get(sessionId);
        if (session) {
            Object.assign(session, updates);
            // Log significant status changes
            if (updates.status === 'completed') {
                this.logEvent(`✅ Swarm session completed: ${session.name}`);
            }
            else if (updates.status === 'paused') {
                this.logEvent(`⏸️  Swarm session paused: ${session.name}`);
            }
            else if (updates.status === 'failed') {
                this.logEvent(`❌ Swarm session failed: ${session.name}`);
            }
        }
    }
    /**
     * Record a checkpoint.
     */
    recordCheckpoint(checkpointId, sessionId) {
        this.checkpointHistory.push({
            id: checkpointId,
            sessionId,
            time: Date.now()
        });
        // Keep only last 20 checkpoints
        if (this.checkpointHistory.length > 20) {
            this.checkpointHistory = this.checkpointHistory.slice(-20);
        }
        // Update session's last checkpoint
        const session = this.swarmSessions.get(sessionId);
        if (session) {
            session.lastCheckpoint = checkpointId;
        }
        this.logEvent(`💾 Checkpoint created: ${checkpointId.substring(0, 8)}...`);
    }
    /**
     * Record a judge verdict.
     */
    recordJudgeVerdict(taskId, verdict, confidence) {
        this.recentJudgeVerdicts.push({
            taskId,
            verdict,
            confidence,
            time: Date.now()
        });
        // Keep only last 20 verdicts
        if (this.recentJudgeVerdicts.length > 20) {
            this.recentJudgeVerdicts = this.recentJudgeVerdicts.slice(-20);
        }
        const icon = verdict ? '✅' : '🔄';
        this.logEvent(`⚖️  Judge verdict for ${taskId}: ${icon} (${(confidence * 100).toFixed(0)}% confidence)`);
    }
    // ===========================================================================
    // HIERARCHICAL TASK TRACKING
    // ===========================================================================
    /**
     * Register a hierarchical task relationship.
     */
    registerHierarchicalTask(taskId, parentId, depth) {
        this.hierarchicalTasks.set(taskId, {
            parentId,
            depth,
            children: []
        });
        // Update parent's children list
        if (parentId) {
            const parent = this.hierarchicalTasks.get(parentId);
            if (parent) {
                parent.children.push(taskId);
            }
        }
    }
    /**
     * Get task depth for display.
     */
    getTaskDepth(taskId) {
        const taskInfo = this.hierarchicalTasks.get(taskId);
        return taskInfo?.depth ?? 0;
    }
    // ===========================================================================
    // AGENT MANAGEMENT
    // ===========================================================================
    registerAgent(id, role) {
        this.agents.set(id, {
            id,
            role,
            status: 'idle',
            lastUpdate: Date.now()
        });
        const emoji = this.roleEmojis[role] || '🤖';
        this.logEvent(`${emoji} Agent ${id.substring(0, 8)}... (${role}) registered`);
    }
    updateAgentStatus(id, status, currentTask, progress) {
        const agent = this.agents.get(id);
        if (agent) {
            agent.status = status;
            agent.currentTask = currentTask;
            agent.progress = progress;
            agent.lastUpdate = Date.now();
            if (status === 'working' && !agent.startTime) {
                agent.startTime = performance.now();
            }
            this.logEvent(`🔄 Agent ${id}: ${status}${currentTask ? ` - ${currentTask}` : ''}`);
        }
    }
    removeAgent(id) {
        this.agents.delete(id);
        this.logEvent(`📤 Agent ${id} removed`);
    }
    // Task Management
    addTask(id, name, dependencies = []) {
        this.tasks.set(id, {
            id,
            name,
            status: 'pending',
            progress: 0,
            dependencies
        });
        this.logEvent(`📋 Task added: ${name} (${id})`);
    }
    updateTaskStatus(id, status, progress = 0, assignedAgent, error) {
        const task = this.tasks.get(id);
        if (task) {
            const oldStatus = task.status;
            task.status = status;
            task.progress = progress;
            task.assignedAgent = assignedAgent;
            task.error = error;
            if (status === 'running' && oldStatus !== 'running') {
                task.startTime = performance.now();
                this.logEvent(`🚀 Task started: ${task.name} (${assignedAgent})`);
            }
            else if (status === 'completed' && oldStatus !== 'completed') {
                task.endTime = performance.now();
                this.logEvent(`✅ Task completed: ${task.name} in ${this.formatDuration(task.endTime - (task.startTime || 0))}`);
            }
            else if (status === 'failed') {
                task.endTime = performance.now();
                this.logEvent(`❌ Task failed: ${task.name} - ${error || 'Unknown error'}`);
            }
        }
    }
    // Status Display for stderr
    startStatusDisplay() {
        if (this.updateInterval)
            return;
        this.isDisplayActive = true;
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 2000); // Update every 2 seconds for stderr (less frequent to avoid spam)
        // Initial display
        this.updateDisplay();
    }
    updateDisplay() {
        if (!this.isDisplayActive)
            return;
        const now = Date.now();
        if (now - this.lastDisplayUpdate < 1500)
            return; // Throttle updates
        this.lastDisplayUpdate = now;
        // Show full status every 10 seconds, otherwise just show quick summary
        const showFullStatus = now - this.lastFullDisplay > 10000;
        if (showFullStatus) {
            this.lastFullDisplay = now;
            this.displayFullStatus();
        }
        else {
            this.displayQuickStatus();
        }
    }
    displayFullStatus() {
        const metrics = this.calculateMetrics();
        if (this.isSwarmMode) {
            this.displaySwarmStatus(metrics);
        }
        else {
            this.displayStandardStatus(metrics);
        }
    }
    displayStandardStatus(metrics) {
        console.error('\n=== 🟦 MeshSeeks Network Status ===');
        console.error(`⏱️  Uptime: ${this.formatDuration(metrics.uptime)}`);
        console.error(`🤖 Active Agents: ${metrics.activeAgents}/${this.agents.size}`);
        console.error(`📊 Tasks: ${metrics.completedTasks}/${metrics.totalTasks} completed`);
        console.error(`⚡ Throughput: ${metrics.throughput.toFixed(1)} tasks/min`);
        if (metrics.totalTasks > 0) {
            const percentage = ((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1);
            const progressBar = this.createSimpleProgressBar(metrics.completedTasks / metrics.totalTasks, 20);
            console.error(`📈 Progress: ${progressBar} ${percentage}%`);
        }
        // Show active agents
        const activeAgents = Array.from(this.agents.values()).filter(a => a.status === 'working');
        if (activeAgents.length > 0) {
            console.error('\n🤖 Active Agents:');
            for (const agent of activeAgents.slice(0, 3)) {
                const task = agent.currentTask || 'No task';
                const emoji = this.roleEmojis[agent.role] || '🤖';
                console.error(`  ${emoji} ${agent.id.substring(0, 8)}... (${agent.role}): ${task}`);
            }
            if (activeAgents.length > 3) {
                console.error(`  ... and ${activeAgents.length - 3} more agents working`);
            }
        }
        // Show running tasks
        const runningTasks = Array.from(this.tasks.values()).filter(t => t.status === 'running');
        if (runningTasks.length > 0) {
            console.error('\n🔄 Running Tasks:');
            for (const task of runningTasks.slice(0, 3)) {
                const progress = `${task.progress}%`;
                console.error(`  📋 ${task.name}: ${progress} (${task.assignedAgent || 'unassigned'})`);
            }
            if (runningTasks.length > 3) {
                console.error(`  ... and ${runningTasks.length - 3} more tasks running`);
            }
        }
        console.error('================================\n');
    }
    displaySwarmStatus(metrics) {
        console.error('\n╔════════════════════════════════════════════════════════════════╗');
        console.error('║           🐝 MESHSEEKS SWARM STATUS BOARD 🐝                   ║');
        console.error('╠════════════════════════════════════════════════════════════════╣');
        // Overall metrics row
        console.error(`║ ⏱️  Uptime: ${this.formatDuration(metrics.uptime).padEnd(12)} │ 🤖 Agents: ${String(metrics.activeAgents).padStart(3)}/${String(this.agents.size).padStart(3)}         ║`);
        console.error(`║ 📊 Tasks: ${String(metrics.completedTasks).padStart(4)}/${String(metrics.totalTasks).padStart(4)}      │ ⚡ ${metrics.throughput.toFixed(1).padStart(6)} tasks/min      ║`);
        // Progress bar
        if (metrics.totalTasks > 0) {
            const percentage = (metrics.completedTasks / metrics.totalTasks) * 100;
            const progressBar = this.createSimpleProgressBar(metrics.completedTasks / metrics.totalTasks, 40);
            console.error(`║ ${progressBar} ${percentage.toFixed(1).padStart(5)}% ║`);
        }
        // Swarm sessions
        const activeSessions = Array.from(this.swarmSessions.values()).filter(s => s.status === 'active');
        if (activeSessions.length > 0) {
            console.error('╠────────────────────────────────────────────────────────────────╣');
            console.error('║ 🐝 ACTIVE SWARM SESSIONS                                       ║');
            for (const session of activeSessions.slice(0, 3)) {
                const sessionProgress = session.totalTasks > 0
                    ? ((session.completedTasks / session.totalTasks) * 100).toFixed(0)
                    : '0';
                const depthIndicator = `D${session.currentDepth}/${session.maxDepth}`;
                const name = session.name.substring(0, 20).padEnd(20);
                console.error(`║   📦 ${name} ${sessionProgress.padStart(3)}% │ ${depthIndicator} │ 🤖 ${session.activeAgents}  ║`);
            }
            if (activeSessions.length > 3) {
                console.error(`║   ... and ${activeSessions.length - 3} more active sessions                          ║`);
            }
        }
        // Agent distribution by role
        const agentsByRole = this.getAgentDistribution();
        if (Object.keys(agentsByRole).length > 0) {
            console.error('╠────────────────────────────────────────────────────────────────╣');
            console.error('║ 🤖 AGENT DISTRIBUTION BY ROLE                                  ║');
            const roleEntries = Object.entries(agentsByRole);
            const row1 = roleEntries.slice(0, 5).map(([role, count]) => `${this.roleEmojis[role] || '🤖'}${count}`).join(' ');
            const row2 = roleEntries.slice(5, 10).map(([role, count]) => `${this.roleEmojis[role] || '🤖'}${count}`).join(' ');
            console.error(`║   ${row1.padEnd(60)} ║`);
            if (row2) {
                console.error(`║   ${row2.padEnd(60)} ║`);
            }
        }
        // Recent judge verdicts
        if (this.recentJudgeVerdicts.length > 0) {
            console.error('╠────────────────────────────────────────────────────────────────╣');
            console.error('║ ⚖️  RECENT JUDGE VERDICTS                                       ║');
            const recentVerdicts = this.recentJudgeVerdicts.slice(-3);
            const passCount = recentVerdicts.filter(v => v.verdict).length;
            const avgConfidence = recentVerdicts.reduce((sum, v) => sum + v.confidence, 0) / recentVerdicts.length;
            console.error(`║   Pass rate: ${passCount}/${recentVerdicts.length} │ Avg confidence: ${(avgConfidence * 100).toFixed(0)}%             ║`);
        }
        // Recent checkpoints
        if (this.checkpointHistory.length > 0) {
            const recentCheckpoint = this.checkpointHistory[this.checkpointHistory.length - 1];
            const timeSince = this.formatDuration(Date.now() - recentCheckpoint.time);
            console.error('╠────────────────────────────────────────────────────────────────╣');
            console.error(`║ 💾 Last checkpoint: ${timeSince} ago                                ║`);
        }
        console.error('╚════════════════════════════════════════════════════════════════╝\n');
    }
    getAgentDistribution() {
        const distribution = {};
        for (const agent of this.agents.values()) {
            if (agent.status === 'working') {
                distribution[agent.role] = (distribution[agent.role] || 0) + 1;
            }
        }
        return distribution;
    }
    displayQuickStatus() {
        const metrics = this.calculateMetrics();
        const activeAgents = Array.from(this.agents.values()).filter(a => a.status === 'working');
        // Single line status update
        const progress = metrics.totalTasks > 0
            ? `${((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(0)}%`
            : '0%';
        if (this.isSwarmMode) {
            // Swarm mode: more compact display for high-agent scenarios
            const activeSessions = this.swarmSessions.size;
            const judgePassRate = this.recentJudgeVerdicts.length > 0
                ? `${Math.round((this.recentJudgeVerdicts.filter(v => v.verdict).length / this.recentJudgeVerdicts.length) * 100)}%`
                : '-';
            console.error(`🐝 Swarm: ${activeAgents.length}🤖 | ` +
                `${metrics.completedTasks}/${metrics.totalTasks} (${progress}) | ` +
                `⚖️ ${judgePassRate} | ` +
                `📦 ${activeSessions} sessions`);
        }
        else {
            console.error(`🟦 Mesh: ${activeAgents.length} agents working | ` +
                `Tasks: ${metrics.completedTasks}/${metrics.totalTasks} (${progress}) | ` +
                `${metrics.throughput.toFixed(1)}/min`);
        }
    }
    calculateMetrics() {
        const now = performance.now();
        const uptime = now - this.startTime;
        const tasks = Array.from(this.tasks.values());
        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const failedTasks = tasks.filter(t => t.status === 'failed').length;
        const totalTasks = tasks.length;
        const completedTaskTimes = tasks
            .filter(t => t.status === 'completed' && t.startTime && t.endTime)
            .map(t => t.endTime - t.startTime);
        const avgTaskTime = completedTaskTimes.length > 0
            ? completedTaskTimes.reduce((sum, time) => sum + time, 0) / completedTaskTimes.length
            : 0;
        const throughput = uptime > 0 ? (completedTasks / (uptime / 1000)) * 60 : 0; // tasks per minute
        return {
            activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'working').length,
            completedTasks,
            failedTasks,
            totalTasks,
            avgTaskTime,
            throughput,
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
            uptime
        };
    }
    createSimpleProgressBar(progress, width) {
        const filled = Math.round(progress * width);
        const empty = width - filled;
        return '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
    }
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h${minutes % 60}m`;
        }
        else if (minutes > 0) {
            return `${minutes}m${seconds % 60}s`;
        }
        else {
            return `${seconds}s`;
        }
    }
    // Event logging for recent activity
    eventLog = [];
    logEvent(message) {
        const timestamp = Date.now();
        this.eventLog.push({ timestamp, message });
        // Keep only last 50 events
        if (this.eventLog.length > 50) {
            this.eventLog = this.eventLog.slice(-50);
        }
        // Log important events immediately to stderr
        if (message.includes('✅') || message.includes('❌') || message.includes('🚀')) {
            console.error(`[${new Date(timestamp).toLocaleTimeString()}] ${message}`);
        }
    }
    // Public API for external updates
    setTaskProgress(taskId, progress) {
        const task = this.tasks.get(taskId);
        if (task && task.status === 'running') {
            task.progress = Math.max(0, Math.min(100, progress));
        }
    }
    addProgressUpdate(message) {
        this.logEvent(`📈 ${message}`);
    }
    showError(message) {
        console.error(`❌ ERROR: ${message}`);
        this.logEvent(`❌ ERROR: ${message}`);
    }
    showWarning(message) {
        console.error(`⚠️  WARNING: ${message}`);
        this.logEvent(`⚠️  WARNING: ${message}`);
    }
    showSuccess(message) {
        console.error(`✅ SUCCESS: ${message}`);
        this.logEvent(`✅ SUCCESS: ${message}`);
    }
    // Cleanup
    stop() {
        this.isDisplayActive = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        console.error('\n🟦 MeshSeeks Status Board Stopped\n');
    }
    // Get current status for external queries
    getStatus() {
        const baseStatus = {
            agents: Array.from(this.agents.values()),
            tasks: Array.from(this.tasks.values()),
            metrics: this.calculateMetrics(),
            recentActivity: this.eventLog.slice(-10).map(e => ({
                time: new Date(e.timestamp).toLocaleTimeString(),
                message: e.message
            }))
        };
        if (this.isSwarmMode) {
            return {
                ...baseStatus,
                isSwarmMode: true,
                swarmSessions: Array.from(this.swarmSessions.values()),
                hierarchicalTaskCount: this.hierarchicalTasks.size,
                recentJudgeVerdicts: this.recentJudgeVerdicts.slice(-5),
                recentCheckpoints: this.checkpointHistory.slice(-5),
                agentDistribution: this.getAgentDistribution()
            };
        }
        return baseStatus;
    }
    /**
     * Get swarm-specific metrics.
     */
    getSwarmMetrics() {
        const agents = Array.from(this.agents.values());
        const activeAgents = agents.filter(a => a.status === 'working').length;
        const judgePassRate = this.recentJudgeVerdicts.length > 0
            ? this.recentJudgeVerdicts.filter(v => v.verdict).length / this.recentJudgeVerdicts.length
            : 0;
        const depths = Array.from(this.hierarchicalTasks.values()).map(t => t.depth);
        const avgTaskDepth = depths.length > 0
            ? depths.reduce((sum, d) => sum + d, 0) / depths.length
            : 0;
        return {
            activeSessions: Array.from(this.swarmSessions.values()).filter(s => s.status === 'active').length,
            totalAgents: agents.length,
            activeAgents,
            judgePassRate,
            avgTaskDepth,
            checkpointCount: this.checkpointHistory.length
        };
    }
    // Batch updates for efficiency
    batchUpdate(updates) {
        if (updates.agents) {
            for (const update of updates.agents) {
                this.updateAgentStatus(update.id, update.status, update.task, update.progress);
            }
        }
        if (updates.tasks) {
            for (const update of updates.tasks) {
                this.updateTaskStatus(update.id, update.status, update.progress, update.agent);
            }
        }
        if (updates.events) {
            for (const event of updates.events) {
                this.logEvent(event);
            }
        }
    }
}
// Singleton instance for global access
let globalStatusBoard = null;
export function getStatusBoard() {
    if (!globalStatusBoard) {
        globalStatusBoard = new MeshStatusBoard();
    }
    return globalStatusBoard;
}
export function stopStatusBoard() {
    if (globalStatusBoard) {
        globalStatusBoard.stop();
        globalStatusBoard = null;
    }
}
export { MeshStatusBoard };

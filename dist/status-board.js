#!/usr/bin/env node
/**
 * MeshSeeks Real-Time Status Board
 *
 * Provides live updates and visual feedback for mesh network operations,
 * preventing the appearance of hanging or frozen processes.
 *
 * @author Claude Code
 * @version 1.0.0
 */
import { performance } from 'perf_hooks';
class MeshStatusBoard {
    agents = new Map();
    tasks = new Map();
    startTime = performance.now();
    updateInterval = null;
    isDisplayActive = false;
    lastDisplayUpdate = 0;
    displayBuffer = [];
    constructor() {
        // Initialize with emoji indicators for better visual feedback
        console.log('\n🟦 MeshSeeks Status Board Initialized');
        this.startStatusDisplay();
    }
    // Agent Management
    registerAgent(id, role) {
        this.agents.set(id, {
            id,
            role,
            status: 'idle',
            lastUpdate: Date.now()
        });
        this.logEvent(`🤖 Agent ${id} (${role}) registered`);
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
    // Status Display
    startStatusDisplay() {
        if (this.updateInterval)
            return;
        this.isDisplayActive = true;
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 1000); // Update every second
        // Initial display
        this.updateDisplay();
    }
    updateDisplay() {
        if (!this.isDisplayActive)
            return;
        const now = Date.now();
        if (now - this.lastDisplayUpdate < 500)
            return; // Throttle updates
        this.lastDisplayUpdate = now;
        // Clear previous output (move cursor up and clear lines)
        if (this.displayBuffer.length > 0) {
            process.stdout.write('\x1b[' + this.displayBuffer.length + 'A');
            process.stdout.write('\x1b[0J');
        }
        const display = this.generateDisplay();
        this.displayBuffer = display.split('\n');
        console.log(display);
    }
    generateDisplay() {
        const lines = [];
        const metrics = this.calculateMetrics();
        // Header with overall status
        lines.push('┌─────────────────────────────────────────────────────────────────────┐');
        lines.push('│ 🟦 MeshSeeks Multi-Agent Network Status                              │');
        lines.push('├─────────────────────────────────────────────────────────────────────┤');
        // Metrics summary
        lines.push(`│ ⏱️  Uptime: ${this.formatDuration(metrics.uptime)}  │  🤖 Agents: ${metrics.activeAgents}  │  📊 Tasks: ${metrics.completedTasks}/${metrics.totalTasks}  │  ⚡ ${metrics.throughput.toFixed(1)}/min │`);
        if (metrics.totalTasks > 0) {
            const progressBar = this.createProgressBar(metrics.completedTasks / metrics.totalTasks, 30);
            lines.push(`│ Overall Progress: ${progressBar} ${((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1)}%               │`);
        }
        lines.push('├─────────────────────────────────────────────────────────────────────┤');
        // Active agents section
        if (this.agents.size > 0) {
            lines.push('│ 🤖 ACTIVE AGENTS                                                     │');
            lines.push('├─────────────────────────────────────────────────────────────────────┤');
            const sortedAgents = Array.from(this.agents.values()).sort((a, b) => a.id.localeCompare(b.id));
            for (const agent of sortedAgents.slice(0, 5)) { // Show max 5 agents
                const statusIcon = this.getAgentStatusIcon(agent.status);
                const role = agent.role.padEnd(12);
                const task = agent.currentTask ? agent.currentTask.substring(0, 25) + '...' : 'Idle';
                const duration = agent.startTime ? this.formatDuration(performance.now() - agent.startTime) : '';
                lines.push(`│ ${statusIcon} ${agent.id.substring(0, 8).padEnd(8)} ${role} ${task.padEnd(28)} ${duration.padStart(8)} │`);
            }
            if (this.agents.size > 5) {
                lines.push(`│ ... and ${this.agents.size - 5} more agents                                           │`);
            }
            lines.push('├─────────────────────────────────────────────────────────────────────┤');
        }
        // Task queue section
        if (this.tasks.size > 0) {
            lines.push('│ 📋 TASK QUEUE                                                        │');
            lines.push('├─────────────────────────────────────────────────────────────────────┤');
            const activeTasks = Array.from(this.tasks.values())
                .filter(t => t.status === 'running' || t.status === 'pending')
                .sort((a, b) => {
                if (a.status !== b.status) {
                    return a.status === 'running' ? -1 : 1;
                }
                return a.id.localeCompare(b.id);
            });
            for (const task of activeTasks.slice(0, 6)) { // Show max 6 tasks
                const statusIcon = this.getTaskStatusIcon(task.status);
                const name = task.name.substring(0, 35) + (task.name.length > 35 ? '...' : '');
                const agent = task.assignedAgent ? task.assignedAgent.substring(0, 8) : 'unassigned';
                const progress = task.status === 'running' ? this.createProgressBar(task.progress / 100, 10) : '          ';
                lines.push(`│ ${statusIcon} ${name.padEnd(38)} ${agent.padEnd(10)} ${progress} │`);
            }
            if (activeTasks.length === 0) {
                lines.push('│ No active tasks                                                     │');
            }
            else if (activeTasks.length > 6) {
                lines.push(`│ ... and ${activeTasks.length - 6} more tasks in queue                                    │`);
            }
            lines.push('├─────────────────────────────────────────────────────────────────────┤');
        }
        // Recent activity
        const recentLogs = this.getRecentLogs(3);
        if (recentLogs.length > 0) {
            lines.push('│ 📝 RECENT ACTIVITY                                                   │');
            lines.push('├─────────────────────────────────────────────────────────────────────┤');
            for (const log of recentLogs) {
                const truncated = log.substring(0, 67) + (log.length > 67 ? '...' : '');
                lines.push(`│ ${truncated.padEnd(69)} │`);
            }
            lines.push('├─────────────────────────────────────────────────────────────────────┤');
        }
        // Footer with tips
        lines.push('│ 💡 Press Ctrl+C to stop  │  Updates every 1s  │  🔄 Live Status    │');
        lines.push('└─────────────────────────────────────────────────────────────────────┘');
        return lines.join('\n');
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
    getAgentStatusIcon(status) {
        switch (status) {
            case 'idle': return '💤';
            case 'working': return '⚡';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'waiting': return '⏳';
            default: return '❓';
        }
    }
    getTaskStatusIcon(status) {
        switch (status) {
            case 'pending': return '⏳';
            case 'running': return '🔄';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'blocked': return '🚫';
            default: return '❓';
        }
    }
    createProgressBar(progress, width) {
        const filled = Math.round(progress * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
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
        this.eventLog.push({
            timestamp: Date.now(),
            message
        });
        // Keep only last 50 events
        if (this.eventLog.length > 50) {
            this.eventLog = this.eventLog.slice(-50);
        }
    }
    getRecentLogs(count) {
        return this.eventLog
            .slice(-count)
            .map(event => {
            const time = new Date(event.timestamp).toLocaleTimeString();
            return `${time} ${event.message}`;
        });
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
        this.logEvent(`❌ ERROR: ${message}`);
    }
    showWarning(message) {
        this.logEvent(`⚠️  WARNING: ${message}`);
    }
    showSuccess(message) {
        this.logEvent(`✅ SUCCESS: ${message}`);
    }
    // Cleanup
    stop() {
        this.isDisplayActive = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        // Clear the status board display
        if (this.displayBuffer.length > 0) {
            process.stdout.write('\x1b[' + this.displayBuffer.length + 'A');
            process.stdout.write('\x1b[0J');
        }
        console.log('🟦 MeshSeeks Status Board Stopped\n');
    }
    // Get current status for external queries
    getStatus() {
        return {
            agents: Array.from(this.agents.values()),
            tasks: Array.from(this.tasks.values()),
            metrics: this.calculateMetrics(),
            recentActivity: this.getRecentLogs(10)
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

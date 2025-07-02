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

interface AgentStatus {
  id: string;
  role: 'analysis' | 'implementation' | 'testing' | 'documentation' | 'debugging';
  status: 'idle' | 'working' | 'completed' | 'failed' | 'waiting';
  currentTask?: string;
  progress?: number;
  startTime?: number;
  lastUpdate?: number;
}

interface TaskStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  assignedAgent?: string;
  progress: number;
  startTime?: number;
  endTime?: number;
  dependencies?: string[];
  error?: string;
}

interface MeshMetrics {
  activeAgents: number;
  completedTasks: number;
  failedTasks: number;
  totalTasks: number;
  avgTaskTime: number;
  throughput: number;
  memoryUsage: number;
  uptime: number;
}

class MeshStatusBoard {
  private agents: Map<string, AgentStatus> = new Map();
  private tasks: Map<string, TaskStatus> = new Map();
  private startTime: number = performance.now();
  private updateInterval: NodeJS.Timeout | null = null;
  private isDisplayActive: boolean = false;
  private lastDisplayUpdate: number = 0;
  private displayBuffer: string[] = [];

  constructor() {
    // Initialize with emoji indicators for better visual feedback
    console.log('\n🟦 MeshSeeks Status Board Initialized');
    this.startStatusDisplay();
  }

  // Agent Management
  registerAgent(id: string, role: AgentStatus['role']): void {
    this.agents.set(id, {
      id,
      role,
      status: 'idle',
      lastUpdate: Date.now()
    });
    this.logEvent(`🤖 Agent ${id} (${role}) registered`);
  }

  updateAgentStatus(id: string, status: AgentStatus['status'], currentTask?: string, progress?: number): void {
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

  removeAgent(id: string): void {
    this.agents.delete(id);
    this.logEvent(`📤 Agent ${id} removed`);
  }

  // Task Management
  addTask(id: string, name: string, dependencies: string[] = []): void {
    this.tasks.set(id, {
      id,
      name,
      status: 'pending',
      progress: 0,
      dependencies
    });
    this.logEvent(`📋 Task added: ${name} (${id})`);
  }

  updateTaskStatus(id: string, status: TaskStatus['status'], progress: number = 0, assignedAgent?: string, error?: string): void {
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
      } else if (status === 'completed' && oldStatus !== 'completed') {
        task.endTime = performance.now();
        this.logEvent(`✅ Task completed: ${task.name} in ${this.formatDuration(task.endTime - (task.startTime || 0))}`);
      } else if (status === 'failed') {
        task.endTime = performance.now();
        this.logEvent(`❌ Task failed: ${task.name} - ${error || 'Unknown error'}`);
      }
    }
  }

  // Status Display
  private startStatusDisplay(): void {
    if (this.updateInterval) return;
    
    this.isDisplayActive = true;
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 1000); // Update every second
    
    // Initial display
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (!this.isDisplayActive) return;
    
    const now = Date.now();
    if (now - this.lastDisplayUpdate < 500) return; // Throttle updates
    
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

  private generateDisplay(): string {
    const lines: string[] = [];
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
      } else if (activeTasks.length > 6) {
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

  private calculateMetrics(): MeshMetrics {
    const now = performance.now();
    const uptime = now - this.startTime;
    
    const tasks = Array.from(this.tasks.values());
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const failedTasks = tasks.filter(t => t.status === 'failed').length;
    const totalTasks = tasks.length;
    
    const completedTaskTimes = tasks
      .filter(t => t.status === 'completed' && t.startTime && t.endTime)
      .map(t => t.endTime! - t.startTime!);
    
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

  private getAgentStatusIcon(status: AgentStatus['status']): string {
    switch (status) {
      case 'idle': return '💤';
      case 'working': return '⚡';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'waiting': return '⏳';
      default: return '❓';
    }
  }

  private getTaskStatusIcon(status: TaskStatus['status']): string {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'blocked': return '🚫';
      default: return '❓';
    }
  }

  private createProgressBar(progress: number, width: number): string {
    const filled = Math.round(progress * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Event logging for recent activity
  private eventLog: Array<{ timestamp: number; message: string }> = [];
  
  private logEvent(message: string): void {
    this.eventLog.push({
      timestamp: Date.now(),
      message
    });
    
    // Keep only last 50 events
    if (this.eventLog.length > 50) {
      this.eventLog = this.eventLog.slice(-50);
    }
  }

  private getRecentLogs(count: number): string[] {
    return this.eventLog
      .slice(-count)
      .map(event => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        return `${time} ${event.message}`;
      });
  }

  // Public API for external updates
  setTaskProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.progress = Math.max(0, Math.min(100, progress));
    }
  }

  addProgressUpdate(message: string): void {
    this.logEvent(`📈 ${message}`);
  }

  showError(message: string): void {
    this.logEvent(`❌ ERROR: ${message}`);
  }

  showWarning(message: string): void {
    this.logEvent(`⚠️  WARNING: ${message}`);
  }

  showSuccess(message: string): void {
    this.logEvent(`✅ SUCCESS: ${message}`);
  }

  // Cleanup
  stop(): void {
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
  batchUpdate(updates: {
    agents?: Array<{ id: string; status: AgentStatus['status']; task?: string; progress?: number }>;
    tasks?: Array<{ id: string; status: TaskStatus['status']; progress?: number; agent?: string }>;
    events?: string[];
  }): void {
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
let globalStatusBoard: MeshStatusBoard | null = null;

export function getStatusBoard(): MeshStatusBoard {
  if (!globalStatusBoard) {
    globalStatusBoard = new MeshStatusBoard();
  }
  return globalStatusBoard;
}

export function stopStatusBoard(): void {
  if (globalStatusBoard) {
    globalStatusBoard.stop();
    globalStatusBoard = null;
  }
}

export { MeshStatusBoard };
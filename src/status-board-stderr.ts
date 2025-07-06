#!/usr/bin/env node
/**
 * MeshSeeks Real-Time Status Board - stderr version for Claude Code
 * 
 * Outputs status updates to stderr so they appear in Claude Code terminal
 * 
 * @author Claude Code
 * @version 1.1.0
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
  private lastFullDisplay: number = 0;

  constructor() {
    // Initialize with emoji indicators for better visual feedback
    console.error('\n🟦 MeshSeeks Status Board Initialized (stderr output)\n');
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

  // Status Display for stderr
  private startStatusDisplay(): void {
    if (this.updateInterval) return;
    
    this.isDisplayActive = true;
    this.updateInterval = setInterval(() => {
      this.updateDisplay();
    }, 2000); // Update every 2 seconds for stderr (less frequent to avoid spam)
    
    // Initial display
    this.updateDisplay();
  }

  private updateDisplay(): void {
    if (!this.isDisplayActive) return;
    
    const now = Date.now();
    if (now - this.lastDisplayUpdate < 1500) return; // Throttle updates
    
    this.lastDisplayUpdate = now;
    
    // Show full status every 10 seconds, otherwise just show quick summary
    const showFullStatus = now - this.lastFullDisplay > 10000;
    if (showFullStatus) {
      this.lastFullDisplay = now;
      this.displayFullStatus();
    } else {
      this.displayQuickStatus();
    }
  }

  private displayFullStatus(): void {
    const metrics = this.calculateMetrics();
    
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
        console.error(`  ⚡ ${agent.id} (${agent.role}): ${task}`);
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

  private displayQuickStatus(): void {
    const metrics = this.calculateMetrics();
    const activeAgents = Array.from(this.agents.values()).filter(a => a.status === 'working');
    
    // Single line status update
    const progress = metrics.totalTasks > 0 
      ? `${((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(0)}%`
      : '0%';
    
    console.error(
      `🟦 Mesh: ${activeAgents.length} agents working | ` +
      `Tasks: ${metrics.completedTasks}/${metrics.totalTasks} (${progress}) | ` +
      `${metrics.throughput.toFixed(1)}/min`
    );
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

  private createSimpleProgressBar(progress: number, width: number): string {
    const filled = Math.round(progress * width);
    const empty = width - filled;
    return '[' + '='.repeat(filled) + '-'.repeat(empty) + ']';
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
    console.error(`❌ ERROR: ${message}`);
    this.logEvent(`❌ ERROR: ${message}`);
  }

  showWarning(message: string): void {
    console.error(`⚠️  WARNING: ${message}`);
    this.logEvent(`⚠️  WARNING: ${message}`);
  }

  showSuccess(message: string): void {
    console.error(`✅ SUCCESS: ${message}`);
    this.logEvent(`✅ SUCCESS: ${message}`);
  }

  // Cleanup
  stop(): void {
    this.isDisplayActive = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    console.error('\n🟦 MeshSeeks Status Board Stopped\n');
  }

  // Get current status for external queries
  getStatus() {
    return {
      agents: Array.from(this.agents.values()),
      tasks: Array.from(this.tasks.values()),
      metrics: this.calculateMetrics(),
      recentActivity: this.eventLog.slice(-10).map(e => ({
        time: new Date(e.timestamp).toLocaleTimeString(),
        message: e.message
      }))
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
#!/usr/bin/env node

/**
 * Mesh Network Monitor - Real-time CLI UI for watching agent progress
 * 
 * This creates a dashboard showing:
 * - Active agents and their current tasks
 * - Progress bars for each agent
 * - Real-time log streaming
 * - Task dependencies and completion status
 */

import blessed from 'blessed';
import { EventEmitter } from 'events';
import { readFileSync, watchFile } from 'fs';
import { join } from 'path';

class MeshMonitor extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.tasks = new Map();
    this.logs = [];
    this.screen = null;
    this.widgets = {};
  }

  init() {
    // Create blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Claude Mesh Network Monitor'
    });

    // Create layout
    this.createLayout();
    
    // Handle exit
    this.screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });

    // Start monitoring
    this.startMonitoring();
    
    this.screen.render();
  }

  createLayout() {
    // Title
    this.widgets.title = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}🌐 Claude Mesh Network Monitor{/center}',
      tags: true,
      style: {
        fg: 'cyan',
        bold: true
      }
    });

    // Agent status box
    this.widgets.agents = blessed.box({
      label: ' Active Agents ',
      top: 3,
      left: 0,
      width: '50%',
      height: '40%',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'green'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    // Task progress box
    this.widgets.tasks = blessed.box({
      label: ' Task Progress ',
      top: 3,
      left: '50%',
      width: '50%',
      height: '40%',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'yellow'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    // Log stream
    this.widgets.logs = blessed.log({
      label: ' Live Logs ',
      top: '43%',
      left: 0,
      width: '100%',
      height: '45%',
      border: {
        type: 'line'
      },
      style: {
        border: {
          fg: 'blue'
        }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      tags: true
    });

    // Status bar
    this.widgets.status = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      style: {
        fg: 'white',
        bg: 'blue'
      }
    });

    // Add all widgets to screen
    Object.values(this.widgets).forEach(widget => {
      this.screen.append(widget);
    });
  }

  startMonitoring() {
    // Watch for mesh network updates (mock implementation)
    // In real implementation, this would connect to the mesh coordinator
    
    setInterval(() => {
      this.updateDisplay();
    }, 100);

    // Simulate agent activity for demo
    this.simulateAgents();
  }

  updateDisplay() {
    // Update agents display
    let agentContent = '';
    this.agents.forEach((agent, id) => {
      const statusIcon = agent.status === 'active' ? '🟢' : '🔵';
      agentContent += `${statusIcon} ${agent.role.toUpperCase()} Agent (${id.substring(0, 8)})\n`;
      agentContent += `   Task: ${agent.currentTask || 'idle'}\n`;
      agentContent += `   Progress: ${this.createProgressBar(agent.progress)}\n\n`;
    });
    this.widgets.agents.setContent(agentContent || 'No active agents');

    // Update tasks display
    let taskContent = '';
    this.tasks.forEach((task, id) => {
      const statusIcon = task.completed ? '✅' : task.inProgress ? '⚡' : '⏳';
      taskContent += `${statusIcon} ${id}: ${task.description}\n`;
      if (task.dependencies.length > 0) {
        taskContent += `   Dependencies: ${task.dependencies.join(', ')}\n`;
      }
      taskContent += '\n';
    });
    this.widgets.tasks.setContent(taskContent || 'No tasks queued');

    // Update status bar
    const activeCount = Array.from(this.agents.values()).filter(a => a.status === 'active').length;
    const completedTasks = Array.from(this.tasks.values()).filter(t => t.completed).length;
    const totalTasks = this.tasks.size;
    
    this.widgets.status.setContent(
      ` Agents: ${activeCount}/${this.agents.size} active | ` +
      `Tasks: ${completedTasks}/${totalTasks} completed | ` +
      `Press 'q' to exit `
    );

    this.screen.render();
  }

  createProgressBar(progress) {
    const width = 20;
    const filled = Math.floor((progress / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'-'.repeat(empty)}] ${progress}%`;
  }

  simulateAgents() {
    // Simulate your redirect fix scenario
    const agents = [
      { id: 'agent-1', role: 'analysis', task: 'Searching for redirect logic' },
      { id: 'agent-2', role: 'analysis', task: 'Checking YouTube-Timecode post' },
      { id: 'agent-3', role: 'analysis', task: 'Scanning JavaScript files' },
      { id: 'agent-4', role: 'implementation', task: 'Preparing fixes' },
      { id: 'agent-5', role: 'testing', task: 'Validating changes' }
    ];

    agents.forEach((agentInfo, index) => {
      setTimeout(() => {
        this.agents.set(agentInfo.id, {
          role: agentInfo.role,
          status: 'active',
          currentTask: agentInfo.task,
          progress: 0
        });

        this.addLog(`{green-fg}[${agentInfo.role.toUpperCase()}]{/green-fg} ${agentInfo.task}`);

        // Simulate progress
        const progressInterval = setInterval(() => {
          const agent = this.agents.get(agentInfo.id);
          if (agent.progress < 100) {
            agent.progress += Math.random() * 15;
            if (agent.progress >= 100) {
              agent.progress = 100;
              agent.status = 'completed';
              this.addLog(`{cyan-fg}[COMPLETE]{/cyan-fg} ${agentInfo.id} finished: ${agentInfo.task}`);
              clearInterval(progressInterval);
            }
          }
        }, 1000);
      }, index * 2000);
    });

    // Simulate finding the issue
    setTimeout(() => {
      this.addLog('{red-fg}[FOUND]{/red-fg} Redirect in themes/san-diego/source/js/navigation.js:142');
      this.addLog('{yellow-fg}[INFO]{/yellow-fg} window.location.href hardcoded to YouTube-Timecode-Commentary');
    }, 8000);
  }

  addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    this.widgets.logs.log(`[${timestamp}] ${message}`);
  }
}

// Check if blessed is installed
try {
  require.resolve('blessed');
  const monitor = new MeshMonitor();
  monitor.init();
} catch (e) {
  console.log('📦 Installing required dependencies...');
  console.log('Run: npm install blessed');
  console.log('\nThen run this monitor with: node mesh-monitor.js');
}
#!/usr/bin/env node
/**
 * MeshSeeks Status Board Demo
 * 
 * Demonstrates the real-time status board functionality with simulated
 * mesh network operations to show live progress updates.
 * 
 * @author Claude Code
 * @version 1.0.0
 */

import { getStatusBoard, stopStatusBoard } from './status-board.js';
import { performance } from 'perf_hooks';

class StatusBoardDemo {
  private statusBoard = getStatusBoard();
  private isRunning = false;

  async runDemo(): Promise<void> {
    console.log('🟦 Starting MeshSeeks Status Board Demo');
    console.log('This demo simulates a multi-agent mesh network operation\n');
    
    this.isRunning = true;
    
    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Demo interrupted by user');
      this.stopDemo();
    });

    try {
      await this.simulateComplexProjectAnalysis();
    } catch (error) {
      console.error('Demo error:', error);
    } finally {
      this.stopDemo();
    }
  }

  private async simulateComplexProjectAnalysis(): Promise<void> {
    // Phase 1: Project Analysis
    this.statusBoard.addProgressUpdate('Starting complex e-commerce project analysis...');
    await this.delay(1000);

    // Create analysis tasks
    const analysisTasks = [
      { id: 'analyze-auth', name: 'Analyze authentication system', duration: 8000 },
      { id: 'analyze-api', name: 'Analyze API architecture', duration: 6000 },
      { id: 'analyze-database', name: 'Analyze database schema', duration: 7000 },
      { id: 'analyze-security', name: 'Security vulnerability scan', duration: 5000 }
    ];

    // Add tasks to status board
    for (const task of analysisTasks) {
      this.statusBoard.addTask(task.id, task.name, []);
    }

    // Phase 2: Spawn analysis agents
    this.statusBoard.addProgressUpdate('Spawning specialized analysis agents...');
    await this.delay(500);

    const analysisAgents = [
      { id: 'agent-auth-001', role: 'analysis' as const },
      { id: 'agent-api-002', role: 'analysis' as const },
      { id: 'agent-db-003', role: 'analysis' as const },
      { id: 'agent-sec-004', role: 'debugging' as const }
    ];

    for (const agent of analysisAgents) {
      this.statusBoard.registerAgent(agent.id, agent.role);
      await this.delay(200);
    }

    // Phase 3: Execute analysis tasks in parallel
    this.statusBoard.addProgressUpdate('Analysis agents working in parallel...');
    
    const analysisPromises = analysisTasks.map(async (task, index) => {
      const agent = analysisAgents[index];
      this.statusBoard.updateAgentStatus(agent.id, 'working', task.name, 0);
      this.statusBoard.updateTaskStatus(task.id, 'running', 0, agent.id);
      
      // Simulate gradual progress
      const progressSteps = 10;
      const stepDuration = task.duration / progressSteps;
      
      for (let step = 1; step <= progressSteps; step++) {
        await this.delay(stepDuration);
        const progress = (step / progressSteps) * 100;
        this.statusBoard.updateAgentStatus(agent.id, 'working', task.name, progress);
        this.statusBoard.setTaskProgress(task.id, progress);
      }
      
      this.statusBoard.updateAgentStatus(agent.id, 'completed', task.name, 100);
      this.statusBoard.updateTaskStatus(task.id, 'completed', 100, agent.id);
      this.statusBoard.addProgressUpdate(`✅ ${task.name} completed`);
    });

    await Promise.all(analysisPromises);
    
    // Phase 4: Implementation phase
    await this.delay(1000);
    this.statusBoard.showSuccess('Analysis phase completed! Starting implementation...');
    
    const implementationTasks = [
      { id: 'impl-auth-jwt', name: 'Implement JWT authentication', duration: 12000, deps: ['analyze-auth'] },
      { id: 'impl-api-endpoints', name: 'Create REST API endpoints', duration: 15000, deps: ['analyze-api'] },
      { id: 'impl-db-models', name: 'Create database models', duration: 10000, deps: ['analyze-database'] },
      { id: 'impl-security-middleware', name: 'Add security middleware', duration: 8000, deps: ['analyze-security'] }
    ];

    // Add implementation tasks
    for (const task of implementationTasks) {
      this.statusBoard.addTask(task.id, task.name, task.deps);
    }

    // Spawn implementation agents
    const implAgents = [
      { id: 'agent-impl-001', role: 'implementation' as const },
      { id: 'agent-impl-002', role: 'implementation' as const },
      { id: 'agent-impl-003', role: 'implementation' as const },
      { id: 'agent-impl-004', role: 'implementation' as const }
    ];

    for (const agent of implAgents) {
      this.statusBoard.registerAgent(agent.id, agent.role);
      await this.delay(300);
    }

    // Execute implementation tasks
    const implPromises = implementationTasks.map(async (task, index) => {
      const agent = implAgents[index];
      this.statusBoard.updateAgentStatus(agent.id, 'working', task.name, 0);
      this.statusBoard.updateTaskStatus(task.id, 'running', 0, agent.id);
      
      // Simulate more complex progress with occasional stalls
      const progressSteps = 20;
      const stepDuration = task.duration / progressSteps;
      
      for (let step = 1; step <= progressSteps; step++) {
        // Simulate occasional stalls (realistic for implementation)
        if (step === 8 || step === 15) {
          this.statusBoard.addProgressUpdate(`⏳ ${agent.id} debugging issue in ${task.name}...`);
          await this.delay(stepDuration * 2);
        } else {
          await this.delay(stepDuration);
        }
        
        const progress = (step / progressSteps) * 100;
        this.statusBoard.updateAgentStatus(agent.id, 'working', task.name, progress);
        this.statusBoard.setTaskProgress(task.id, progress);
      }
      
      this.statusBoard.updateAgentStatus(agent.id, 'completed', task.name, 100);
      this.statusBoard.updateTaskStatus(task.id, 'completed', 100, agent.id);
      this.statusBoard.addProgressUpdate(`✅ ${task.name} implemented successfully`);
    });

    await Promise.all(implPromises);

    // Phase 5: Testing phase
    await this.delay(1000);
    this.statusBoard.showSuccess('Implementation completed! Starting comprehensive testing...');

    const testingTasks = [
      { id: 'test-auth', name: 'Test authentication flows', duration: 9000, deps: ['impl-auth-jwt'] },
      { id: 'test-api', name: 'API integration tests', duration: 11000, deps: ['impl-api-endpoints'] },
      { id: 'test-db', name: 'Database operation tests', duration: 7000, deps: ['impl-db-models'] },
      { id: 'test-security', name: 'Security penetration tests', duration: 13000, deps: ['impl-security-middleware'] },
      { id: 'test-e2e', name: 'End-to-end user flows', duration: 16000, deps: ['impl-auth-jwt', 'impl-api-endpoints'] }
    ];

    for (const task of testingTasks) {
      this.statusBoard.addTask(task.id, task.name, task.deps);
    }

    // Spawn testing agents
    const testAgents = [
      { id: 'agent-test-001', role: 'testing' as const },
      { id: 'agent-test-002', role: 'testing' as const },
      { id: 'agent-test-003', role: 'testing' as const }
    ];

    for (const agent of testAgents) {
      this.statusBoard.registerAgent(agent.id, agent.role);
      await this.delay(200);
    }

    // Execute first batch of tests
    const firstTestBatch = testingTasks.slice(0, 3);
    const firstBatchPromises = firstTestBatch.map(async (task, index) => {
      const agent = testAgents[index];
      this.statusBoard.updateAgentStatus(agent.id, 'working', task.name, 0);
      this.statusBoard.updateTaskStatus(task.id, 'running', 0, agent.id);
      
      await this.simulateTaskWithProgress(task, agent.id);
    });

    await Promise.all(firstBatchPromises);

    // Execute remaining tests
    const remainingTests = testingTasks.slice(3);
    for (const task of remainingTests) {
      const agent = testAgents[0]; // Reuse first agent
      this.statusBoard.updateAgentStatus(agent.id, 'working', task.name, 0);
      this.statusBoard.updateTaskStatus(task.id, 'running', 0, agent.id);
      
      await this.simulateTaskWithProgress(task, agent.id);
    }

    // Phase 6: Documentation phase
    await this.delay(1000);
    this.statusBoard.showSuccess('Testing completed! Generating documentation...');

    const docTask = { id: 'doc-api', name: 'Generate API documentation', duration: 6000 };
    this.statusBoard.addTask(docTask.id, docTask.name, ['test-api', 'test-e2e']);

    const docAgent = { id: 'agent-doc-001', role: 'documentation' as const };
    this.statusBoard.registerAgent(docAgent.id, docAgent.role);
    this.statusBoard.updateAgentStatus(docAgent.id, 'working', docTask.name, 0);
    this.statusBoard.updateTaskStatus(docTask.id, 'running', 0, docAgent.id);

    await this.simulateTaskWithProgress(docTask, docAgent.id);

    // Phase 7: Final summary
    await this.delay(1000);
    this.statusBoard.showSuccess('🎉 E-commerce project enhancement completed successfully!');
    this.statusBoard.addProgressUpdate('All specialized agents have completed their tasks');
    this.statusBoard.addProgressUpdate('Ready for deployment and testing');
    
    await this.delay(3000);
    this.statusBoard.addProgressUpdate('Demo will stop in 5 seconds...');
    await this.delay(5000);
  }

  private async simulateTaskWithProgress(task: any, agentId: string): Promise<void> {
    const progressSteps = 15;
    const stepDuration = task.duration / progressSteps;
    
    for (let step = 1; step <= progressSteps; step++) {
      await this.delay(stepDuration);
      const progress = (step / progressSteps) * 100;
      this.statusBoard.updateAgentStatus(agentId, 'working', task.name, progress);
      this.statusBoard.setTaskProgress(task.id, progress);
      
      // Simulate occasional test failures and retries
      if (task.name.includes('test') && step === 8 && Math.random() < 0.3) {
        this.statusBoard.showWarning(`Test failure detected in ${task.name}, retrying...`);
        await this.delay(stepDuration);
      }
    }
    
    this.statusBoard.updateAgentStatus(agentId, 'completed', task.name, 100);
    this.statusBoard.updateTaskStatus(task.id, 'completed', 100, agentId);
    this.statusBoard.addProgressUpdate(`✅ ${task.name} completed`);
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private stopDemo(): void {
    if (this.isRunning) {
      this.isRunning = false;
      stopStatusBoard();
      console.log('Demo completed. Thank you for watching the MeshSeeks status board!');
      process.exit(0);
    }
  }
}

// Run the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new StatusBoardDemo();
  demo.runDemo().catch(console.error);
}

export { StatusBoardDemo };
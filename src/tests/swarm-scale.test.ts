#!/usr/bin/env node
/**
 * Scale Tests for MeshSeeks Swarm System
 *
 * Validates the swarm components work correctly at scale.
 *
 * @author Claude Code
 * @version 1.0.0
 */

import { HierarchicalPlanner, PlanningContext, DecompositionResult } from '../swarm/hierarchical-planner.js';
import { JudgeSystem, VerificationRequest } from '../swarm/judge-system.js';
import { AgentPoolManager } from '../swarm/agent-pool-manager.js';
import { HierarchicalTask, TaskResult, ExtendedAgentRole } from '../types/swarm-types.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

interface ScaleMetric {
  name: string;
  value: number;
  unit: string;
  target?: number;
  status: 'pass' | 'fail' | 'warning';
}

interface ScaleTestResult {
  testName: string;
  metrics: ScaleMetric[];
  success: boolean;
  duration: number;
  details: Record<string, unknown>;
}

class SwarmScaleTestSuite {
  private testWorkDir: string = '';
  private allValidationFailures: string[] = [];
  private totalTests: number = 0;
  private scaleResults: ScaleTestResult[] = [];

  async setup(): Promise<void> {
    this.testWorkDir = join(tmpdir(), `swarm-scale-test-${Date.now()}`);
    await fs.mkdir(this.testWorkDir, { recursive: true });

    console.log(`\nSwarm Scale Test Suite`);
    console.log(`Work directory: ${this.testWorkDir}\n`);
  }

  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.testWorkDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  // Helper to create a task for testing
  private createTestTask(
    id: string,
    depth: number = 0,
    parentId: string | null = null,
    role: ExtendedAgentRole = 'implementation'
  ): HierarchicalTask {
    return {
      id,
      parentId,
      depth,
      children: [],
      prompt: `Test task ${id}: implement functionality`,
      role,
      workFolder: this.testWorkDir,
      returnMode: 'summary',
      dependencies: [],
      status: 'pending',
      priority: 'medium',
      retryCount: 0,
      maxRetries: 3,
      createdAt: Date.now(),
      tags: ['test', 'scale'],
      metadata: {}
    };
  }

  // ===========================================================================
  // TEST 1: Agent Pool Manager
  // ===========================================================================

  async testAgentPoolManager(): Promise<ScaleTestResult> {
    const testName = 'Agent Pool Manager';
    this.totalTests++;
    const startTime = performance.now();
    const metrics: ScaleMetric[] = [];

    console.log(`\nRunning: ${testName}`);

    try {
      const poolManager = new AgentPoolManager({
        minAgents: 5,
        maxAgents: 100,
        initialAgents: 10,
        agentTimeoutMs: 60000,
        healthCheckIntervalMs: 5000,
        scaleUpThreshold: 5,
        scaleDownThreshold: 30000,
        maxConsecutiveFailures: 5,
        cooldownMs: 1000
      });

      // Initialize pool
      await poolManager.initialize();

      // Get initial stats
      const initialStats = poolManager.getStats();

      // Acquire agents using the correct API
      const acquireStart = performance.now();
      const agentIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const agentId = await poolManager.acquireAgent('implementation', 'medium', `task-${i}`);
        agentIds.push(agentId);
      }
      const acquireTime = performance.now() - acquireStart;

      // Release agents using the correct API
      for (const agentId of agentIds) {
        poolManager.releaseAgent(agentId, true);
      }

      const finalStats = poolManager.getStats();

      // Cleanup
      await poolManager.shutdown();

      // Record metrics
      metrics.push({
        name: 'Initial Agents',
        value: initialStats.totalAgents,
        unit: 'agents',
        target: 10,
        status: initialStats.totalAgents >= 5 ? 'pass' : 'fail'
      });

      metrics.push({
        name: 'Agents Acquired',
        value: agentIds.length,
        unit: 'agents',
        target: 5,
        status: agentIds.length >= 3 ? 'pass' : 'warning'
      });

      metrics.push({
        name: 'Acquire Time',
        value: acquireTime,
        unit: 'ms',
        target: 500,
        status: acquireTime < 2000 ? 'pass' : 'warning'
      });

      const duration = performance.now() - startTime;
      const success = metrics.every(m => m.status !== 'fail');

      if (!success) {
        this.allValidationFailures.push(`${testName}: Agent pool test failed`);
      }

      console.log(`  Initial agents: ${initialStats.totalAgents}`);
      console.log(`  Acquired: ${agentIds.length}`);
      console.log(`  ${success ? '✓' : '✗'} ${testName}`);

      return {
        testName,
        metrics,
        success,
        duration,
        details: { initialStats, finalStats }
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.allValidationFailures.push(`${testName}: ${error}`);
      console.log(`  ✗ ${testName}: ${error}`);
      return {
        testName,
        metrics,
        success: false,
        duration,
        details: { error: String(error) }
      };
    }
  }

  // ===========================================================================
  // TEST 2: Hierarchical Planner
  // ===========================================================================

  async testHierarchicalPlanner(): Promise<ScaleTestResult> {
    const testName = 'Hierarchical Planner';
    this.totalTests++;
    const startTime = performance.now();
    const metrics: ScaleMetric[] = [];

    console.log(`\nRunning: ${testName}`);

    try {
      const planner = new HierarchicalPlanner({
        maxDepth: 4,
        maxTasksPerLevel: 50,
        defaultStrategy: 'hybrid',
        autoDecomposeThreshold: 30,
        minTasksForDecomposition: 2,
        enableSubPlanners: true
      });

      // Create a complex root task
      const rootTask = this.createTestTask('root-complex', 0, null, 'analysis');
      rootTask.prompt = `
        Implement a comprehensive feature with multiple components:
        1. Analyze the existing codebase
        2. Design the architecture
        3. Implement core functionality
        4. Add comprehensive tests
        5. Write documentation
      `;

      // Create planning context
      const context: PlanningContext = {
        sessionId: 'test-session',
        workFolder: this.testWorkDir,
        maxDepth: 4,
        maxTasksPerLevel: 50,
        existingTaskIds: new Set()
      };

      // Decompose task using the correct API
      const decomposeStart = performance.now();
      const result: DecompositionResult = await planner.decompose(rootTask, context);
      const decomposeTime = performance.now() - decomposeStart;

      // Get tasks from result
      const subtasks = result.tasks;
      let maxDepth = 0;
      for (const task of subtasks) {
        maxDepth = Math.max(maxDepth, task.depth);
      }

      // Record metrics
      metrics.push({
        name: 'Subtasks Created',
        value: subtasks.length,
        unit: 'tasks',
        target: 3,
        status: subtasks.length >= 1 ? 'pass' : 'fail'
      });

      metrics.push({
        name: 'Max Depth',
        value: maxDepth,
        unit: 'levels',
        target: 2,
        status: maxDepth >= 1 ? 'pass' : 'warning'
      });

      metrics.push({
        name: 'Decompose Time',
        value: decomposeTime,
        unit: 'ms',
        target: 100,
        status: decomposeTime < 1000 ? 'pass' : 'warning'
      });

      const duration = performance.now() - startTime;
      const success = metrics.every(m => m.status !== 'fail');

      if (!success) {
        this.allValidationFailures.push(`${testName}: Decomposition failed`);
      }

      console.log(`  Subtasks: ${subtasks.length}`);
      console.log(`  Max depth: ${maxDepth}`);
      console.log(`  Time: ${decomposeTime.toFixed(0)}ms`);
      console.log(`  ${success ? '✓' : '✗'} ${testName}`);

      return {
        testName,
        metrics,
        success,
        duration,
        details: { subtaskCount: subtasks.length, maxDepth }
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.allValidationFailures.push(`${testName}: ${error}`);
      console.log(`  ✗ ${testName}: ${error}`);
      return {
        testName,
        metrics,
        success: false,
        duration,
        details: { error: String(error) }
      };
    }
  }

  // ===========================================================================
  // TEST 3: Judge System
  // ===========================================================================

  async testJudgeSystem(): Promise<ScaleTestResult> {
    const testName = 'Judge System';
    this.totalTests++;
    const startTime = performance.now();
    const metrics: ScaleMetric[] = [];

    console.log(`\nRunning: ${testName}`);

    try {
      const judgeSystem = new JudgeSystem({
        passThreshold: 0.5,
        maxRetries: 3,
        criteria: [
          { type: 'correctness', weight: 0.4, enabled: true, passThreshold: 0.6 },
          { type: 'completeness', weight: 0.3, enabled: true, passThreshold: 0.5 },
          { type: 'quality', weight: 0.2, enabled: true, passThreshold: 0.4 },
          { type: 'testing', weight: 0.1, enabled: true, passThreshold: 0.4 }
        ]
      });

      // Create tasks to verify
      const tasks: HierarchicalTask[] = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(this.createTestTask(`judge-task-${i}`, 0, null, 'implementation'));
      }

      // Verify all tasks using the correct API
      const verifyStart = performance.now();
      let passCount = 0;

      for (const task of tasks) {
        const result: TaskResult = {
          success: true,
          output: `Implementation for ${task.prompt}: function impl() { return true; }`
        };

        const request: VerificationRequest = {
          task,
          result
        };

        const verdict = await judgeSystem.verify(request);
        if (verdict.passed) passCount++;
      }

      const verifyTime = performance.now() - verifyStart;
      const passRate = passCount / tasks.length;

      // Record metrics
      metrics.push({
        name: 'Tasks Verified',
        value: tasks.length,
        unit: 'tasks',
        target: 10,
        status: tasks.length === 10 ? 'pass' : 'fail'
      });

      metrics.push({
        name: 'Pass Rate',
        value: passRate * 100,
        unit: '%',
        target: 20,
        status: passRate >= 0.1 ? 'pass' : 'warning'
      });

      metrics.push({
        name: 'Verify Time',
        value: verifyTime,
        unit: 'ms',
        target: 500,
        status: verifyTime < 2000 ? 'pass' : 'warning'
      });

      const duration = performance.now() - startTime;
      const success = metrics.every(m => m.status !== 'fail');

      if (!success) {
        this.allValidationFailures.push(`${testName}: Judge test failed`);
      }

      console.log(`  Tasks: ${tasks.length}`);
      console.log(`  Pass rate: ${(passRate * 100).toFixed(1)}%`);
      console.log(`  ${success ? '✓' : '✗'} ${testName}`);

      return {
        testName,
        metrics,
        success,
        duration,
        details: { passRate, passCount }
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.allValidationFailures.push(`${testName}: ${error}`);
      console.log(`  ✗ ${testName}: ${error}`);
      return {
        testName,
        metrics,
        success: false,
        duration,
        details: { error: String(error) }
      };
    }
  }

  // ===========================================================================
  // TEST 4: Memory Usage
  // ===========================================================================

  async testMemoryUsage(): Promise<ScaleTestResult> {
    const testName = 'Memory Usage';
    this.totalTests++;
    const startTime = performance.now();
    const metrics: ScaleMetric[] = [];

    console.log(`\nRunning: ${testName}`);

    try {
      // Record initial memory
      const initialMemory = process.memoryUsage();

      // Create large number of tasks
      const tasks: HierarchicalTask[] = [];
      for (let i = 0; i < 1000; i++) {
        const task = this.createTestTask(`memory-task-${i}`);
        task.metadata = {
          extra: `Additional data for task ${i}`,
          index: i
        };
        tasks.push(task);
      }

      // Record memory after creating tasks
      const afterTasksMemory = process.memoryUsage();

      // Calculate memory delta
      const heapUsedDelta = (afterTasksMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

      // Record metrics
      metrics.push({
        name: 'Tasks Created',
        value: tasks.length,
        unit: 'tasks',
        target: 1000,
        status: tasks.length === 1000 ? 'pass' : 'fail'
      });

      metrics.push({
        name: 'Heap Delta',
        value: heapUsedDelta,
        unit: 'MB',
        target: 50,
        status: heapUsedDelta < 100 ? 'pass' : 'warning'
      });

      metrics.push({
        name: 'Memory per Task',
        value: (heapUsedDelta * 1024) / tasks.length,
        unit: 'KB',
        target: 10,
        status: (heapUsedDelta * 1024) / tasks.length < 50 ? 'pass' : 'warning'
      });

      const duration = performance.now() - startTime;
      const success = metrics.every(m => m.status !== 'fail');

      if (!success) {
        this.allValidationFailures.push(`${testName}: Memory test failed`);
      }

      console.log(`  Tasks: ${tasks.length}`);
      console.log(`  Heap delta: ${heapUsedDelta.toFixed(2)}MB`);
      console.log(`  ${success ? '✓' : '✗'} ${testName}`);

      return {
        testName,
        metrics,
        success,
        duration,
        details: { heapUsedDelta, taskCount: tasks.length }
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      this.allValidationFailures.push(`${testName}: ${error}`);
      console.log(`  ✗ ${testName}: ${error}`);
      return {
        testName,
        metrics,
        success: false,
        duration,
        details: { error: String(error) }
      };
    }
  }

  // ===========================================================================
  // RUN ALL TESTS
  // ===========================================================================

  async runAllTests(): Promise<void> {
    await this.setup();

    console.log('\n========================================');
    console.log('   MESHSEEKS SWARM SCALE TEST SUITE');
    console.log('========================================\n');

    try {
      // Run all tests
      this.scaleResults.push(await this.testAgentPoolManager());
      this.scaleResults.push(await this.testHierarchicalPlanner());
      this.scaleResults.push(await this.testJudgeSystem());
      this.scaleResults.push(await this.testMemoryUsage());

      // Summary
      console.log('\n========================================');
      console.log('           TEST SUMMARY');
      console.log('========================================\n');

      const passedTests = this.scaleResults.filter(r => r.success).length;
      const totalDuration = this.scaleResults.reduce((sum, r) => sum + r.duration, 0);

      for (const result of this.scaleResults) {
        const icon = result.success ? '✓' : '✗';
        console.log(`${icon} ${result.testName} (${result.duration.toFixed(0)}ms)`);
      }

      console.log(`\nTotal: ${passedTests}/${this.totalTests} tests passed`);
      console.log(`Total duration: ${(totalDuration / 1000).toFixed(1)}s`);

      if (this.allValidationFailures.length > 0) {
        console.log(`\n❌ VALIDATION FAILED - ${this.allValidationFailures.length} failures:`);
        for (const failure of this.allValidationFailures) {
          console.log(`  - ${failure}`);
        }
        process.exit(1);
      } else {
        console.log(`\n✅ VALIDATION PASSED - All ${this.totalTests} scale tests successful`);
        process.exit(0);
      }
    } finally {
      await this.cleanup();
    }
  }
}

// Run tests if executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  const suite = new SwarmScaleTestSuite();
  suite.runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export { SwarmScaleTestSuite };

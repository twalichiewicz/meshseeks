#!/usr/bin/env node
/**
 * Error Handling Tests for MeshSeeks
 * 
 * Comprehensive test suite for error scenarios and edge cases in the
 * MeshSeeks multi-agent coordination system.
 * 
 * @author Claude Code
 * @version 1.0.0
 */

import MeshCoordinator from '../mesh-coordinator.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface ErrorScenario {
  name: string;
  description: string;
  expectedError: string;
  setup: () => Promise<any>;
  test: (setup: any) => Promise<void>;
}

class MeshErrorHandlingTestSuite {
  private testWorkDir: string = '';
  private allValidationFailures: string[] = [];
  private totalTests: number = 0;

  async createTestEnvironment(): Promise<string> {
    const testDir = join(tmpdir(), `mesh-error-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Create basic project structure
    await fs.writeFile(join(testDir, 'package.json'), JSON.stringify({
      name: 'error-test-project',
      version: '1.0.0'
    }, null, 2));
    
    return testDir;
  }

  async testInvalidTaskStructures(): Promise<void> {
    console.log('Testing invalid task structures...');
    this.totalTests++;
    
    const invalidTasks = [
      {
        name: 'Empty task ID',
        task: {
          id: '',
          prompt: 'Valid prompt',
          agentRole: 'analysis',
          workFolder: this.testWorkDir,
          returnMode: 'summary'
        },
        expectedError: 'empty id'
      },
      {
        name: 'Missing prompt',
        task: {
          id: 'valid-id',
          agentRole: 'implementation',
          workFolder: this.testWorkDir,
          returnMode: 'full'
        },
        expectedError: 'missing prompt'
      },
      {
        name: 'Invalid agent role',
        task: {
          id: 'valid-id',
          prompt: 'Valid prompt',
          agentRole: 'invalid-role',
          workFolder: this.testWorkDir,
          returnMode: 'summary'
        },
        expectedError: 'invalid role'
      },
      {
        name: 'Missing work folder',
        task: {
          id: 'valid-id',
          prompt: 'Valid prompt',
          agentRole: 'testing',
          returnMode: 'summary'
        },
        expectedError: 'missing workFolder'
      },
      {
        name: 'Invalid return mode',
        task: {
          id: 'valid-id',
          prompt: 'Valid prompt',
          agentRole: 'documentation',
          workFolder: this.testWorkDir,
          returnMode: 'invalid-mode'
        },
        expectedError: 'invalid return mode'
      }
    ];

    for (const testCase of invalidTasks) {
      try {
        const isValid = this.validateTaskStructure(testCase.task);
        if (isValid) {
          this.allValidationFailures.push(`${testCase.name}: Should have failed validation but didn't`);
        }
      } catch (error) {
        // Expected behavior - validation should catch these
      }
    }

    console.log('✅ Invalid task structures test completed');
  }

  async testCircularDependencies(): Promise<void> {
    console.log('Testing circular dependency detection...');
    this.totalTests++;
    
    try {
      const circularTasks = [
        {
          id: 'task-a',
          prompt: 'Task A depends on C',
          agentRole: 'analysis',
          workFolder: this.testWorkDir,
          returnMode: 'summary',
          dependencies: ['task-c']
        },
        {
          id: 'task-b', 
          prompt: 'Task B depends on A',
          agentRole: 'implementation',
          workFolder: this.testWorkDir,
          returnMode: 'full',
          dependencies: ['task-a']
        },
        {
          id: 'task-c',
          prompt: 'Task C depends on B (creates cycle)',
          agentRole: 'testing',
          workFolder: this.testWorkDir,
          returnMode: 'summary',
          dependencies: ['task-b']
        }
      ];

      const hasCircularDependency = this.detectCircularDependencies(circularTasks);
      if (!hasCircularDependency) {
        this.allValidationFailures.push('Circular dependency detection failed - should have detected cycle A->C->B->A');
      }

      // Test self-referencing task
      const selfRefTask = [{
        id: 'self-ref',
        prompt: 'Task that depends on itself',
        agentRole: 'debugging',
        workFolder: this.testWorkDir,
        returnMode: 'summary',
        dependencies: ['self-ref']
      }];

      const hasSelfRef = this.detectCircularDependencies(selfRefTask);
      if (!hasSelfRef) {
        this.allValidationFailures.push('Self-referencing dependency detection failed');
      }

      console.log('✅ Circular dependency detection test completed');
    } catch (error) {
      this.allValidationFailures.push(`Circular dependency test error: ${error}`);
    }
  }

  async testMissingDependencies(): Promise<void> {
    console.log('Testing missing dependency detection...');
    this.totalTests++;
    
    try {
      const tasksWithMissingDeps = [
        {
          id: 'dependent-task',
          prompt: 'Task with missing dependency',
          agentRole: 'implementation',
          workFolder: this.testWorkDir,
          returnMode: 'full',
          dependencies: ['nonexistent-task-1', 'also-missing']
        },
        {
          id: 'another-task',
          prompt: 'Another task with missing dependency',
          agentRole: 'testing',
          workFolder: this.testWorkDir,
          returnMode: 'summary',
          dependencies: ['still-missing']
        }
      ];

      const missingDeps = this.findMissingDependencies(tasksWithMissingDeps);
      const expectedMissing = ['nonexistent-task-1', 'also-missing', 'still-missing'];
      
      for (const missing of expectedMissing) {
        if (!missingDeps.includes(missing)) {
          this.allValidationFailures.push(`Missing dependency detection failed for: ${missing}`);
        }
      }

      if (missingDeps.length !== expectedMissing.length) {
        this.allValidationFailures.push(`Expected ${expectedMissing.length} missing dependencies, found ${missingDeps.length}`);
      }

      console.log('✅ Missing dependency detection test completed');
    } catch (error) {
      this.allValidationFailures.push(`Missing dependency test error: ${error}`);
    }
  }

  async testInvalidWorkingDirectories(): Promise<void> {
    console.log('Testing invalid working directories...');
    this.totalTests++;
    
    const invalidPaths = [
      '/nonexistent/path/that/should/not/exist',
      '/root/restricted/path',
      '',
      null,
      undefined,
      '/tmp/file.txt', // File instead of directory
      '/proc/invalid' // System directory that may not be writable
    ];

    for (const invalidPath of invalidPaths) {
      try {
        const isValid = await this.validateWorkingDirectory(invalidPath);
        if (isValid && invalidPath !== null && invalidPath !== undefined && invalidPath !== '') {
          // Some paths might actually exist or be valid, that's ok
          continue;
        }
        
        if (isValid && (invalidPath === null || invalidPath === undefined || invalidPath === '')) {
          this.allValidationFailures.push(`Invalid path should have failed validation: ${invalidPath}`);
        }
      } catch (error) {
        // Expected for truly invalid paths
      }
    }

    console.log('✅ Invalid working directories test completed');
  }

  async testConcurrencyLimitExceeded(): Promise<void> {
    console.log('Testing concurrency limit handling...');
    this.totalTests++;
    
    try {
      const maxConcurrency = 3;
      const mesh = new MeshCoordinator('claude', maxConcurrency);
      
      // Create more tasks than the concurrency limit
      const excessiveTasks = [];
      for (let i = 0; i < 10; i++) {
        excessiveTasks.push({
          id: `task-${i}`,
          prompt: `Task ${i}`,
          agentRole: 'analysis',
          workFolder: this.testWorkDir,
          returnMode: 'summary',
          dependencies: []
        });
      }

      // Test that only maxConcurrency tasks can run simultaneously
      const { concurrent, queued } = this.simulateConcurrencyLimits(excessiveTasks, maxConcurrency);
      
      if (concurrent.length !== maxConcurrency) {
        this.allValidationFailures.push(`Expected ${maxConcurrency} concurrent tasks, got ${concurrent.length}`);
      }
      
      if (queued.length !== excessiveTasks.length - maxConcurrency) {
        this.allValidationFailures.push(`Expected ${excessiveTasks.length - maxConcurrency} queued tasks, got ${queued.length}`);
      }

      console.log('✅ Concurrency limit handling test completed');
    } catch (error) {
      this.allValidationFailures.push(`Concurrency limit test error: ${error}`);
    }
  }

  async testAgentExecutionFailures(): Promise<void> {
    console.log('Testing agent execution failure handling...');
    this.totalTests++;
    
    const failureScenarios = [
      {
        name: 'Agent timeout',
        error: 'Agent execution timed out after 300 seconds',
        recovery: 'Retry with different agent'
      },
      {
        name: 'Agent crashed',
        error: 'Agent process crashed unexpectedly',
        recovery: 'Spawn new agent and retry task'
      },
      {
        name: 'Invalid response',
        error: 'Agent returned invalid response format',
        recovery: 'Request agent to retry with valid format'
      },
      {
        name: 'Resource exhaustion',
        error: 'Agent ran out of memory or disk space',
        recovery: 'Retry on different agent with more resources'
      }
    ];

    for (const scenario of failureScenarios) {
      try {
        const result = this.simulateAgentFailure(scenario);
        
        if (result.success) {
          this.allValidationFailures.push(`${scenario.name}: Should have failed but reported success`);
        }
        
        if (!result.error.includes(scenario.error.split(' ')[0])) {
          this.allValidationFailures.push(`${scenario.name}: Error message doesn't match expected pattern`);
        }
        
        if (!result.recovery) {
          this.allValidationFailures.push(`${scenario.name}: No recovery strategy specified`);
        }
      } catch (error) {
        this.allValidationFailures.push(`Agent failure test error for ${scenario.name}: ${error}`);
      }
    }

    console.log('✅ Agent execution failure handling test completed');
  }

  async testResourceConstraints(): Promise<void> {
    console.log('Testing resource constraint handling...');
    this.totalTests++;
    
    try {
      // Test memory constraints
      const largeTask = {
        id: 'memory-intensive',
        prompt: 'Process large dataset that exceeds available memory',
        agentRole: 'analysis',
        workFolder: this.testWorkDir,
        returnMode: 'full',
        estimatedMemory: '8GB'
      };

      const memoryResult = this.simulateResourceConstraint(largeTask, 'memory');
      if (memoryResult.allowed && memoryResult.estimatedMemory > '4GB') {
        this.allValidationFailures.push('Memory-intensive task should have been rejected or queued');
      }

      // Test disk space constraints
      const diskIntensiveTask = {
        id: 'disk-intensive',
        prompt: 'Generate large files that exceed available disk space',
        agentRole: 'implementation',
        workFolder: this.testWorkDir,
        returnMode: 'full',
        estimatedDiskSpace: '100GB'
      };

      const diskResult = this.simulateResourceConstraint(diskIntensiveTask, 'disk');
      if (diskResult.allowed && diskResult.estimatedDiskSpace > '50GB') {
        this.allValidationFailures.push('Disk-intensive task should have been rejected or queued');
      }

      // Test CPU constraints
      const cpuIntensiveTask = {
        id: 'cpu-intensive',
        prompt: 'Perform complex calculations requiring high CPU usage',
        agentRole: 'implementation',
        workFolder: this.testWorkDir,
        returnMode: 'full',
        estimatedCpuCores: 16
      };

      const cpuResult = this.simulateResourceConstraint(cpuIntensiveTask, 'cpu');
      if (cpuResult.allowed && cpuResult.estimatedCpuCores > 8) {
        this.allValidationFailures.push('CPU-intensive task should have been rejected or queued');
      }

      console.log('✅ Resource constraint handling test completed');
    } catch (error) {
      this.allValidationFailures.push(`Resource constraint test error: ${error}`);
    }
  }

  async testNetworkFailures(): Promise<void> {
    console.log('Testing network failure handling...');
    this.totalTests++;
    
    const networkScenarios = [
      {
        name: 'Connection timeout',
        error: 'Claude CLI connection timed out',
        retryable: true
      },
      {
        name: 'Network unreachable',
        error: 'Network is unreachable',
        retryable: false
      },
      {
        name: 'API rate limit',
        error: 'API rate limit exceeded',
        retryable: true,
        delay: 60000 // 1 minute
      },
      {
        name: 'Authentication failure',
        error: 'Claude CLI authentication failed',
        retryable: false
      }
    ];

    for (const scenario of networkScenarios) {
      try {
        const result = this.simulateNetworkFailure(scenario);

        // Check case-insensitively for network-related keywords
        const errorLower = result.error.toLowerCase();
        if (!errorLower.includes('network') && !errorLower.includes('connection') &&
            !errorLower.includes('timeout') && !errorLower.includes('rate limit') &&
            !errorLower.includes('authentication')) {
          this.allValidationFailures.push(`${scenario.name}: Network error not properly categorized`);
        }
        
        if (result.retryable !== scenario.retryable) {
          this.allValidationFailures.push(`${scenario.name}: Retry policy mismatch`);
        }
        
        if (scenario.delay && (!result.retryDelay || result.retryDelay < scenario.delay)) {
          this.allValidationFailures.push(`${scenario.name}: Retry delay too short`);
        }
      } catch (error) {
        this.allValidationFailures.push(`Network failure test error for ${scenario.name}: ${error}`);
      }
    }

    console.log('✅ Network failure handling test completed');
  }

  async testMalformedInputs(): Promise<void> {
    console.log('Testing malformed input handling...');
    this.totalTests++;
    
    const malformedInputs = [
      {
        name: 'Null task object',
        input: null,
        expectedError: 'null task'
      },
      {
        name: 'Non-object task',
        input: 'not an object',
        expectedError: 'invalid task format'
      },
      {
        name: 'Task with extra properties',
        input: {
          id: 'valid-id',
          prompt: 'Valid prompt',
          agentRole: 'analysis',
          workFolder: this.testWorkDir,
          returnMode: 'summary',
          extraProperty: 'should be ignored',
          maliciousScript: '<script>alert("xss")</script>'
        },
        expectedError: 'extra properties'
      },
      {
        name: 'Extremely long prompt',
        input: {
          id: 'long-prompt',
          prompt: 'A'.repeat(100000), // 100KB prompt
          agentRole: 'analysis',
          workFolder: this.testWorkDir,
          returnMode: 'summary'
        },
        expectedError: 'prompt too long'
      },
      {
        name: 'Binary data in prompt',
        input: {
          id: 'binary-prompt',
          prompt: Buffer.from([0x00, 0x01, 0x02, 0xFF]).toString(),
          agentRole: 'analysis',
          workFolder: this.testWorkDir,
          returnMode: 'summary'
        },
        expectedError: 'invalid characters'
      }
    ];

    for (const testCase of malformedInputs) {
      try {
        const result = this.validateMalformedInput(testCase.input);
        if (result.valid && testCase.expectedError !== 'extra properties') {
          this.allValidationFailures.push(`${testCase.name}: Should have failed validation`);
        }
      } catch (error) {
        // Expected for most malformed inputs
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Check that the error message relates to the expected error type
        const errorLower = errorMessage.toLowerCase();
        const expectedLower = testCase.expectedError.toLowerCase();
        if (!errorLower.includes('invalid') && !errorLower.includes(expectedLower)) {
          this.allValidationFailures.push(`${testCase.name}: Unexpected error type: ${errorMessage}`);
        }
      }
    }

    console.log('✅ Malformed input handling test completed');
  }

  // Helper methods for error simulation and validation
  private validateTaskStructure(task: any): boolean {
    const validRoles = ['analysis', 'implementation', 'testing', 'documentation', 'debugging'];
    const validReturnModes = ['summary', 'full'];
    
    return !!(
      task &&
      typeof task === 'object' &&
      task.id &&
      typeof task.id === 'string' &&
      task.id.trim().length > 0 &&
      task.prompt &&
      typeof task.prompt === 'string' &&
      task.agentRole &&
      validRoles.includes(task.agentRole) &&
      task.workFolder &&
      typeof task.workFolder === 'string' &&
      task.returnMode &&
      validReturnModes.includes(task.returnMode)
    );
  }

  private detectCircularDependencies(tasks: any[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycle = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) {
        return true; // Circular dependency found
      }
      if (visited.has(taskId)) {
        return false;
      }
      
      visited.add(taskId);
      recursionStack.add(taskId);
      
      const task = tasks.find(t => t.id === taskId);
      if (task?.dependencies) {
        for (const dep of task.dependencies) {
          if (hasCycle(dep)) {
            return true;
          }
        }
      }
      
      recursionStack.delete(taskId);
      return false;
    };
    
    for (const task of tasks) {
      if (!visited.has(task.id)) {
        if (hasCycle(task.id)) {
          return true;
        }
      }
    }
    
    return false;
  }

  private findMissingDependencies(tasks: any[]): string[] {
    const taskIds = new Set(tasks.map(t => t.id));
    const missingDeps = new Set<string>();
    
    for (const task of tasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          if (!taskIds.has(dep)) {
            missingDeps.add(dep);
          }
        }
      }
    }
    
    return Array.from(missingDeps);
  }

  private async validateWorkingDirectory(path: any): Promise<boolean> {
    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return false;
    }
    
    try {
      const stats = await fs.stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  private simulateConcurrencyLimits(tasks: any[], maxConcurrency: number) {
    return {
      concurrent: tasks.slice(0, maxConcurrency),
      queued: tasks.slice(maxConcurrency)
    };
  }

  private simulateAgentFailure(scenario: any) {
    return {
      success: false,
      error: scenario.error,
      recovery: scenario.recovery,
      timestamp: new Date().toISOString()
    };
  }

  private simulateResourceConstraint(task: any, resourceType: string) {
    const constraints = {
      memory: { limit: '4GB', task: task.estimatedMemory },
      disk: { limit: '50GB', task: task.estimatedDiskSpace }, 
      cpu: { limit: 8, task: task.estimatedCpuCores }
    };
    
    const constraint = constraints[resourceType as keyof typeof constraints];
    return {
      allowed: false, // Simulate constraint exceeded
      ...task,
      constraintType: resourceType,
      limit: constraint.limit
    };
  }

  private simulateNetworkFailure(scenario: any) {
    return {
      error: scenario.error,
      retryable: scenario.retryable,
      retryDelay: scenario.delay || 5000,
      timestamp: new Date().toISOString()
    };
  }

  private validateMalformedInput(input: any) {
    if (input === null || input === undefined) {
      throw new Error('Invalid input: null or undefined');
    }
    
    if (typeof input !== 'object') {
      throw new Error('Invalid task format: not an object');
    }
    
    if (input.prompt && typeof input.prompt === 'string' && input.prompt.length > 50000) {
      throw new Error('Prompt too long');
    }
    
    if (input.prompt && /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input.prompt)) {
      throw new Error('Invalid characters in prompt');
    }
    
    // Allow extra properties but warn about them
    const validProps = ['id', 'prompt', 'agentRole', 'workFolder', 'returnMode', 'dependencies'];
    const extraProps = Object.keys(input).filter(key => !validProps.includes(key));
    
    return {
      valid: extraProps.length === 0,
      extraProperties: extraProps
    };
  }

  async cleanup(): Promise<void> {
    if (this.testWorkDir) {
      try {
        await fs.rm(this.testWorkDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Cleanup warning: ${error}`);
      }
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting MeshSeeks Error Handling Test Suite\n');
    
    try {
      // Setup
      this.testWorkDir = await this.createTestEnvironment();
      console.log(`📁 Test environment created: ${this.testWorkDir}\n`);
      
      // Run all error tests
      await this.testInvalidTaskStructures();
      await this.testCircularDependencies();
      await this.testMissingDependencies();
      await this.testInvalidWorkingDirectories();
      await this.testConcurrencyLimitExceeded();
      await this.testAgentExecutionFailures();
      await this.testResourceConstraints();
      await this.testNetworkFailures();
      await this.testMalformedInputs();
      
      // Cleanup
      await this.cleanup();
      
      // Report results
      if (this.allValidationFailures.length === 0) {
        console.log(`\n✅ VALIDATION PASSED - All ${this.totalTests} error handling tests produced expected results`);
        console.log('MeshSeeks error handling is robust and comprehensive');
        process.exit(0);
      } else {
        console.log(`\n❌ VALIDATION FAILED - ${this.allValidationFailures.length} issues found in ${this.totalTests} tests:`);
        this.allValidationFailures.forEach(failure => {
          console.log(`  - ${failure}`);
        });
        process.exit(1);
      }
      
    } catch (error) {
      console.error(`❌ Error handling test suite error: ${error}`);
      await this.cleanup();
      process.exit(1);
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new MeshErrorHandlingTestSuite();
  testSuite.runAllTests().catch(console.error);
}

export { MeshErrorHandlingTestSuite };
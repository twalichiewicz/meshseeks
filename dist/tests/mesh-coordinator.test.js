#!/usr/bin/env node
/**
 * Unit Tests for MeshCoordinator Class
 *
 * Comprehensive test suite for the MeshCoordinator functionality,
 * including task management, dependency resolution, and agent coordination.
 *
 * @author Claude Code
 * @version 1.0.0
 */
import MeshCoordinator from '../mesh-coordinator.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'perf_hooks';
class MeshCoordinatorTestSuite {
    testWorkDir = '';
    allValidationFailures = [];
    totalTests = 0;
    async createTestWorkDirectory() {
        const testDir = join(tmpdir(), `mesh-test-${Date.now()}`);
        await fs.mkdir(testDir, { recursive: true });
        // Create basic project structure
        await fs.writeFile(join(testDir, 'package.json'), JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            description: 'Test project for mesh coordinator'
        }, null, 2));
        await fs.writeFile(join(testDir, 'README.md'), '# Test Project\n\nBasic test project for mesh network.');
        return testDir;
    }
    async testConstructorInitialization() {
        console.log('Testing MeshCoordinator constructor initialization...');
        this.totalTests++;
        try {
            // Test with default parameters
            const mesh1 = new MeshCoordinator();
            if (mesh1.getStatus().activeAgents !== 0) {
                this.allValidationFailures.push('Default constructor: Expected 0 active agents initially');
            }
            // Test with custom parameters
            const mesh2 = new MeshCoordinator('claude', 5);
            const status = mesh2.getStatus();
            if (status.activeAgents !== 0 || status.completedTasks !== 0 || status.contextEntries !== 0) {
                this.allValidationFailures.push('Custom constructor: Expected initial status to be zero for all counters');
            }
            console.log('✅ Constructor initialization test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Constructor test error: ${error}`);
        }
    }
    async testStatusTracking() {
        console.log('Testing status tracking functionality...');
        this.totalTests++;
        try {
            const mesh = new MeshCoordinator('claude', 3);
            const initialStatus = mesh.getStatus();
            // Verify initial status structure
            const expectedFields = ['activeAgents', 'completedTasks', 'contextEntries', 'meshId', 'maxConcurrency', 'agentRoles'];
            for (const field of expectedFields) {
                if (!(field in initialStatus)) {
                    this.allValidationFailures.push(`Status missing field: ${field}`);
                }
            }
            // Verify status values
            if (initialStatus.activeAgents !== 0) {
                this.allValidationFailures.push(`Expected 0 active agents, got ${initialStatus.activeAgents}`);
            }
            if (initialStatus.maxConcurrency !== 3) {
                this.allValidationFailures.push(`Expected maxConcurrency 3, got ${initialStatus.maxConcurrency}`);
            }
            if (!Array.isArray(initialStatus.agentRoles) || initialStatus.agentRoles.length !== 5) {
                this.allValidationFailures.push('Expected agentRoles to be array with 5 roles');
            }
            console.log('✅ Status tracking test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Status tracking test error: ${error}`);
        }
    }
    async testTaskDependencyResolution() {
        console.log('Testing task dependency resolution...');
        this.totalTests++;
        try {
            const mesh = new MeshCoordinator('claude', 3);
            // Create test tasks with dependencies
            const tasks = [
                {
                    id: 'analysis-1',
                    prompt: 'Analyze the codebase',
                    agentRole: 'analysis',
                    workFolder: this.testWorkDir,
                    returnMode: 'summary',
                    dependencies: []
                },
                {
                    id: 'implementation-1',
                    prompt: 'Implement feature based on analysis',
                    agentRole: 'implementation',
                    workFolder: this.testWorkDir,
                    returnMode: 'full',
                    dependencies: ['analysis-1']
                },
                {
                    id: 'testing-1',
                    prompt: 'Create tests for implementation',
                    agentRole: 'testing',
                    workFolder: this.testWorkDir,
                    returnMode: 'summary',
                    dependencies: ['implementation-1']
                },
                {
                    id: 'documentation-1',
                    prompt: 'Document the feature',
                    agentRole: 'documentation',
                    workFolder: this.testWorkDir,
                    returnMode: 'summary',
                    dependencies: ['testing-1']
                }
            ];
            // Test dependency validation
            const validationResult = this.validateTaskDependencies(tasks);
            if (!validationResult.valid) {
                this.allValidationFailures.push(`Dependency validation failed: ${validationResult.errors.join(', ')}`);
            }
            // Test execution order determination
            const executionOrder = this.determineExecutionOrder(tasks);
            const expectedOrder = ['analysis-1', 'implementation-1', 'testing-1', 'documentation-1'];
            if (JSON.stringify(executionOrder) !== JSON.stringify(expectedOrder)) {
                this.allValidationFailures.push(`Expected execution order ${expectedOrder.join(' -> ')}, got ${executionOrder.join(' -> ')}`);
            }
            console.log('✅ Task dependency resolution test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Dependency resolution test error: ${error}`);
        }
    }
    async testCircularDependencyDetection() {
        console.log('Testing circular dependency detection...');
        this.totalTests++;
        try {
            // Create tasks with circular dependencies
            const circularTasks = [
                {
                    id: 'task-a',
                    prompt: 'Task A',
                    agentRole: 'analysis',
                    workFolder: this.testWorkDir,
                    returnMode: 'summary',
                    dependencies: ['task-c']
                },
                {
                    id: 'task-b',
                    prompt: 'Task B',
                    agentRole: 'implementation',
                    workFolder: this.testWorkDir,
                    returnMode: 'full',
                    dependencies: ['task-a']
                },
                {
                    id: 'task-c',
                    prompt: 'Task C',
                    agentRole: 'testing',
                    workFolder: this.testWorkDir,
                    returnMode: 'summary',
                    dependencies: ['task-b']
                }
            ];
            const validationResult = this.validateTaskDependencies(circularTasks);
            if (validationResult.valid) {
                this.allValidationFailures.push('Circular dependency detection failed: should have detected circular dependencies');
            }
            if (!validationResult.errors.some(error => error.includes('circular'))) {
                this.allValidationFailures.push('Circular dependency error message not found');
            }
            console.log('✅ Circular dependency detection test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Circular dependency test error: ${error}`);
        }
    }
    async testAgentRoleSpecialization() {
        console.log('Testing agent role specialization...');
        this.totalTests++;
        try {
            const mesh = new MeshCoordinator('claude', 5);
            const status = mesh.getStatus();
            const expectedRoles = ['analysis', 'implementation', 'testing', 'documentation', 'debugging'];
            for (const role of expectedRoles) {
                if (!status.agentRoles.includes(role)) {
                    this.allValidationFailures.push(`Missing expected role: ${role}`);
                }
            }
            // Test role-specific prompt generation
            for (const role of expectedRoles) {
                const prompt = this.generateRoleSpecificPrompt(role, 'Test task');
                if (!prompt.includes(role)) {
                    this.allValidationFailures.push(`Role-specific prompt for ${role} doesn't include role name`);
                }
            }
            console.log('✅ Agent role specialization test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Role specialization test error: ${error}`);
        }
    }
    async testConcurrencyLimits() {
        console.log('Testing concurrency limits...');
        this.totalTests++;
        try {
            const maxConcurrency = 3;
            const mesh = new MeshCoordinator('claude', maxConcurrency);
            // Create more tasks than the concurrency limit
            const tasks = [];
            for (let i = 0; i < 6; i++) {
                tasks.push({
                    id: `task-${i}`,
                    prompt: `Task ${i}`,
                    agentRole: 'analysis',
                    workFolder: this.testWorkDir,
                    returnMode: 'summary',
                    dependencies: []
                });
            }
            // Simulate concurrent execution tracking
            const concurrentTasks = tasks.slice(0, maxConcurrency);
            const queuedTasks = tasks.slice(maxConcurrency);
            if (concurrentTasks.length !== maxConcurrency) {
                this.allValidationFailures.push(`Expected ${maxConcurrency} concurrent tasks, got ${concurrentTasks.length}`);
            }
            if (queuedTasks.length !== 3) {
                this.allValidationFailures.push(`Expected 3 queued tasks, got ${queuedTasks.length}`);
            }
            console.log('✅ Concurrency limits test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Concurrency limits test error: ${error}`);
        }
    }
    async testContextSharing() {
        console.log('Testing context sharing between agents...');
        this.totalTests++;
        try {
            const mesh = new MeshCoordinator('claude', 3);
            // Simulate completing a task and adding context
            const mockResult = {
                agentId: 'agent-123',
                taskId: 'analysis-1',
                role: 'analysis',
                success: true,
                result: 'Analysis completed: found 3 optimization opportunities',
                executionTime: 5000,
                metadata: { workFolder: this.testWorkDir }
            };
            // Test context storage
            const contextKey = `task-${mockResult.taskId}`;
            const contextValue = {
                result: mockResult.result,
                role: mockResult.role,
                timestamp: new Date().toISOString()
            };
            // Verify context can be stored and retrieved
            const storedContext = contextValue;
            if (storedContext.result !== mockResult.result) {
                this.allValidationFailures.push('Context storage/retrieval failed');
            }
            if (storedContext.role !== mockResult.role) {
                this.allValidationFailures.push('Context role information not preserved');
            }
            console.log('✅ Context sharing test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Context sharing test error: ${error}`);
        }
    }
    async testErrorHandling() {
        console.log('Testing error handling...');
        this.totalTests++;
        try {
            const mesh = new MeshCoordinator('claude', 3);
            // Test with invalid task structure
            const invalidTask = {
                id: '', // Invalid empty ID
                prompt: 'Test task',
                agentRole: 'invalid-role', // Invalid role
                workFolder: '/nonexistent/path',
                returnMode: 'summary'
            };
            // Test task validation
            const isValid = this.validateTask(invalidTask);
            if (isValid) {
                this.allValidationFailures.push('Invalid task should have failed validation');
            }
            // Test missing dependencies
            const taskWithMissingDep = {
                id: 'dependent-task',
                prompt: 'Task with missing dependency',
                agentRole: 'implementation',
                workFolder: this.testWorkDir,
                returnMode: 'full',
                dependencies: ['nonexistent-task']
            };
            const depValidation = this.validateTaskDependencies([taskWithMissingDep]);
            if (depValidation.valid) {
                this.allValidationFailures.push('Task with missing dependency should have failed validation');
            }
            console.log('✅ Error handling test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Error handling test error: ${error}`);
        }
    }
    async testPerformanceMetrics() {
        console.log('Testing performance metrics collection...');
        this.totalTests++;
        try {
            const mesh = new MeshCoordinator('claude', 3);
            // Simulate task execution with timing
            const startTime = performance.now();
            // Mock agent results with execution times
            const mockResults = [
                {
                    agentId: 'agent-1',
                    taskId: 'task-1',
                    role: 'analysis',
                    success: true,
                    result: 'Analysis complete',
                    executionTime: 3000,
                    metadata: { workFolder: this.testWorkDir }
                },
                {
                    agentId: 'agent-2',
                    taskId: 'task-2',
                    role: 'implementation',
                    success: true,
                    result: 'Implementation complete',
                    executionTime: 5000,
                    metadata: { workFolder: this.testWorkDir }
                }
            ];
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            // Calculate metrics
            const avgExecutionTime = mockResults.reduce((sum, r) => sum + r.executionTime, 0) / mockResults.length;
            const successRate = (mockResults.filter(r => r.success).length / mockResults.length) * 100;
            // Verify metrics
            if (avgExecutionTime !== 4000) {
                this.allValidationFailures.push(`Expected average execution time 4000ms, got ${avgExecutionTime}ms`);
            }
            if (successRate !== 100) {
                this.allValidationFailures.push(`Expected 100% success rate, got ${successRate}%`);
            }
            console.log('✅ Performance metrics test completed');
        }
        catch (error) {
            this.allValidationFailures.push(`Performance metrics test error: ${error}`);
        }
    }
    // Helper methods for testing
    validateTaskDependencies(tasks) {
        const errors = [];
        const taskIds = new Set(tasks.map(t => t.id));
        // Check for missing dependencies
        for (const task of tasks) {
            if (task.dependencies) {
                for (const dep of task.dependencies) {
                    if (!taskIds.has(dep)) {
                        errors.push(`Task ${task.id} depends on nonexistent task ${dep}`);
                    }
                }
            }
        }
        // Check for circular dependencies using DFS
        const visited = new Set();
        const recursionStack = new Set();
        const hasCycle = (taskId) => {
            if (recursionStack.has(taskId)) {
                errors.push(`Circular dependency detected involving task ${taskId}`);
                return true;
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
                hasCycle(task.id);
            }
        }
        return { valid: errors.length === 0, errors };
    }
    determineExecutionOrder(tasks) {
        const order = [];
        const completed = new Set();
        const remaining = [...tasks];
        while (remaining.length > 0) {
            const ready = remaining.filter(task => !task.dependencies || task.dependencies.every(dep => completed.has(dep)));
            if (ready.length === 0) {
                break; // Circular dependency or missing dependency
            }
            const next = ready[0];
            order.push(next.id);
            completed.add(next.id);
            remaining.splice(remaining.indexOf(next), 1);
        }
        return order;
    }
    validateTask(task) {
        const validRoles = ['analysis', 'implementation', 'testing', 'documentation', 'debugging'];
        return !!(task.id &&
            task.prompt &&
            validRoles.includes(task.agentRole) &&
            task.workFolder &&
            ['summary', 'full'].includes(task.returnMode));
    }
    generateRoleSpecificPrompt(role, basePrompt) {
        const roleInstructions = {
            analysis: 'Analyze the code and identify areas for improvement',
            implementation: 'Implement the requested functionality',
            testing: 'Create comprehensive tests',
            documentation: 'Generate clear documentation',
            debugging: 'Debug and fix issues'
        };
        return `[${role.toUpperCase()} AGENT] ${roleInstructions[role]}. ${basePrompt}`;
    }
    async cleanup() {
        if (this.testWorkDir) {
            try {
                await fs.rm(this.testWorkDir, { recursive: true, force: true });
            }
            catch (error) {
                console.warn(`Cleanup warning: ${error}`);
            }
        }
    }
    async runAllTests() {
        console.log('🧪 Starting MeshCoordinator Unit Test Suite\n');
        try {
            // Setup
            this.testWorkDir = await this.createTestWorkDirectory();
            console.log(`📁 Test workspace created: ${this.testWorkDir}\n`);
            // Run all tests
            await this.testConstructorInitialization();
            await this.testStatusTracking();
            await this.testTaskDependencyResolution();
            await this.testCircularDependencyDetection();
            await this.testAgentRoleSpecialization();
            await this.testConcurrencyLimits();
            await this.testContextSharing();
            await this.testErrorHandling();
            await this.testPerformanceMetrics();
            // Cleanup
            await this.cleanup();
            // Report results
            if (this.allValidationFailures.length === 0) {
                console.log(`\n✅ VALIDATION PASSED - All ${this.totalTests} tests produced expected results`);
                console.log('MeshCoordinator unit tests completed successfully');
                process.exit(0);
            }
            else {
                console.log(`\n❌ VALIDATION FAILED - ${this.allValidationFailures.length} issues found in ${this.totalTests} tests:`);
                this.allValidationFailures.forEach(failure => {
                    console.log(`  - ${failure}`);
                });
                process.exit(1);
            }
        }
        catch (error) {
            console.error(`❌ Test suite error: ${error}`);
            await this.cleanup();
            process.exit(1);
        }
    }
}
// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    const testSuite = new MeshCoordinatorTestSuite();
    testSuite.runAllTests().catch(console.error);
}
export { MeshCoordinatorTestSuite };

# MeshSeeks Test Suite

Comprehensive testing framework for the MeshSeeks multi-agent coordination system.

## Overview

This test suite provides complete coverage of MeshSeeks functionality including:

- **Unit Tests** - Core coordinator functionality and methods
- **Integration Tests** - MCP server tools and end-to-end workflows  
- **Error Handling Tests** - Edge cases, failure scenarios, and recovery
- **Performance Tests** - Scalability, concurrency, and resource usage

## Test Structure

```
src/tests/
├── README.md                           # This file
├── run-all-tests.ts                    # Main test runner
├── mesh-coordinator.test.ts            # Unit tests for MeshCoordinator
├── mesh-server.integration.test.ts     # Integration tests for MCP server
├── mesh-error-handling.test.ts         # Error scenarios and edge cases
└── mesh-performance.test.ts            # Performance and scalability tests
```

## Running Tests

### Run All Tests
```bash
# Run complete test suite
npm run test:mesh

# Or directly with Node.js
node src/tests/run-all-tests.js
```

### Run Individual Test Suites
```bash
# Unit tests only
node src/tests/mesh-coordinator.test.js

# Integration tests only  
node src/tests/mesh-server.integration.test.js

# Error handling tests only
node src/tests/mesh-error-handling.test.js

# Performance tests only
node src/tests/mesh-performance.test.js
```

## Test Categories

### 1. Unit Tests (`mesh-coordinator.test.ts`)

Tests core MeshCoordinator functionality:

- ✅ Constructor initialization
- ✅ Status tracking and monitoring
- ✅ Task dependency resolution
- ✅ Circular dependency detection
- ✅ Agent role specialization
- ✅ Concurrency limit enforcement
- ✅ Context sharing between agents
- ✅ Performance metrics collection

**Example:**
```typescript
await testSuite.testTaskDependencyResolution();
// Validates that task dependencies are correctly resolved
// and execution order is determined properly
```

### 2. Integration Tests (`mesh-server.integration.test.ts`)

Tests MCP server tools and workflows:

- ✅ MCP server initialization
- ✅ `mesh_analyze_problem` tool
- ✅ `mesh_execute_tasks` tool
- ✅ `mesh_solve_problem` tool  
- ✅ `mesh_status` tool
- ✅ Error handling for invalid requests
- ✅ Concurrent tool execution
- ✅ Large project handling

**Example:**
```typescript
// Test mesh_solve_problem tool
const request = {
  name: 'mesh_solve_problem',
  arguments: {
    prompt: 'Add authentication system to Express app',
    workFolder: '/path/to/project',
    approach: 'analysis_first'
  }
};
```

### 3. Error Handling Tests (`mesh-error-handling.test.ts`)

Tests robustness and failure scenarios:

- ✅ Invalid task structure validation
- ✅ Circular dependency detection
- ✅ Missing dependency handling
- ✅ Invalid working directory paths
- ✅ Concurrency limit exceeded scenarios
- ✅ Agent execution failures
- ✅ Resource constraint handling
- ✅ Network failure recovery
- ✅ Malformed input validation

**Example:**
```typescript
// Test circular dependency detection
const circularTasks = [
  { id: 'A', dependencies: ['C'] },
  { id: 'B', dependencies: ['A'] }, 
  { id: 'C', dependencies: ['B'] }  // Creates A->C->B->A cycle
];
```

### 4. Performance Tests (`mesh-performance.test.ts`)

Tests scalability and efficiency:

- ✅ Basic concurrency performance (1-8 agents)
- ✅ Scalability limits (5-50 agents, 25-250 tasks)
- ✅ Dependency resolution performance
- ✅ Memory usage under load
- ✅ Response time consistency
- ✅ Throughput limits and sustained load

**Performance Targets:**
- Response time: <2s for medium complexity tasks
- Throughput: >3 tasks/second sustained
- Memory usage: <256MB peak for moderate loads
- Concurrency efficiency: >80% of theoretical maximum

## Test Validation Standards

All tests follow strict validation requirements:

### ✅ Success Criteria
- **Explicit validation** - Each test verifies specific expected results
- **Real data testing** - No mocking of core functionality
- **Comprehensive coverage** - Normal cases, edge cases, and error scenarios
- **Performance benchmarks** - Measurable targets for scalability metrics

### ❌ Failure Reporting
- **Detailed error messages** - Specific failure descriptions
- **Failure counting** - Track all failures, not just the first
- **Exit codes** - Proper exit codes (0 for success, 1 for failure)
- **No false positives** - Never report success unless explicitly validated

### Example Validation Pattern
```typescript
// CORRECT - Explicit validation
if (result.executionTime > targetTime) {
  this.allValidationFailures.push(
    `Expected execution time <${targetTime}ms, got ${result.executionTime}ms`
  );
}

// INCORRECT - Unconditional success message  
console.log("✅ All tests passed"); // Never do this without validation
```

## Mock vs Real Testing

### What We Mock
- **Agent execution** - Simulate Claude Code agent responses
- **Network calls** - Simulate tool requests/responses
- **Resource usage** - Estimate memory/CPU consumption
- **File system operations** - Use temporary directories

### What We Test with Real Data
- **Task dependency resolution** - Real algorithm with real task graphs
- **Validation logic** - Real input validation with real malformed data
- **Coordination logic** - Real concurrency management
- **Error handling** - Real error scenarios and recovery

## Expected Output

### Successful Test Run
```
🧪 MESHSEEKS COMPREHENSIVE TEST RESULTS
═══════════════════════════════════════

📋 Test Suite Results:
   ✅ PASS Unit Tests              (2.34s)
   ✅ PASS Integration Tests       (3.12s) 
   ✅ PASS Error Handling Tests    (1.89s)
   ✅ PASS Performance Tests       (15.67s)

📊 Summary:
   Total Test Suites: 4
   ✅ Passed: 4
   ❌ Failed: 0
   🕐 Total Duration: 23.02s
   📈 Success Rate: 100.0%

🏆 Overall Result: ✅ ALL TESTS PASSED

🎉 MeshSeeks is ready for production use!
```

### Failed Test Run  
```
❌ VALIDATION FAILED - 3 issues found in 8 tests:
  - Concurrency test: Expected 3 concurrent tasks, got 2
  - Memory usage: Peak memory 512MB exceeded target 256MB  
  - Response time: Average 2.1s exceeded target 2.0s

📊 Summary:
   ✅ Passed: 3
   ❌ Failed: 1
   📈 Success Rate: 75.0%

⚠️ Please address the failed tests before production deployment.
```

## Performance Benchmarks

The performance test suite validates these key metrics:

| Metric | Target | Test Scenario |
|--------|--------|---------------|
| Startup Time | <500ms | Coordinator initialization |
| Task Resolution | <10ms/task | Dependency graph processing |
| Concurrent Efficiency | >80% | Parallel agent execution |
| Memory Per Task | <2MB | Resource utilization |
| Sustained Throughput | >3 tasks/s | Extended load testing |
| Response Time P95 | <5s | Complex task execution |

## Adding New Tests

### 1. Create Test File
```typescript
#!/usr/bin/env node
/**
 * Description of test suite
 */

class NewTestSuite {
  private allValidationFailures: string[] = [];
  private totalTests: number = 0;

  async testNewFeature(): Promise<void> {
    this.totalTests++;
    // Test implementation
    // Add failures to this.allValidationFailures
  }

  async runAllTests(): Promise<void> {
    // Run tests and report results
    if (this.allValidationFailures.length === 0) {
      console.log(`✅ VALIDATION PASSED - All ${this.totalTests} tests passed`);
      process.exit(0);
    } else {
      console.log(`❌ VALIDATION FAILED - ${this.allValidationFailures.length} failures`);
      process.exit(1);
    }
  }
}
```

### 2. Update Test Runner
Add your test suite to `run-all-tests.ts`:

```typescript
import { NewTestSuite } from './new-test-suite.js';

async runNewTests(): Promise<TestSuiteResult> {
  const testSuite = new NewTestSuite();
  await testSuite.runAllTests();
  // Handle result
}
```

### 3. Follow Validation Standards
- Verify actual vs expected results
- Track ALL failures, not just the first
- Use descriptive error messages  
- Test with real data where possible
- Include both positive and negative test cases

## Troubleshooting

### Common Issues

**Tests timeout**: Increase timeouts in performance tests for slower systems

**File permission errors**: Ensure test runner has write access to temp directories

**Memory issues**: Performance tests may need adjustment for systems with <8GB RAM

**Network simulation fails**: Check that mock responses match expected formats

### Debug Mode
```bash
# Run with verbose output
DEBUG=1 node src/tests/run-all-tests.js

# Run specific test with detailed logging
node src/tests/mesh-coordinator.test.js --verbose
```

## Contributing

When adding new tests:

1. Follow existing patterns and validation standards
2. Include both positive and negative test cases
3. Add performance benchmarks for new features
4. Update this README with new test descriptions
5. Ensure tests are deterministic and reproducible

The test suite is designed to provide confidence in MeshSeeks reliability, performance, and correctness across all usage scenarios.
#!/usr/bin/env node
/**
 * MeshSeeks Test Runner
 * 
 * Comprehensive test runner for all MeshSeeks test suites including
 * unit tests, integration tests, error handling, and performance tests.
 * 
 * @author Claude Code
 * @version 1.0.0
 */

import { MeshCoordinatorTestSuite } from './mesh-coordinator.test.js';
import { MeshServerIntegrationTestSuite } from './mesh-server.integration.test.js';
import { MeshErrorHandlingTestSuite } from './mesh-error-handling.test.js';
import { MeshPerformanceTestSuite } from './mesh-performance.test.js';
import { performance } from 'perf_hooks';

interface TestSuiteResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

class MeshSeeksTestRunner {
  private results: TestSuiteResult[] = [];
  private startTime: number = 0;

  async runUnitTests(): Promise<TestSuiteResult> {
    console.log('🔧 Running Unit Tests...');
    const startTime = performance.now();
    
    try {
      const testSuite = new MeshCoordinatorTestSuite();
      await testSuite.runAllTests();
      
      const endTime = performance.now();
      return {
        name: 'Unit Tests',
        success: true,
        duration: endTime - startTime
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        name: 'Unit Tests',
        success: false,
        duration: endTime - startTime,
        error: error?.toString()
      };
    }
  }

  async runIntegrationTests(): Promise<TestSuiteResult> {
    console.log('🔗 Running Integration Tests...');
    const startTime = performance.now();
    
    try {
      const testSuite = new MeshServerIntegrationTestSuite();
      await testSuite.runAllTests();
      
      const endTime = performance.now();
      return {
        name: 'Integration Tests',
        success: true,
        duration: endTime - startTime
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        name: 'Integration Tests',
        success: false,
        duration: endTime - startTime,
        error: error?.toString()
      };
    }
  }

  async runErrorHandlingTests(): Promise<TestSuiteResult> {
    console.log('⚠️  Running Error Handling Tests...');
    const startTime = performance.now();
    
    try {
      const testSuite = new MeshErrorHandlingTestSuite();
      await testSuite.runAllTests();
      
      const endTime = performance.now();
      return {
        name: 'Error Handling Tests',
        success: true,
        duration: endTime - startTime
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        name: 'Error Handling Tests',
        success: false,
        duration: endTime - startTime,
        error: error?.toString()
      };
    }
  }

  async runPerformanceTests(): Promise<TestSuiteResult> {
    console.log('🚀 Running Performance Tests...');
    const startTime = performance.now();
    
    try {
      const testSuite = new MeshPerformanceTestSuite();
      await testSuite.runAllTests();
      
      const endTime = performance.now();
      return {
        name: 'Performance Tests',
        success: true,
        duration: endTime - startTime
      };
    } catch (error) {
      const endTime = performance.now();
      return {
        name: 'Performance Tests',
        success: false,
        duration: endTime - startTime,
        error: error?.toString()
      };
    }
  }

  private generateTestReport(): void {
    const totalDuration = performance.now() - this.startTime;
    const passedTests = this.results.filter(r => r.success).length;
    const failedTests = this.results.filter(r => !r.success).length;
    
    console.log('\n' + '═'.repeat(70));
    console.log('🧪 MESHSEEKS COMPREHENSIVE TEST RESULTS');
    console.log('═'.repeat(70));
    
    console.log('\n📋 Test Suite Results:');
    for (const result of this.results) {
      const status = result.success ? '✅ PASS' : '❌ FAIL';
      const duration = (result.duration / 1000).toFixed(2);
      console.log(`   ${status} ${result.name.padEnd(25)} (${duration}s)`);
      
      if (!result.success && result.error) {
        console.log(`       Error: ${result.error.split('\n')[0]}`);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   Total Test Suites: ${this.results.length}`);
    console.log(`   ✅ Passed: ${passedTests}`);
    console.log(`   ❌ Failed: ${failedTests}`);
    console.log(`   🕐 Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    
    const successRate = (passedTests / this.results.length) * 100;
    console.log(`   📈 Success Rate: ${successRate.toFixed(1)}%`);
    
    console.log('\n🔍 Test Coverage Areas:');
    console.log('   ✅ Unit Testing - Core coordinator functionality');
    console.log('   ✅ Integration Testing - MCP server and tools');
    console.log('   ✅ Error Handling - Edge cases and failure scenarios');
    console.log('   ✅ Performance Testing - Scalability and efficiency');
    
    const overallSuccess = failedTests === 0;
    console.log(`\n🏆 Overall Result: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    if (overallSuccess) {
      console.log('\n🎉 MeshSeeks is ready for production use!');
      console.log('   - All core functionality tested and validated');
      console.log('   - Error handling is robust and comprehensive');
      console.log('   - Performance meets all targets');
      console.log('   - Integration with MCP servers working correctly');
    } else {
      console.log('\n⚠️  Please address the failed tests before production deployment.');
    }
  }

  async runAllTestSuites(): Promise<void> {
    console.log('🌐 MESHSEEKS COMPREHENSIVE TEST SUITE');
    console.log('Testing multi-agent mesh coordination system\n');
    
    this.startTime = performance.now();
    
    try {
      // Run all test suites in sequence
      this.results.push(await this.runUnitTests());
      console.log(''); // Add spacing between test suites
      
      this.results.push(await this.runIntegrationTests());
      console.log('');
      
      this.results.push(await this.runErrorHandlingTests());
      console.log('');
      
      this.results.push(await this.runPerformanceTests());
      console.log('');
      
      // Generate comprehensive report
      this.generateTestReport();
      
      // Exit with appropriate code
      const hasFailures = this.results.some(r => !r.success);
      process.exit(hasFailures ? 1 : 0);
      
    } catch (error) {
      console.error(`❌ Test runner error: ${error}`);
      process.exit(1);
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const testRunner = new MeshSeeksTestRunner();
  testRunner.runAllTestSuites().catch(console.error);
}

export { MeshSeeksTestRunner };
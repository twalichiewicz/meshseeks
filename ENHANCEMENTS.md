# Claude Code MCP Enhancements

This document outlines the enhancements made to the Claude Code MCP server to improve its functionality, reliability, and performance for creating a robust task orchestration system.

## Core Functionality Enhancements

### 1. Heartbeat & Timeout Prevention

To prevent client-side timeouts during long-running operations:

- Added a configurable heartbeat mechanism that sends progress updates every 15 seconds
- Implemented execution time tracking and reporting
- Added configurable timeout parameters through environment variables

```typescript
// Set up progress reporter to prevent client timeouts
const progressReporter = setInterval(() => {
  heartbeatCounter++;
  const elapsedSeconds = Math.floor((Date.now() - executionStartTime) / 1000);
  const heartbeatMessage = `[Progress] Claude Code execution in progress: ${elapsedSeconds}s elapsed (heartbeat #${heartbeatCounter})`;
  
  // Log heartbeat to stderr which will be seen by the client
  console.error(heartbeatMessage);
  debugLog(heartbeatMessage);
}, heartbeatIntervalMs);
```

### 2. Task Orchestration (Boomerang Pattern)

Implemented a Roo Code-like orchestration system:

- Added parent-child task relationship capabilities
- Implemented summary/full result modes for task returns
- Added metadata to facilitate result tracking
- Created specialized prompt templates for subtasks

```typescript
// For tasks with a parent, add boomerang context to the prompt
if (parentTaskId) {
  // Prepend task context to prompt
  const taskContext = `
# Boomerang Task
${taskDescription ? `## Task Description\n${taskDescription}\n\n` : ''}
## Parent Task ID
${parentTaskId}

## Return Instructions
You are part of a larger workflow. After completing your task, you should ${returnMode === 'summary' ? 'provide a BRIEF SUMMARY of the results' : 'return your FULL RESULTS'}.

${returnMode === 'summary' ? 'IMPORTANT: Keep your response concise and focused on key findings/changes only!' : ''}

---

`;
  prompt = taskContext + prompt;
}
```

### 3. Roo Modes Integration

Added support for specialized agent roles using Roo Code modes:

- Implemented `.roomodes` file integration
- Added mode selection via tool parameters
- Supported model specification from mode configs
- Created file watching for real-time config updates

```typescript
// Handle Roo mode selection if enabled and specified
if (useRooModes && mode) {
  // Load room modes configuration
  const roomodes = loadRooModes();
  if (roomodes && roomodes.customModes) {
    // Find the matching mode
    const selectedMode = roomodes.customModes.find((m: any) => m.slug === mode);
    if (selectedMode) {
      debugLog(`[Debug] Found Roo mode configuration for: ${mode}`);
      // Add the mode parameter to the Claude CLI command
      claudeProcessArgs.push('--role', selectedMode.roleDefinition);
      // If the mode has a specific model, use it
      if (selectedMode.apiConfiguration && selectedMode.apiConfiguration.modelId) {
        claudeProcessArgs.push('--model', selectedMode.apiConfiguration.modelId);
      }
    }
  }
}
```

### 4. Health Check System

Added comprehensive health monitoring:

- Created a new `health` tool for system diagnostics
- Implemented Claude CLI connectivity checks
- Added system and configuration reporting
- Provided API status information

```typescript
// Handle health check tool
if (toolName === 'health') {
  // Check if Claude CLI is accessible
  let claudeCliStatus = 'unknown';
  try {
    const { stdout } = await spawnAsync('/bin/bash', [this.claudeCliPath, '--version'], { timeout: 5000 });
    claudeCliStatus = 'available';
  } catch (error) {
    claudeCliStatus = 'unavailable';
  }

  // Collect and return system information
  const healthInfo = {
    status: 'ok',
    version: this.packageVersion,
    claudeCli: {
      path: this.claudeCliPath,
      status: claudeCliStatus
    },
    config: {
      debugMode,
      heartbeatIntervalMs,
      executionTimeoutMs,
      useRooModes,
      maxRetries,
      retryDelayMs
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpus: os.cpus().length,
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024)) + 'MB',
        free: Math.round(os.freemem() / (1024 * 1024)) + 'MB'
      },
      uptime: Math.round(os.uptime() / 60) + ' minutes'
    },
    timestamp: new Date().toISOString()
  };

  return { content: [{ type: 'text', text: JSON.stringify(healthInfo, null, 2) }] };
}
```

## Reliability Improvements

### 1. Robust Error Handling with Retries

Added intelligent retry logic for transient errors:

- Implemented automatic retry with configurable parameters
- Added error classification to identify retryable issues
- Created detailed error reporting and tracking

```typescript
// Use retry for robust execution
const { stdout, stderr } = await retry(
  async (bail: (err: Error) => void, attemptNumber: number) => {
    try {
      if (attemptNumber > 1) {
        debugLog(`[Retry] Attempt ${attemptNumber}/${maxRetries + 1} for Claude CLI execution`);
      }
      
      return await spawnAsync(
        '/bin/bash',
        claudeProcessArgs,
        { timeout: executionTimeoutMs, cwd: effectiveCwd }
      );
    } catch (err: any) {
      // Log the error
      debugLog(`[Retry] Error during attempt ${attemptNumber}/${maxRetries + 1}: ${err.message}`);
      
      // Determine if we should retry based on the error
      const isNetworkError = err.message.includes('ECONNRESET') || 
                            err.message.includes('ETIMEDOUT') ||
                            err.message.includes('ECONNREFUSED');
                            
      const isTransientError = isNetworkError || 
                              err.message.includes('429') || // Rate limit
                              err.message.includes('500'); // Server error
      
      // If it's not a transient error, bail immediately
      if (!isTransientError) {
        debugLog(`[Retry] Non-retryable error: ${err.message}. Bailing out.`);
        bail(err);
        return { stdout: '', stderr: '' }; // This never happens due to bail
      }
      
      // Otherwise, throw to trigger retry
      throw err;
    }
  },
  {
    retries: maxRetries,
    minTimeout: retryDelayMs,
    onRetry: (err: Error, attempt: number) => {
      console.error(`[Progress] Retry attempt ${attempt}/${maxRetries} due to: ${err.message}`);
    }
  }
);
```

### 2. Request Tracking System

Implemented comprehensive request lifecycle management:

- Added unique IDs for each request
- Created tracking for in-progress requests
- Ensured proper cleanup on completion or failure

```typescript
// Generate a unique request ID
const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
this.activeRequests.add(requestId);

// Later, on completion:
this.activeRequests.delete(requestId);
debugLog(`[Debug] Request ${requestId} completed successfully`);

// Or on failure:
this.activeRequests.delete(requestId);
debugLog(`[Debug] Request ${requestId} failed: ${errorMessage}`);
```

### 3. Graceful Shutdown

Added proper process termination handling:

- Implemented signal handlers for SIGINT and SIGTERM
- Added tracking for in-progress requests
- Created wait logic for clean shutdown
- Ensured proper cleanup on exit

```typescript
// Handle shutdown signals
const handleShutdown = async (signal: string) => {
  console.error(`[Shutdown] Received ${signal} signal. Graceful shutdown initiated.`);
  
  // If there are active requests, wait briefly for them to complete
  if (this.activeRequests.size > 0) {
    console.error(`[Shutdown] Waiting for ${this.activeRequests.size} active requests to complete...`);
    
    // Wait up to 10 seconds for active requests to complete
    const shutdownTimeoutMs = 10000;
    const shutdownStart = Date.now();
    
    while (this.activeRequests.size > 0 && (Date.now() - shutdownStart) < shutdownTimeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (this.activeRequests.size > 0) {
      console.error(`[Shutdown] ${this.activeRequests.size} requests still active after timeout. Proceeding with shutdown anyway.`);
    } else {
      console.error('[Shutdown] All active requests completed successfully.');
    }
  }
  
  // Close the server
  await this.server.close();
  console.error('[Shutdown] Server closed. Exiting process.');
  process.exit(0);
};

// Register signal handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
```

### 4. Configuration Caching and Hot Reloading

Added performance optimization for configuration:

- Implemented caching for roomodes file
- Added automatic invalidation based on file changes
- Created configurable file watching mechanism

```typescript
// Cache for Roo modes configuration to improve performance
let roomodesCache: { data: any, timestamp: number } | null = null;
const CACHE_TTL_MS = 60000; // 1 minute cache TTL

// Setup file watcher for roomodes if enabled
if (useRooModes && watchRooModes) {
  const roomodesPath = path.join(process.cwd(), '.roomodes');
  if (existsSync(roomodesPath)) {
    try {
      const watcher = watch(roomodesPath, (eventType, filename) => {
        if (eventType === 'change') {
          // Invalidate cache when file changes
          roomodesCache = null;
          console.error(`[Info] .roomodes file changed, cache invalidated`);
        }
      });
      
      // Ensure the watcher is closed on process exit
      process.on('exit', () => {
        try {
          watcher.close();
        } catch (err) {
          // Ignore errors during shutdown
        }
      });
      
      console.error(`[Setup] Watching .roomodes file for changes`);
    } catch (error) {
      console.error(`[Warning] Failed to set up watcher for .roomodes file:`, error);
    }
  }
}
```

## Configuration Options

Added new environment variables for flexible configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_HEARTBEAT_INTERVAL_MS` | Interval between progress reports | 15000 (15s) |
| `MCP_EXECUTION_TIMEOUT_MS` | Timeout for CLI execution | 1800000 (30m) |
| `MCP_MAX_RETRIES` | Maximum retry attempts for transient errors | 3 |
| `MCP_RETRY_DELAY_MS` | Delay between retry attempts | 1000 (1s) |
| `MCP_USE_ROOMODES` | Enable Roo modes integration | false |
| `MCP_WATCH_ROOMODES` | Auto-reload .roomodes on changes | false |

## API Enhancements

### New Tools and Parameters

Added new tools and parameters to the API:

#### 1. Health Check Tool

```json
{
  "toolName": "claude_code:health",
  "arguments": {}
}
```

#### 2. New Parameters for claude_code Tool

```json
{
  "toolName": "claude_code:claude_code",
  "arguments": {
    "prompt": "...",
    "workFolder": "/path/to/project",
    "parentTaskId": "task-123",      // For task orchestration
    "returnMode": "summary",         // "summary" or "full"
    "taskDescription": "...",        // Description for orchestration
    "mode": "coder"                  // Roo mode to use
  }
}
```

## Summary of Benefits

These enhancements provide several key benefits:

1. **Improved Reliability**
   - Robust error handling with automatic retries
   - Graceful shutdown for clean process termination
   - Comprehensive request tracking and lifecycle management

2. **Enhanced Performance**
   - Configuration caching to reduce file I/O
   - Optimized roomodes parsing
   - Reduced resource usage during operation

3. **Better Monitoring**
   - Health check API for system diagnostics
   - Detailed error reporting and tracking
   - Improved logging with request IDs

4. **Advanced Task Orchestration**
   - Boomerang pattern for complex workflows
   - Specialized mode support via .roomodes
   - Flexible result formats (summary/full)

5. **Developer Experience**
   - Hot reload of configuration files
   - Comprehensive environment variable controls
   - Simplified API for complex operations
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.13.0] - 2025-05-16

### Added
- Added `convert_task_markdown` tool for converting markdown task files to MCP-compatible JSON format
- Added task converter script (`docs/task_converter.py`) that transforms human-readable task lists into executable MCP commands
- Added support for `--json-output` flag in task converter for direct JSON output to stdout
- Added comprehensive documentation and examples for task conversion in README.md
- Added validation for MCP format compliance in converted tasks
- Added robust error handling and validation for markdown format with helpful error messages
- Added structured error responses that guide users to fix formatting issues
- Added real-time progress updates during task conversion showing which tasks are being processed

### Changed
- The task converter intelligently transforms generic English instructions (like "Change directory to project and activate .venv") into exact executable commands (`cd /exact/path && source .venv/bin/activate`)
- All converted tasks include exact paths and executable commands with no ambiguity
- Error responses now include specific guidance on required markdown format and link to documentation

## [1.12.0] - 2025-05-15

### Added
- Added health check tool to monitor server status and configuration
- Added request tracking with unique IDs for improved debugging
- Added graceful shutdown capabilities to handle in-progress requests
- Added caching for .roomodes configuration with automatic invalidation
- Added file watcher to automatically reload .roomodes when changes detected
- Added MCP_WATCH_ROOMODES environment variable to control file watching
- Enhanced system status reporting in health check

### Changed
- Improved error handling during server shutdown
- Improved performance by caching .roomodes configuration

## [1.11.0] - 2025-05-15

### Added
- Added integration with Roo Code modes via `.roomodes` configuration file
- Added `mode` parameter to Claude Code tool arguments to select specialized modes
- Implemented robust retry mechanism for Claude CLI execution using async-retry
- Added support for model specification from Roo modes
- Added new environment variables for configuration:
  - `MCP_USE_ROOMODES`: Enable Roo mode integration
  - `MCP_MAX_RETRIES`: Configure retry attempts for transient errors
  - `MCP_RETRY_DELAY_MS`: Set delay between retry attempts
- Added comprehensive documentation for Roo modes integration

## [1.10.0] - 2025-05-15

### Added
- Implemented "Boomerang" task orchestration pattern similar to Roo Code
- Added new arguments for task orchestration:
  - `parentTaskId`: Identifies the parent task that created a subtask
  - `returnMode`: Controls how results are returned ('summary' or 'full')
  - `taskDescription`: Provides a description of the task for better organization
- Added special response formatting for orchestrated tasks
- Added hidden JSON markers in response for tracking completed subtasks
- Updated documentation with examples of task orchestration workflows

## [1.9.5] - 2025-05-15

### Added
- Implemented heartbeat mechanism to prevent client timeouts during long-running operations
- Added configurable heartbeat interval via `MCP_HEARTBEAT_INTERVAL_MS` environment variable (default: 15 seconds)
- Added configurable execution timeout via `MCP_EXECUTION_TIMEOUT_MS` environment variable (default: 30 minutes)
- Added execution time logging for better debugging and performance monitoring

## [1.9.4] - 2025-05-15

### Added
- Enhanced `claude_code` tool description in `src/server.ts` to reflect multi-modal capabilities (image analysis), file content analysis, and provide more comprehensive prompt tips.

### Changed
- Resized example images in `README.md` for better display via HTML width attributes.

## [1.9.3] - 2025-05-15

### Changed
- Better work directory management.

## [1.9.1] - 2025-05-14

### Changed
- Increased the maximum execution timeout for the Claude Code tool from 5 minutes to 30 minutes.

## [1.9.0] - 2025-05-14

### Changed
- Modified the input for the `claude_code` tool. The `workFolder` is now an optional explicit JSON parameter instead of being parsed from the `prompt` string. This improves clarity and simplifies prompt construction.

## [1.8.0] - 2025-05-14

### Changed
- Improved startup stability by explicitly using `/bin/bash` for Claude CLI script execution and ensuring correct command-line arguments are used.

## [1.7.0] - 2025-05-14

### Changed
- Renamed the primary MCP tool from `code` to `claude_code` for better clarity and consistency in UI (`src/server.ts`).
- Updated `README.md` to reflect the new tool name.

## [1.6.1] - 2025-05-14

### Fixed
- Amended previous commit on `feature/v1.6.0-updates` to include `dist/server.js` which was built but not staged.
- Resolved merge conflicts by rebasing `release/v1.6.1` onto `main` before merge.

*(Note: Version 1.6.1 was primarily a maintenance release for PR #6 hygiene after rebasing).*

## [1.6.0] - 2025-05-14

### Added
- Integrated logic in `src/server.ts` to parse "Your work folder is..." directive from prompts to set the Current Working Directory (CWD) for the underlying `claude-code-cli`.
- Default CWD for `claude-code-cli` is set to the user's home directory if no specific "Your work folder is..." directive is provided in the prompt.
- Enhanced error messages for `claude-code-cli` execution failures, including attempts to append `stderr` and `stdout` from the failed process to the error message.

### Fixed
- Resolved various linting errors in `src/server.ts` related to:
    - Correct access of request parameters (e.g., `args.params.name` for tool name, `args.params.arguments.prompt` for prompt).
    - Correct usage of `ErrorCode` enum members from `@modelcontextprotocol/sdk` (e.g., `ErrorCode.MethodNotFound`, `ErrorCode.InvalidParams`, `ErrorCode.InternalError` for timeouts and general failures).
- Ensured `npm run build` completes successfully after CWD logic integration and lint fixes.
- Ensured the `--dangerously-skip-permissions` flag is passed correctly as one of the first arguments to `claude-code-cli`.

### Changed
- Set default execution timeout for `claude-code-cli` to 5 minutes (300,000 ms).

---
*Older versions might not have detailed changelog entries.*
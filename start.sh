#!/bin/bash

# Set environment variables if needed
# export CLAUDE_CLI_PATH="/custom/path/to/claude"
export MCP_CLAUDE_DEBUG="false" # Disable debug logging for default

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start the server using tsx to run TypeScript directly
# Ensure you have tsx installed: npm install -g tsx or use npx
cd "$SCRIPT_DIR" # Change to the script directory to resolve src/server.ts correctly

# Note: If tsx is a local project dependency (npm install tsx), npx is preferred.
# If tsx is installed globally, you can just use `tsx src/server.ts`.
npx tsx src/server.ts
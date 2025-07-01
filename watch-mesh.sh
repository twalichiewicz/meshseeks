#!/bin/bash

# Watch mesh network logs in real-time
echo "🌐 Watching Claude Mesh Network Activity..."
echo "================================"
echo ""

# Create a named pipe for inter-process communication
PIPE=/tmp/mesh-network-logs
mkfifo $PIPE 2>/dev/null || true

# Watch Claude logs for mesh network activity
tail -f ~/Library/Caches/claude-cli-nodejs/-Users-waliwalu-GitHub/*.log 2>/dev/null | \
grep -E "\[Mesh\]|\[Agent\]|mesh_|COMPLETE|FOUND|ERROR" | \
while IFS= read -r line; do
    # Extract timestamp
    timestamp=$(date '+%H:%M:%S')
    
    # Color code based on content
    if [[ $line == *"[Mesh]"* ]]; then
        echo -e "\033[36m[$timestamp] $line\033[0m"  # Cyan for mesh
    elif [[ $line == *"COMPLETE"* ]]; then
        echo -e "\033[32m[$timestamp] ✅ $line\033[0m"  # Green for complete
    elif [[ $line == *"ERROR"* ]] || [[ $line == *"FAILED"* ]]; then
        echo -e "\033[31m[$timestamp] ❌ $line\033[0m"  # Red for errors
    elif [[ $line == *"analysis"* ]]; then
        echo -e "\033[33m[$timestamp] 🔍 $line\033[0m"  # Yellow for analysis
    elif [[ $line == *"implementation"* ]]; then
        echo -e "\033[34m[$timestamp] 🛠️  $line\033[0m"  # Blue for implementation
    elif [[ $line == *"testing"* ]]; then
        echo -e "\033[35m[$timestamp] 🧪 $line\033[0m"  # Magenta for testing
    else
        echo "[$timestamp] $line"
    fi
done
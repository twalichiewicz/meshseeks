# 🚀 Claude Code MCP Enhanced - Quick Start Guide

Get up and running with Claude Code MCP Enhanced in under 5 minutes!

## Prerequisites

1. Node.js v20+ installed
2. Claude CLI installed and configured ([install guide](https://claude.ai/cli))
3. Claude Desktop or another MCP-compatible client

## 🎯 Fastest Setup (GitHub URL)

1. **Add to your MCP configuration file:**

   ```json
   {
     "mcpServers": {
       "claude-code-mcp-enhanced": {
         "command": "npx",
         "args": ["github:grahama1970/claude-code-mcp-enhanced"],
         "env": {
           "MCP_CLAUDE_DEBUG": "false"
         }
       }
     }
   }
   ```

2. **Save the file to the correct location:**
   - Claude Desktop: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
   - Cursor: `~/.cursor/mcp.json`
   - Windsurf: `~/.codeium/windsurf/mcp_config.json`

3. **Restart your MCP client** (Claude Desktop, Cursor, etc.)

4. **Test it's working:**
   ```
   Use the claude_code tool to create a file test.txt with content "Hello MCP!"
   ```

## 🛠️ Available Tools

### 1. claude_code
Execute Claude Code commands with full system access:
```json
{
  "prompt": "Create a new Python file hello.py that prints 'Hello World'",
  "workFolder": "/path/to/project"
}
```

### 2. health
Check server status:
```json
{
  "toolName": "claude_code:health"
}
```

### 3. convert_task_markdown
Convert markdown task lists to executable MCP commands:
```json
{
  "markdownPath": "/path/to/tasks.md"
}
```

## 📝 Basic Examples

### Create a file
```
Use claude_code to create index.html with a basic HTML5 template
```

### Run a git operation
```
Use claude_code to commit all changes with message "Initial commit"
```

### Convert a task list
```
Use convert_task_markdown to convert my tasks.md file to MCP commands
```

## 🔧 Common Issues

1. **"Command not found"**: Make sure Node.js v20+ is installed
2. **Permission errors**: Run `claude --dangerously-skip-permissions` once first
3. **Tool not showing**: Restart your MCP client after configuration

## 📚 Next Steps

- Read the [full documentation](README.md) for advanced features
- Explore [task orchestration patterns](README.md#-task-orchestration-patterns)
- Learn about [Roo modes](README.md#-roo-modes-integration)
- Check out [example use cases](README.md#-key-use-cases)

## 🆘 Need Help?

- [GitHub Issues](https://github.com/grahama1970/claude-code-mcp-enhanced/issues)
- [Full Documentation](README.md)
- [Troubleshooting Guide](README.md#-troubleshooting)

---
*Ready in 5 minutes, powerful for a lifetime! 🚀*
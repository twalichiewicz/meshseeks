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
**Automatically converts human-readable markdown task lists into MCP-compliant JSON commands that Claude Code executes sequentially!**

This powerful tool transforms your TODO lists into executable code operations:
```json
{
  "markdownPath": "/path/to/tasks.md"
}
```

**What it does:**
- Takes a markdown file with human-readable tasks (like "Create user authentication module")
- Converts them to exact, executable commands (like `cd /project && python create_auth.py`)
- Outputs MCP-compliant JSON that Claude Code can run step-by-step
- No more manual command translation - just write what you want done!

## 📝 Basic Examples

### Create a file
```
Use claude_code to create index.html with a basic HTML5 template
```

### Run a git operation
```
Use claude_code to commit all changes with message "Initial commit"
```

### Convert a task list to executable commands
```
Use convert_task_markdown to convert my tasks.md file to MCP commands
```

**Example: Your markdown file says:**
```markdown
- [ ] Create user authentication module
- [ ] Add login endpoint
- [ ] Write unit tests
```

**The tool automatically converts to:**
```json
[
  {
    "tool": "claude_code",
    "arguments": {
      "prompt": "cd /project && create auth_module.py...",
      "workFolder": "/project"
    }
  },
  {
    "tool": "claude_code",
    "arguments": {
      "prompt": "cd /project && add login endpoint to api/routes.py...",
      "workFolder": "/project"
    }
  },
  // ... more tasks
]
```

**Claude Code then executes each task sequentially!** 🚀

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
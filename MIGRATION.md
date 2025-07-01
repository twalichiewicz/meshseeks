# 🟦 MeshSeeks Migration Guide

## Repository Migration

Since MeshSeeks is now its own project, here's how to set up the new repository:

### 1. Create New Repository
```bash
# Create new repo on GitHub: github.com/twalichiewicz/meshseeks

# Clone current work to new location
cd ~/GitHub
git clone claude-code-mcp-enhanced meshseeks
cd meshseeks

# Update git remote
git remote set-url origin git@github.com:twalichiewicz/meshseeks.git
```

### 2. Clean Up Legacy Files
Remove files specific to the original enhanced MCP server that aren't needed for MeshSeeks:
- Original server.ts (keep for reference but mark as legacy)
- Task converter functionality (unless you want to keep it)
- Some of the original documentation

### 3. Update All References
- Change all instances of "claude-code-mcp-enhanced" to "meshseeks"
- Update import paths
- Update CLI commands

### 4. NPM Publishing
```bash
# When ready to publish
npm login
npm publish --access public
```

Users can then install with:
```bash
npm install -g @meshseeks/mcp-server
```

### 5. Update Claude Configuration
Users will update their `.claude.json`:
```json
{
  "mcpServers": {
    "meshseeks": {
      "type": "stdio",
      "command": "meshseeks",
      "env": {
        "MCP_MESH_MAX_AGENTS": "5",
        "MESHSEEKS_CATCHPHRASE": "true"
      }
    }
  }
}
```

## File Structure for New Repo

```
meshseeks/
├── README.md              # MeshSeeks branding
├── LICENSE               # MIT
├── package.json          # @meshseeks/mcp-server
├── tsconfig.json
├── .meshconfig           # Default mesh configuration
├── src/
│   ├── index.ts         # Main entry point
│   ├── mesh-server.ts   # MeshSeeks server
│   ├── mesh-coordinator.ts
│   └── agents/          # Agent specializations
│       ├── analysis.ts
│       ├── implementation.ts
│       ├── testing.ts
│       ├── documentation.ts
│       └── debugging.ts
├── docs/
│   ├── ARCHITECTURE.md
│   ├── GETTING_STARTED.md
│   └── MEESEEKS_GUIDE.md
├── examples/
│   └── example-problems/
└── assets/
    └── meshseeks-logo.png
```

## Branding Assets

Consider creating:
- MeshSeeks logo (blue box character in a mesh network)
- Color scheme: MeshSeeks Blue (#5DADE2)
- Tagline: "I'm MeshSeeks! Look at me!"
- Documentation with personality
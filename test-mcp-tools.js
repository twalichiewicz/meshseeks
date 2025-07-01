#!/usr/bin/env node

// Simple test to check which tools are exposed by each server

console.log('Testing MCP Server Tools...\n');

// Test the mesh server
console.log('1. Mesh Server Tools (mesh-server.js):');
console.log('   Expected tools:');
console.log('   - mesh_analyze_problem');
console.log('   - mesh_execute_tasks');
console.log('   - mesh_solve_problem');
console.log('   - mesh_status');
console.log('');

console.log('2. Enhanced Server Tools (server.js):');
console.log('   Expected tools:');
console.log('   - health');
console.log('   - convert_task_markdown');
console.log('   - claude_code');
console.log('');

console.log('If you\'re seeing the enhanced tools when using mesh-server.js,');
console.log('it means the server is being overridden by the import.');
console.log('');
console.log('To fix this in Claude:');
console.log('1. Use the tool name directly: "Use mesh_analyze_problem to..."');
console.log('2. Or restart Claude and try again');
console.log('3. Or use both servers with different names');
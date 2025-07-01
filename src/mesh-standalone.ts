#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type ServerResult,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Standalone Mesh Network Server
 * Simple implementation to test mesh tools without conflicts
 */
class StandaloneMeshServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mesh_network',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.server.onerror = (error) => console.error('[Mesh Standalone Error]', error);
  }

  private setupHandlers(): void {
    // List available mesh tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'mesh_status',
          description: 'Check the mesh network status',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'mesh_test',
          description: 'Test the mesh network connection',
          inputSchema: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'Test message to echo',
              },
            },
            required: [],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (args): Promise<ServerResult> => {
      const toolName = args.params.name;
      console.error(`[Mesh Standalone] Tool called: ${toolName}`);

      switch (toolName) {
        case 'mesh_status':
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                status: 'active',
                server: 'mesh_standalone',
                timestamp: new Date().toISOString(),
                message: 'Mesh network standalone server is running correctly!',
                capabilities: ['mesh_status', 'mesh_test']
              }, null, 2)
            }]
          };

        case 'mesh_test':
          const message = args.params.arguments?.message || 'Hello from mesh network!';
          return {
            content: [{
              type: 'text',
              text: `Echo from mesh network: ${message}`
            }]
          };

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool ${toolName} not found`);
      }
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Standalone Mesh Network Server running on stdio');
  }
}

// Run the server
const server = new StandaloneMeshServer();
server.run().catch(console.error);
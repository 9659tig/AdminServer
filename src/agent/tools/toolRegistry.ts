import { AgentTool } from './types';

export class ToolRegistry {
    private readonly tools = new Map<string, AgentTool>();

    register(name: string, tool: AgentTool): void {
        this.tools.set(name, tool);
    }

    get(name: string): AgentTool {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }
        return tool;
    }
}

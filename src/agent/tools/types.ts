export interface AgentTool {
    run(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

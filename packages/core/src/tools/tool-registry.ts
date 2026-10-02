import { ToolDefinition } from '@flappycode/providers';

export interface DynamicToolRegistration {
  definition: ToolDefinition;
  handler: (args: Record<string, any>) => Promise<any>;
  permissionTier?: 'read' | 'write' | 'execute';
  source?: string;
}

export class ToolRegistry {
  private tools = new Map<string, DynamicToolRegistration>();

  public registerTool(reg: DynamicToolRegistration): void {
    if (!reg.definition || !reg.definition.function || !reg.definition.function.name) {
      throw new Error('Invalid ToolDefinition: function.name is required');
    }
    const name = reg.definition.function.name;
    this.tools.set(name, {
      ...reg,
      permissionTier: reg.permissionTier || 'execute',
    });
  }

  public unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  public getTool(name: string): DynamicToolRegistration | undefined {
    return this.tools.get(name);
  }

  public listToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  public async executeTool(
    name: string,
    args: Record<string, any>,
    permissionChecker?: (tier: 'read' | 'write' | 'execute') => Promise<boolean>
  ): Promise<any> {
    const reg = this.tools.get(name);
    if (!reg) {
      throw new Error(`Tool '${name}' is not registered in ToolRegistry`);
    }

    if (permissionChecker) {
      const allowed = await permissionChecker(reg.permissionTier || 'execute');
      if (!allowed) {
        throw new Error(`Permission denied for tool '${name}' (${reg.permissionTier} tier)`);
      }
    }

    return reg.handler(args);
  }

  public clear(): void {
    this.tools.clear();
  }
}

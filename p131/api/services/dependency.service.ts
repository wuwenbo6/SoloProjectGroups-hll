import { PrismaClient, Plugin, PluginDependency } from '@prisma/client';

const prisma = new PrismaClient();

interface DependencyNode {
  id: string;
  name: string;
  version?: string;
  dependencies: DependencyNode[];
  optional: boolean;
  resolved: boolean;
  circular: boolean;
  error?: string;
}

interface ResolveOptions {
  maxDepth?: number;
  visited?: Set<string>;
  path?: string[];
}

const DEFAULT_MAX_DEPTH = 5;

export class DependencyResolver {
  private resolutionCache = new Map<string, DependencyNode>();

  async resolveDependencies(
    pluginId: string,
    options: ResolveOptions = {}
  ): Promise<DependencyNode> {
    const { maxDepth = DEFAULT_MAX_DEPTH, visited = new Set(), path = [] } = options;

    if (this.resolutionCache.has(pluginId) && path.length === 0) {
      return this.resolutionCache.get(pluginId)!;
    }

    if (visited.has(pluginId)) {
      return {
        id: pluginId,
        name: path[path.length - 1] || pluginId,
        dependencies: [],
        optional: false,
        resolved: false,
        circular: true,
        error: 'Circular dependency detected',
      };
    }

    if (path.length >= maxDepth) {
      return {
        id: pluginId,
        name: path[path.length - 1] || pluginId,
        dependencies: [],
        optional: false,
        resolved: false,
        circular: false,
        error: `Maximum dependency depth (${maxDepth}) reached`,
      };
    }

    visited.add(pluginId);

    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      include: {
        dependencies: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!plugin) {
      visited.delete(pluginId);
      return {
        id: pluginId,
        name: 'Unknown Plugin',
        dependencies: [],
        optional: false,
        resolved: false,
        circular: false,
        error: 'Plugin not found',
      };
    }

    const dependencyNodes: DependencyNode[] = [];

    for (const dep of plugin.dependencies) {
      const resolvedDep = await this.resolveDependencyByName(
        dep.dependencyName,
        {
          maxDepth,
          visited: new Set(visited),
          path: [...path, plugin.name],
        }
      );

      if (resolvedDep) {
        resolvedDep.optional = dep.optional;
        dependencyNodes.push(resolvedDep);
      }
    }

    visited.delete(pluginId);

    const result: DependencyNode = {
      id: plugin.id,
      name: plugin.name,
      version: plugin.versions?.[0]?.version,
      dependencies: dependencyNodes,
      optional: false,
      resolved: true,
      circular: false,
    };

    if (path.length === 0) {
      this.resolutionCache.set(pluginId, result);
    }

    return result;
  }

  private async resolveDependencyByName(
    name: string,
    options: ResolveOptions
  ): Promise<DependencyNode | null> {
    const plugin = await prisma.plugin.findFirst({
      where: {
        OR: [
          { name },
          { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
        ],
      },
    });

    if (!plugin) {
      return {
        id: name,
        name,
        dependencies: [],
        optional: false,
        resolved: false,
        circular: false,
        error: 'Dependency not found in repository',
      };
    }

    return this.resolveDependencies(plugin.id, options);
  }

  async checkCircularDependencies(pluginId: string): Promise<{
    hasCircular: boolean;
    cycles: string[][];
  }> {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const path: string[] = [];
    const pathSet = new Set<string>();

    const dfs = async (id: string): Promise<void> => {
      if (pathSet.has(id)) {
        const cycleStart = path.indexOf(id);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), id]);
        }
        return;
      }

      if (visited.has(id)) return;

      pathSet.add(id);
      path.push(id);

      const plugin = await prisma.plugin.findUnique({
        where: { id },
        include: { dependencies: true },
      });

      if (plugin) {
        for (const dep of plugin.dependencies) {
          const depPlugin = await prisma.plugin.findFirst({
            where: {
              OR: [
                { name: dep.dependencyName },
                { slug: dep.dependencyName.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
              ],
            },
          });

          if (depPlugin) {
            await dfs(depPlugin.id);
          }
        }
      }

      pathSet.delete(id);
      path.pop();
      visited.add(id);
    };

    await dfs(pluginId);

    return {
      hasCircular: cycles.length > 0,
      cycles,
    };
  }

  async getDependencyTree(pluginId: string): Promise<DependencyNode> {
    return this.resolveDependencies(pluginId);
  }

  clearCache(): void {
    this.resolutionCache.clear();
  }
}

export const dependencyResolver = new DependencyResolver();

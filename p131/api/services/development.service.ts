import { PrismaClient } from '@prisma/client';
import { parseMetadataTxt, generateSlug } from '../utils/metadata-parser';

const prisma = new PrismaClient();

export interface DraftMetadata {
  name: string;
  version: string;
  description: string;
  about?: string;
  author: string;
  email?: string;
  qgisMinimumVersion: string;
  qgisMaximumVersion?: string;
  homepage?: string;
  tracker?: string;
  repository?: string;
  category?: string;
  icon?: string;
  license?: string;
  deprecated?: boolean;
  experimental?: boolean;
  tags?: string[];
  changelog?: string;
  dependencies?: string[];
}

export interface PluginDraft {
  id?: string;
  pluginId?: string;
  metadata: DraftMetadata;
  rawContent: string;
  updatedAt: string;
  status: 'draft' | 'published' | 'archived';
}

export class DevelopmentService {
  private drafts = new Map<string, PluginDraft>();

  async getDrafts(userId: string) {
    return prisma.plugin.findMany({
      where: {
        uploadedById: userId,
        approved: false,
      },
      include: {
        category: true,
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createDraft(userId: string, metadata: DraftMetadata) {
    const slug = generateSlug(metadata.name);

    const existing = await prisma.plugin.findUnique({ where: { slug } });
    if (existing) {
      throw new Error(`Plugin with name "${metadata.name}" already exists`);
    }

    const plugin = await prisma.plugin.create({
      data: {
        name: metadata.name,
        slug,
        description: metadata.description,
        author: metadata.author,
        email: metadata.email,
        icon: metadata.icon,
        qgisMinVersion: metadata.qgisMinimumVersion,
        qgisMaxVersion: metadata.qgisMaximumVersion,
        homepage: metadata.homepage,
        tracker: metadata.tracker,
        repository: metadata.repository,
        license: metadata.license,
        deprecated: metadata.deprecated || false,
        experimental: metadata.experimental || false,
        approved: false,
        uploadedById: userId,
      },
    });

    return plugin;
  }

  async updateDraft(pluginId: string, metadata: Partial<DraftMetadata>) {
    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (metadata.name) {
      updateData.name = metadata.name;
      updateData.slug = generateSlug(metadata.name);
    }
    if (metadata.description !== undefined) {
      updateData.description = metadata.description;
    }
    if (metadata.author !== undefined) {
      updateData.author = metadata.author;
    }
    if (metadata.email !== undefined) {
      updateData.email = metadata.email;
    }
    if (metadata.icon !== undefined) {
      updateData.icon = metadata.icon;
    }
    if (metadata.qgisMinimumVersion !== undefined) {
      updateData.qgisMinVersion = metadata.qgisMinimumVersion;
    }
    if (metadata.qgisMaximumVersion !== undefined) {
      updateData.qgisMaxVersion = metadata.qgisMaximumVersion;
    }
    if (metadata.homepage !== undefined) {
      updateData.homepage = metadata.homepage;
    }
    if (metadata.tracker !== undefined) {
      updateData.tracker = metadata.tracker;
    }
    if (metadata.repository !== undefined) {
      updateData.repository = metadata.repository;
    }
    if (metadata.license !== undefined) {
      updateData.license = metadata.license;
    }
    if (metadata.deprecated !== undefined) {
      updateData.deprecated = metadata.deprecated;
    }
    if (metadata.experimental !== undefined) {
      updateData.experimental = metadata.experimental;
    }

    if (metadata.category) {
      const category = await prisma.category.upsert({
        where: { name: metadata.category },
        create: { name: metadata.category },
        update: {},
      });
      updateData.categoryId = category.id;
    }

    return prisma.plugin.update({
      where: { id: pluginId },
      data: updateData,
      include: {
        category: true,
        versions: {
          orderBy: { createdAt: 'desc' },
        },
        dependencies: true,
      },
    });
  }

  async publishDraft(pluginId: string) {
    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      include: { versions: true },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    if (plugin.versions.length === 0) {
      throw new Error('Cannot publish plugin without any version');
    }

    return prisma.plugin.update({
      where: { id: pluginId },
      data: {
        approved: true,
        updatedAt: new Date(),
      },
      include: {
        category: true,
        versions: {
          orderBy: { createdAt: 'desc' },
        },
        dependencies: true,
      },
    });
  }

  async rollbackVersion(pluginId: string, versionId: string) {
    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const targetVersion = plugin.versions.find(v => v.id === versionId);
    if (!targetVersion) {
      throw new Error('Version not found');
    }

    const latestVersion = plugin.versions[0];
    if (latestVersion && latestVersion.id === versionId) {
      throw new Error('Cannot rollback to current version');
    }

    const rollbackVersion = `${targetVersion.version}-rollback`;

    const newVersion = await prisma.pluginVersion.create({
      data: {
        pluginId,
        version: rollbackVersion,
        changelog: `Rollback to version ${targetVersion.version}`,
        filename: targetVersion.filename,
        fileSize: targetVersion.fileSize,
        md5Hash: targetVersion.md5Hash,
      },
    });

    return {
      success: true,
      plugin: plugin.name,
      originalVersion: targetVersion.version,
      newVersion: rollbackVersion,
      message: `Successfully rolled back to version ${targetVersion.version}`,
    };
  }

  async exportDependencyGraph(pluginId: string, format: 'json' | 'dot' | 'mermaid') {
    const { dependencyResolver } = await import('./dependency.service');
    
    const tree = await dependencyResolver.getDependencyTree(pluginId);

    if (format === 'json') {
      return {
        format,
        content: JSON.stringify(tree, null, 2),
        filename: `${tree.name}-dependencies.json`,
        mimeType: 'application/json',
      };
    }

    if (format === 'dot') {
      const dotContent = this.generateDotGraph(tree);
      return {
        format,
        content: dotContent,
        filename: `${tree.name}-dependencies.dot`,
        mimeType: 'text/vnd.graphviz',
      };
    }

    if (format === 'mermaid') {
      const mermaidContent = this.generateMermaidGraph(tree);
      return {
        format,
        content: mermaidContent,
        filename: `${tree.name}-dependencies.mmd`,
        mimeType: 'text/vnd.mermaid',
      };
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  private generateDotGraph(root: any): string {
    const lines: string[] = [];
    lines.push('digraph Dependencies {');
    lines.push('  rankdir=LR;');
    lines.push('  node [shape=box, style=filled, fillcolor="#1e3a5f", fontcolor=white];');
    lines.push('  edge [color="#2dd4bf"];');

    const addNode = (node: any, parent?: string) => {
      const nodeId = node.name.replace(/[^a-zA-Z0-9]/g, '_');
      const label = `${node.name}\\nv${node.version || '?'}`;
      
      let style = '';
      if (node.circular) {
        style = ', fillcolor="#f97316"';
      } else if (!node.resolved) {
        style = ', fillcolor="#ef4444"';
      } else if (node.optional) {
        style = ', fillcolor="#64748b"';
      }

      lines.push(`  "${nodeId}" [label="${label}"${style}];`);

      if (parent) {
        lines.push(`  "${parent}" -> "${nodeId}";`);
      }

      if (node.dependencies) {
        for (const dep of node.dependencies) {
          addNode(dep, nodeId);
        }
      }
    };

    addNode(root);
    lines.push('}');

    return lines.join('\n');
  }

  private generateMermaidGraph(root: any): string {
    const lines: string[] = [];
    lines.push('graph TD');

    const addNode = (node: any, parent?: string, index: number = 0) => {
      const nodeId = `${node.name.replace(/[^a-zA-Z0-9]/g, '_')}_${index}`;
      const label = node.name;

      let shape = 'rect';
      if (node.circular) {
        shape = 'hexagon';
      } else if (!node.resolved) {
        shape = 'circle';
      } else if (node.optional) {
        shape = 'stadium';
      }

      lines.push(`    ${nodeId}[${label}]`);

      if (parent) {
        lines.push(`    ${parent} --> ${nodeId}`);
      }

      if (node.dependencies) {
        node.dependencies.forEach((dep: any, i: number) => {
          addNode(dep, nodeId, i);
        });
      }
    };

    addNode(root);

    return lines.join('\n');
  }
}

export const developmentService = new DevelopmentService();

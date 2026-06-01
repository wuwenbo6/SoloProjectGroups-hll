import { PrismaClient, Plugin, Prisma } from '@prisma/client';
import { PluginFilter } from '../types';
import { generateSlug } from '../utils/metadata-parser';

const prisma = new PrismaClient();

export class PluginService {
  async getPlugins(filter: PluginFilter) {
    const {
      search,
      category,
      minRating,
      qgisVersion,
      deprecated = false,
      experimental,
      approved = true,
      sortBy = 'downloads',
      sortOrder = 'desc',
      page = 1,
      pageSize = 20,
    } = filter;

    const where: Prisma.PluginWhereInput = {
      deprecated,
      approved,
    };

    if (search) {
      const searchLower = search.toLowerCase();
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { author: { contains: search } },
        { name: { contains: searchLower } },
        { description: { contains: searchLower } },
        { author: { contains: searchLower } },
      ];
    }

    if (category) {
      where.category = { name: category };
    }

    if (minRating !== undefined) {
      where.averageRating = { gte: minRating };
    }

    if (qgisVersion) {
      where.AND = [
        { qgisMinVersion: { lte: qgisVersion } },
        {
          OR: [
            { qgisMaxVersion: { gte: qgisVersion } },
            { qgisMaxVersion: null },
          ],
        },
      ];
    }

    if (experimental !== undefined) {
      where.experimental = experimental;
    }

    const orderBy: Prisma.PluginOrderByWithRelationInput = {};
    if (sortBy === 'rating') {
      orderBy.averageRating = sortOrder;
    } else if (sortBy === 'name') {
      orderBy.name = sortOrder;
    } else if (sortBy === 'createdAt') {
      orderBy.createdAt = sortOrder;
    } else {
      orderBy.downloads = sortOrder;
    }

    const skip = (page - 1) * pageSize;

    const [plugins, total] = await Promise.all([
      prisma.plugin.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          category: true,
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: {
            select: { ratings: true },
          },
        },
      }),
      prisma.plugin.count({ where }),
    ]);

    return {
      items: plugins,
      total,
      page,
      pageSize,
    };
  }

  async getPluginById(id: string) {
    return prisma.plugin.findUnique({
      where: { id },
      include: {
        category: true,
        versions: {
          orderBy: { createdAt: 'desc' },
        },
        dependencies: true,
        ratings: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        uploadedBy: {
          select: { name: true, email: true },
        },
      },
    });
  }

  async getPluginBySlug(slug: string) {
    return prisma.plugin.findUnique({
      where: { slug },
      include: {
        category: true,
        versions: {
          orderBy: { createdAt: 'desc' },
        },
        dependencies: true,
        ratings: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  async createPlugin(data: {
    metadata: any;
    filename: string;
    fileSize: number;
    md5Hash: string;
    iconPath?: string;
    userId?: string;
  }) {
    const { metadata, filename, fileSize, md5Hash, iconPath, userId } = data;
    const slug = generateSlug(metadata.name);

    const existing = await prisma.plugin.findUnique({ where: { slug } });
    
    if (existing) {
      return this.updatePluginVersion(existing.id, {
        version: metadata.version,
        changelog: metadata.changelog,
        filename,
        fileSize,
        md5Hash,
      });
    }

    let category = null;
    if (metadata.category) {
      category = await prisma.category.upsert({
        where: { name: metadata.category },
        create: { name: metadata.category },
        update: {},
      });
    }

    const plugin = await prisma.plugin.create({
      data: {
        name: metadata.name,
        slug,
        description: metadata.description,
        author: metadata.author,
        email: metadata.email,
        icon: iconPath,
        categoryId: category?.id,
        qgisMinVersion: metadata.qgisMinimumVersion,
        qgisMaxVersion: metadata.qgisMaximumVersion,
        homepage: metadata.homepage,
        tracker: metadata.tracker,
        repository: metadata.repository,
        license: metadata.license,
        deprecated: metadata.deprecated || false,
        experimental: metadata.experimental || false,
        approved: true,
        uploadedById: userId,
        versions: {
          create: {
            version: metadata.version,
            changelog: metadata.changelog,
            filename,
            fileSize,
            md5Hash,
          },
        },
        dependencies: metadata.dependencies
          ? {
              create: metadata.dependencies.map((dep: string) => ({
                dependencyName: dep,
              })),
            }
          : undefined,
      },
      include: {
        versions: true,
        dependencies: true,
      },
    });

    return plugin;
  }

  async updatePluginVersion(
    pluginId: string,
    data: {
      version: string;
      changelog?: string;
      filename: string;
      fileSize: number;
      md5Hash: string;
    }
  ) {
    const existingVersion = await prisma.pluginVersion.findUnique({
      where: {
        pluginId_version: {
          pluginId,
          version: data.version,
        },
      },
    });

    if (existingVersion) {
      throw new Error(`Version ${data.version} already exists for this plugin`);
    }

    const [version, plugin] = await Promise.all([
      prisma.pluginVersion.create({
        data: {
          pluginId,
          version: data.version,
          changelog: data.changelog,
          filename: data.filename,
          fileSize: data.fileSize,
          md5Hash: data.md5Hash,
        },
      }),
      prisma.plugin.update({
        where: { id: pluginId },
        data: { updatedAt: new Date() },
        include: {
          versions: {
            orderBy: { createdAt: 'desc' },
          },
          dependencies: true,
        },
      }),
    ]);

    return plugin;
  }

  async incrementDownloads(pluginId: string) {
    return prisma.plugin.update({
      where: { id: pluginId },
      data: {
        downloads: {
          increment: 1,
        },
      },
    });
  }

  async deletePlugin(pluginId: string) {
    return prisma.plugin.delete({
      where: { id: pluginId },
    });
  }

  async getCategories() {
    return prisma.category.findMany({
      include: {
        _count: {
          select: { plugins: true },
        },
      },
    });
  }

  async getAllPluginsForXml() {
    return prisma.plugin.findMany({
      where: {
        approved: true,
        deprecated: false,
      },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        dependencies: true,
        category: true,
      },
    });
  }
}

export const pluginService = new PluginService();

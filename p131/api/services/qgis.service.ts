import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class QgisService {
  async getServers() {
    return prisma.qgisServer.findMany({
      include: {
        _count: {
          select: { installedPlugins: true },
        },
      },
    });
  }

  async addServer(data: { name: string; url: string; apiKey: string }) {
    return prisma.qgisServer.create({
      data,
    });
  }

  async updateServer(id: string, data: { name?: string; url?: string; apiKey?: string }) {
    return prisma.qgisServer.update({
      where: { id },
      data,
    });
  }

  async deleteServer(id: string) {
    return prisma.qgisServer.delete({
      where: { id },
    });
  }

  async checkServerStatus(serverId: string): Promise<boolean> {
    const server = await prisma.qgisServer.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      return false;
    }

    try {
      const response = await fetch(`${server.url}/plugins`, {
        headers: {
          'X-API-Key': server.apiKey,
        },
        signal: AbortSignal.timeout(5000),
      });

      const isOnline = response.ok;
      
      await prisma.qgisServer.update({
        where: { id: serverId },
        data: { status: isOnline ? 'online' : 'offline' },
      });

      return isOnline;
    } catch (err) {
      await prisma.qgisServer.update({
        where: { id: serverId },
        data: { status: 'offline' },
      });
      return false;
    }
  }

  async getInstalledPlugins(serverId: string) {
    const server = await prisma.qgisServer.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      throw new Error('Server not found');
    }

    try {
      const response = await fetch(`${server.url}/plugins`, {
        headers: {
          'X-API-Key': server.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch plugins from QGIS Server');
      }

      const data = await response.json();
      
      const dbInstallations = await prisma.serverPlugin.findMany({
        where: { serverId },
        include: { plugin: true },
      });

      return {
        serverPlugins: data.plugins || [],
        trackedInstallations: dbInstallations,
      };
    } catch (err) {
      const dbInstallations = await prisma.serverPlugin.findMany({
        where: { serverId },
        include: { plugin: true },
      });

      return {
        serverPlugins: [],
        trackedInstallations: dbInstallations,
        error: (err as Error).message,
      };
    }
  }

  async installPlugin(serverId: string, pluginId: string, pluginVersion: string) {
    const server = await prisma.qgisServer.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      throw new Error('Server not found');
    }

    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      include: {
        versions: {
          where: { version: pluginVersion },
        },
        dependencies: true,
      },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    const version = plugin.versions[0];
    if (!version) {
      throw new Error('Plugin version not found');
    }

    let installationSuccess = true;
    let activationSuccess = true;
    let errorMessage: string | undefined;

    try {
      const downloadUrl = `${process.env.BASE_URL || 'http://localhost:3001'}/api/plugins/${pluginId}/download`;
      
      const response = await fetch(`${server.url}/plugins/install`, {
        method: 'POST',
        headers: {
          'X-API-Key': server.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pluginName: plugin.name,
          version: pluginVersion,
          downloadUrl,
          md5Hash: version.md5Hash,
          activate: true,
          resolveDependencies: true,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Installation failed with status ${response.status}`);
      }

      const result = await response.json().catch(() => ({}));
      
      if (result.activated === false) {
        activationSuccess = false;
      }
    } catch (err) {
      installationSuccess = false;
      errorMessage = (err as Error).message;
    }

    if (installationSuccess) {
      await prisma.serverPlugin.upsert({
        where: {
          serverId_pluginId: {
            serverId,
            pluginId,
          },
        },
        create: {
          serverId,
          pluginId,
          installedVersion: pluginVersion,
          enabled: activationSuccess,
          activated: activationSuccess,
        },
        update: {
          installedVersion: pluginVersion,
          enabled: activationSuccess,
          activated: activationSuccess,
          installedAt: new Date(),
        },
      });
    }

    return {
      success: installationSuccess,
      plugin: plugin.name,
      version: pluginVersion,
      activated: activationSuccess,
      requiresRestart: !activationSuccess,
      error: errorMessage,
    };
  }

  async activatePlugin(serverId: string, pluginId: string) {
    const server = await prisma.qgisServer.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      throw new Error('Server not found');
    }

    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    let activationSuccess = true;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${server.url}/plugins/${plugin.name}/activate`, {
        method: 'POST',
        headers: {
          'X-API-Key': server.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Activation failed with status ${response.status}`);
      }
    } catch (err) {
      activationSuccess = false;
      errorMessage = (err as Error).message;
    }

    if (activationSuccess) {
      await prisma.serverPlugin.updateMany({
        where: {
          serverId,
          pluginId,
        },
        data: {
          enabled: true,
          activated: true,
        },
      });
    }

    return {
      success: activationSuccess,
      plugin: plugin.name,
      error: errorMessage,
    };
  }

  async uninstallPlugin(serverId: string, pluginId: string) {
    const server = await prisma.qgisServer.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      throw new Error('Server not found');
    }

    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error('Plugin not found');
    }

    let uninstallSuccess = true;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(`${server.url}/plugins/${plugin.name}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': server.apiKey,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Uninstallation failed with status ${response.status}`);
      }
    } catch (err) {
      uninstallSuccess = false;
      errorMessage = (err as Error).message;
    }

    if (uninstallSuccess) {
      await prisma.serverPlugin.deleteMany({
        where: {
          serverId,
          pluginId,
        },
      });
    }

    return {
      success: uninstallSuccess,
      plugin: plugin.name,
      error: errorMessage,
    };
  }
}

export const qgisService = new QgisService();

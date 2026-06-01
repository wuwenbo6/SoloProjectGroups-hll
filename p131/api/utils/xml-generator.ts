import { create } from 'xmlbuilder2';
import { Plugin, PluginVersion, Category, PluginDependency } from '@prisma/client';

interface PluginWithVersion extends Plugin {
  versions: PluginVersion[];
  dependencies: PluginDependency[];
  category: Category | null;
  tags?: string[];
  about?: string;
}

export function generatePluginsXml(
  plugins: PluginWithVersion[],
  baseUrl: string
): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('plugins');

  for (const plugin of plugins) {
    const latestVersion = plugin.versions[0];
    if (!latestVersion) continue;

    const pluginEl = root.ele('pyqgis_plugin', {
      name: plugin.name,
      version: latestVersion.version,
      plugin_id: plugin.id,
    });

    pluginEl.ele('description').txt(plugin.description);
    pluginEl.ele('about').txt(plugin.description);

    pluginEl.ele('version').txt(latestVersion.version);
    pluginEl.ele('author').txt(plugin.author);

    if (plugin.email) {
      pluginEl.ele('email').txt(plugin.email);
    }

    pluginEl.ele('qgis_minimum_version').txt(plugin.qgisMinVersion);

    if (plugin.qgisMaxVersion) {
      pluginEl.ele('qgis_maximum_version').txt(plugin.qgisMaxVersion);
    }

    if (plugin.homepage) {
      pluginEl.ele('homepage').txt(plugin.homepage);
    }

    if (plugin.tracker) {
      pluginEl.ele('tracker').txt(plugin.tracker);
    }

    if (plugin.repository) {
      pluginEl.ele('repository').txt(plugin.repository);
    }

    if (plugin.icon) {
      pluginEl.ele('icon').txt(`${baseUrl}${plugin.icon}`);
    }

    if (plugin.license) {
      pluginEl.ele('license').txt(plugin.license);
    }

    pluginEl.ele('deprecated').txt(plugin.deprecated ? 'True' : 'False');
    pluginEl.ele('experimental').txt(plugin.experimental ? 'True' : 'False');

    if (latestVersion.changelog) {
      pluginEl.ele('changelog').txt(latestVersion.changelog);
    }

    pluginEl.ele('download_url').txt(
      `${baseUrl}/api/plugins/${plugin.id}/download`
    );

    pluginEl.ele('file_name').txt(latestVersion.filename);
    pluginEl.ele('file_size').txt(String(latestVersion.fileSize));
    pluginEl.ele('md5hash').txt(latestVersion.md5Hash);

    if (plugin.category) {
      pluginEl.ele('category').txt(plugin.category.name);
    }

    if (plugin.dependencies && plugin.dependencies.length > 0) {
      const depsEl = pluginEl.ele('dependencies');
      for (const dep of plugin.dependencies) {
        depsEl.ele('dep', { name: dep.dependencyName });
      }
    }

    pluginEl.ele('tags').txt('');
    pluginEl.ele('rating').txt(String(plugin.averageRating));
    pluginEl.ele('votes').txt(String(plugin.ratingCount));
    pluginEl.ele('downloads').txt(String(plugin.downloads));
  }

  return root.end({ prettyPrint: true });
}

export function generateRssXml(
  plugins: PluginWithVersion[],
  baseUrl: string
): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('rss', { version: '2.0' })
    .ele('channel');

  root.ele('title').txt('QGIS Plugin Repository');
  root.ele('link').txt(baseUrl);
  root.ele('description').txt('Latest QGIS plugins');
  root.ele('language').txt('en-us');

  for (const plugin of plugins.slice(0, 20)) {
    const latestVersion = plugin.versions[0];
    if (!latestVersion) continue;

    const item = root.ele('item');
    item.ele('title').txt(`${plugin.name} ${latestVersion.version}`);
    item.ele('link').txt(`${baseUrl}/plugin/${plugin.id}`);
    item.ele('description').txt(plugin.description);
    item.ele('guid', { isPermaLink: 'false' }).txt(`${plugin.id}-${latestVersion.version}`);
    item.ele('pubDate').txt(latestVersion.createdAt.toUTCString());
  }

  return root.end({ prettyPrint: true });
}

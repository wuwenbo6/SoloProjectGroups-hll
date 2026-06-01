import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const categories = [
    { name: '矢量处理', description: '矢量数据处理工具', icon: 'vector' },
    { name: '栅格处理', description: '栅格数据分析工具', icon: 'raster' },
    { name: '数据库', description: '数据库连接与管理', icon: 'database' },
    { name: '网络分析', description: '网络分析与路径规划', icon: 'network' },
    { name: '制图输出', description: '地图排版与输出', icon: 'cartography' },
    { name: '数据获取', description: '在线数据获取与导入', icon: 'acquisition' },
    { name: '其他', description: '其他类型插件', icon: 'other' },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      create: cat,
      update: cat,
    });
  }

  console.log('Categories seeded');

  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@qgis.com' },
    create: {
      email: 'admin@qgis.com',
      passwordHash: adminPassword,
      name: '系统管理员',
      role: 'admin',
    },
    update: {
      passwordHash: adminPassword,
      role: 'admin',
    },
  });

  console.log('Admin user created (email: admin@qgis.com, password: admin123)');

  const sampleUsers = [
    { email: 'user1@qgis.com', name: '张三', password: 'user123' },
    { email: 'user2@qgis.com', name: '李四', password: 'user456' },
  ];

  for (const u of sampleUsers) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: 'user',
      },
      update: {
        passwordHash,
        name: u.name,
      },
    });
  }

  console.log('Sample users created');

  const vectorCat = await prisma.category.findUnique({ where: { name: '矢量处理' } });
  const dbCat = await prisma.category.findUnique({ where: { name: '数据库' } });
  const cartoCat = await prisma.category.findUnique({ where: { name: '制图输出' } });

  const adminUser = await prisma.user.findUnique({ where: { email: 'admin@qgis.com' } });
  const user1 = await prisma.user.findUnique({ where: { email: 'user1@qgis.com' } });

  const samplePlugins = [
    {
      name: 'QuickWKT',
      slug: 'quickwkt',
      description: '快速创建和显示WKT几何图形的工具',
      author: 'QGIS Community',
      email: 'contact@qgis.org',
      icon: null,
      categoryId: vectorCat?.id,
      qgisMinVersion: '3.0',
      qgisMaxVersion: '3.99',
      homepage: 'https://github.com/qgis/QuickWKT',
      tracker: 'https://github.com/qgis/QuickWKT/issues',
      repository: 'https://github.com/qgis/QuickWKT',
      license: 'GPL-2.0',
      deprecated: false,
      experimental: false,
      approved: true,
      downloads: 15420,
      averageRating: 4.5,
      ratingCount: 128,
      uploadedById: adminUser?.id,
      version: '3.1.0',
      changelog: '修复QGIS 3.34兼容性问题',
      filename: 'QuickWKT-3.1.0.zip',
      fileSize: 102400,
      md5Hash: 'd41d8cd98f00b204e9800998ecf8427e',
    },
    {
      name: 'QuickMapServices',
      slug: 'quickmapservices',
      description: '快速加载各种在线底图服务（Google、OSM、Bing等）',
      author: 'NextGIS',
      email: 'info@nextgis.com',
      icon: null,
      categoryId: cartoCat?.id,
      qgisMinVersion: '3.0',
      qgisMaxVersion: '3.99',
      homepage: 'https://nextgis.com/quickmapservices/',
      tracker: 'https://github.com/nextgis/quickmapservices/issues',
      repository: 'https://github.com/nextgis/quickmapservices',
      license: 'GPL-2.0',
      deprecated: false,
      experimental: false,
      approved: true,
      downloads: 89234,
      averageRating: 4.8,
      ratingCount: 567,
      uploadedById: user1?.id,
      version: '0.19.34',
      changelog: '添加新的底图源，更新数据源列表',
      filename: 'QuickMapServices-0.19.34.zip',
      fileSize: 256000,
      md5Hash: 'e41d8cd98f00b204e9800998ecf8427a',
    },
    {
      name: 'DB Manager',
      slug: 'db-manager',
      description: '数据库管理工具，支持PostGIS、SpatiaLite等',
      author: 'QGIS Core Team',
      email: 'core@qgis.org',
      icon: null,
      categoryId: dbCat?.id,
      qgisMinVersion: '3.0',
      qgisMaxVersion: '3.99',
      homepage: 'https://docs.qgis.org/latest/en/docs/user_manual/plugins/core_plugins/db_manager.html',
      tracker: 'https://github.com/qgis/QGIS/issues',
      repository: 'https://github.com/qgis/QGIS',
      license: 'GPL-2.0',
      deprecated: false,
      experimental: false,
      approved: true,
      downloads: 234567,
      averageRating: 4.6,
      ratingCount: 892,
      uploadedById: adminUser?.id,
      version: '3.34.0',
      changelog: '性能优化，支持更多数据库特性',
      filename: 'DBManager-3.34.0.zip',
      fileSize: 512000,
      md5Hash: 'f41d8cd98f00b204e9800998ecf8427b',
    },
    {
      name: 'Processing',
      slug: 'processing',
      description: 'QGIS处理框架，提供大量地理处理算法',
      author: 'QGIS Core Team',
      email: 'core@qgis.org',
      icon: null,
      categoryId: vectorCat?.id,
      qgisMinVersion: '3.0',
      qgisMaxVersion: '3.99',
      homepage: 'https://docs.qgis.org/latest/en/docs/user_manual/processing/index.html',
      tracker: 'https://github.com/qgis/QGIS/issues',
      repository: 'https://github.com/qgis/QGIS',
      license: 'GPL-2.0',
      deprecated: false,
      experimental: false,
      approved: true,
      downloads: 456789,
      averageRating: 4.9,
      ratingCount: 1234,
      uploadedById: adminUser?.id,
      version: '3.34.0',
      changelog: '添加新算法，修复已知问题',
      filename: 'Processing-3.34.0.zip',
      fileSize: 1024000,
      md5Hash: 'a41d8cd98f00b204e9800998ecf8427c',
    },
    {
      name: 'Profile Tool',
      slug: 'profile-tool',
      description: '从栅格图层创建剖面图的工具',
      author: 'Borys Jurgiel',
      email: 'borys@jurgiel.pl',
      icon: null,
      categoryId: vectorCat?.id,
      qgisMinVersion: '3.0',
      qgisMaxVersion: '3.99',
      homepage: 'https://github.com/borysiurgiel/profiletool',
      tracker: 'https://github.com/borysiurgiel/profiletool/issues',
      repository: 'https://github.com/borysiurgiel/profiletool',
      license: 'GPL-2.0',
      deprecated: false,
      experimental: false,
      approved: true,
      downloads: 67890,
      averageRating: 4.4,
      ratingCount: 234,
      uploadedById: user1?.id,
      version: '4.1.8',
      changelog: '修复折线剖面计算问题',
      filename: 'ProfileTool-4.1.8.zip',
      fileSize: 189440,
      md5Hash: 'b41d8cd98f00b204e9800998ecf8427d',
    },
  ];

  for (const plugin of samplePlugins) {
    const existing = await prisma.plugin.findUnique({ where: { slug: plugin.slug } });
    if (!existing) {
      const created = await prisma.plugin.create({
        data: {
          name: plugin.name,
          slug: plugin.slug,
          description: plugin.description,
          author: plugin.author,
          email: plugin.email,
          icon: plugin.icon,
          categoryId: plugin.categoryId,
          qgisMinVersion: plugin.qgisMinVersion,
          qgisMaxVersion: plugin.qgisMaxVersion,
          homepage: plugin.homepage,
          tracker: plugin.tracker,
          repository: plugin.repository,
          license: plugin.license,
          deprecated: plugin.deprecated,
          experimental: plugin.experimental,
          approved: plugin.approved,
          downloads: plugin.downloads,
          averageRating: plugin.averageRating,
          ratingCount: plugin.ratingCount,
          uploadedById: plugin.uploadedById,
          versions: {
            create: {
              version: plugin.version,
              changelog: plugin.changelog,
              filename: plugin.filename,
              fileSize: plugin.fileSize,
              md5Hash: plugin.md5Hash,
            },
          },
        },
      });

      const ratings = [
        { userId: adminUser!.id, score: 5, comment: '非常实用的插件！' },
        { userId: user1!.id, score: 4, comment: '功能强大，界面友好' },
      ];

      for (const r of ratings) {
        try {
          await prisma.rating.create({
            data: {
              pluginId: created.id,
              userId: r.userId,
              score: r.score,
              comment: r.comment,
            },
          });
        } catch (e) {
          // 忽略重复评分
        }
      }

      console.log(`Created plugin: ${plugin.name}`);
    }
  }

  console.log('Database seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

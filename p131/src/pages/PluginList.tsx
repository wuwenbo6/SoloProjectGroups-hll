import React, { useEffect, useState, useCallback } from 'react';
import { Filter, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { PluginCard } from '../components/PluginCard';
import { pluginService } from '../services/plugins';
import type { Plugin, Category, PluginFilter } from '../types';

export const PluginList: React.FC = () => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [minRating, setMinRating] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState<'downloads' | 'rating' | 'name' | 'createdAt'>('downloads');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    try {
      const filter: PluginFilter = {
        search: searchQuery || undefined,
        category: selectedCategory || undefined,
        minRating,
        sortBy,
        sortOrder,
        page,
        pageSize,
      };

      const result = await pluginService.getPlugins(filter);
      if (result.success && result.data) {
        setPlugins(result.data.items);
        setTotal(result.data.total);
      }
    } catch (err) {
      console.error('Failed to load plugins:', err);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, minRating, sortBy, sortOrder, page, pageSize]);

  const loadCategories = useCallback(async () => {
    try {
      const result = await pluginService.getCategories();
      if (result.success && result.data) {
        setCategories(result.data);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadPlugins();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, minRating, sortBy, sortOrder]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins, page]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-slate-900">
      <Navbar onSearch={setSearchQuery} searchQuery={searchQuery} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              插件仓库
            </h1>
            <p className="text-slate-400">
              共找到 <span className="text-teal-400 font-mono">{total}</span> 个插件
            </p>
          </div>

          <div className="flex items-center gap-4 mt-4 md:mt-0">
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400">排序:</label>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [by, order] = e.target.value.split('-');
                  setSortBy(by as typeof sortBy);
                  setSortOrder(order as typeof sortOrder);
                }}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
              >
                <option value="downloads-desc">下载量最多</option>
                <option value="rating-desc">评分最高</option>
                <option value="createdAt-desc">最新发布</option>
                <option value="name-asc">名称 A-Z</option>
                <option value="name-desc">名称 Z-A</option>
              </select>
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 transition-colors"
            >
              <Filter className="w-4 h-4" />
              筛选
              {showFilters ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  分类
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">全部分类</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name} ({cat._count?.plugins || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  最低评分
                </label>
                <select
                  value={minRating || ''}
                  onChange={(e) => setMinRating(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">全部评分</option>
                  <option value="4">4星及以上</option>
                  <option value="3">3星及以上</option>
                  <option value="2">2星及以上</option>
                  <option value="1">1星及以上</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setSelectedCategory('');
                    setMinRating(undefined);
                    setSearchQuery('');
                  }}
                  className="w-full px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
                >
                  重置筛选
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <span className="ml-3 text-slate-400">加载插件中...</span>
          </div>
        ) : plugins.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-800 rounded-full flex items-center justify-center">
              <Filter className="w-8 h-8 text-slate-600" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              没有找到匹配的插件
            </h3>
            <p className="text-slate-500">
              尝试调整筛选条件或搜索关键词
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {plugins.map((plugin, index) => (
                <div
                  key={plugin.id}
                  className="animate-in fade-in slide-in-from-bottom-4 duration-500"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <PluginCard plugin={plugin} />
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-12">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  上一页
                </button>
                <span className="px-4 py-2 text-slate-400">
                  第 {page} / {totalPages} 页
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  下一页
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-slate-800 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-slate-500 text-sm">
          <p>QGIS 插件仓库管理系统 | XML 仓库地址: <a href="/plugins.xml" className="text-teal-400 hover:underline">/plugins.xml</a></p>
        </div>
      </footer>
    </div>
  );
};

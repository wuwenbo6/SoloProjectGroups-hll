import { useEffect, useState } from 'react';
import { HardDrive, Search, Camera, Eye, ArrowUpDown } from 'lucide-react';
import { useRbdStore } from '../store/rbdStore';
import { formatBytes } from '../utils/format';

export default function ImageManagement() {
  const {
    images,
    loadingImages,
    fetchImages,
    fetchImageDetail,
    setCreateSnapDialogOpen,
  } = useRbdStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'snapshots'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    fetchImages();
  }, []);

  const filteredImages = images
    .filter((img) => {
      const search = searchTerm.toLowerCase();
      return (
        img.name.toLowerCase().includes(search) ||
        img.pool.toLowerCase().includes(search)
      );
    })
    .sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        comparison = a.size - b.size;
      } else if (sortBy === 'snapshots') {
        comparison = a.snapshotCount - b.snapshotCount;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleSort = (key: 'name' | 'size' | 'snapshots') => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">镜像管理</h1>
          <p className="text-slate-500 text-sm mt-1">管理 Ceph RBD 镜像和快照</p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl border border-slate-800">
        <div className="p-4 border-b border-slate-800 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索镜像名称或存储池..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            />
          </div>
          <button
            onClick={() => fetchImages()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    镜像名称
                    <ArrowUpDown className={`w-3 h-3 ${sortBy === 'name' ? 'text-cyan-400' : ''}`} />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  存储池
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort('size')}
                >
                  <div className="flex items-center gap-1">
                    大小
                    <ArrowUpDown className={`w-3 h-3 ${sortBy === 'size' ? 'text-cyan-400' : ''}`} />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-300 transition-colors"
                  onClick={() => handleSort('snapshots')}
                >
                  <div className="flex items-center gap-1">
                    快照
                    <ArrowUpDown className={`w-3 h-3 ${sortBy === 'snapshots' ? 'text-cyan-400' : ''}`} />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  格式
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loadingImages ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : filteredImages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <HardDrive className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                    <p className="text-slate-500">暂无镜像</p>
                  </td>
                </tr>
              ) : (
                filteredImages.map((image) => (
                  <tr
                    key={`${image.pool}/${image.name}`}
                    className="hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-cyan-500/10 flex items-center justify-center">
                          <HardDrive className="w-4 h-4 text-cyan-400" />
                        </div>
                        <span className="font-mono text-sm text-white">{image.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-800 text-cyan-400 text-xs font-mono rounded">
                        {image.pool}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-300">
                      {formatBytes(image.size)}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-400 text-xs rounded">
                        <Camera className="w-3 h-3" />
                        {image.snapshotCount}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-400">
                      v{image.format}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            fetchImageDetail(image.pool, image.name);
                          }}
                          className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            fetchImageDetail(image.pool, image.name);
                            setTimeout(() => setCreateSnapDialogOpen(true), 100);
                          }}
                          className="p-2 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors"
                          title="创建快照"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

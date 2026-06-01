import { useEffect } from 'react';
import SnapshotTreeView from '../components/SnapshotTreeView';
import { useRbdStore } from '../store/rbdStore';

export default function SnapshotTree() {
  const { fetchSnapshotTree } = useRbdStore();

  useEffect(() => {
    fetchSnapshotTree();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">快照树</h1>
        <p className="text-slate-500 text-sm mt-1">
          可视化展示镜像、快照和克隆镜像之间的层级关系
        </p>
      </div>
      <SnapshotTreeView />
    </div>
  );
}

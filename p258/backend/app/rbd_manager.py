import rados
import rbd
import logging
from typing import List, Dict, Optional, Any, Tuple
from contextlib import contextmanager
from .config import settings
from .models import (
    ImageInfo,
    SnapshotInfo,
    TreeNode,
    PoolInfo,
    TreeDepthWarning,
    BatchFlattenResult,
)

logger = logging.getLogger(__name__)

MAX_RECOMMENDED_DEPTH = 5


class RBDManager:
    def __init__(self):
        self.cluster_name = settings.cluster_name
        self.user_name = settings.user_name
        self.conf_path = settings.conf_path
        self.keyring_path = settings.keyring_path
        self.default_pool = settings.default_pool
        self.max_depth = MAX_RECOMMENDED_DEPTH

    @contextmanager
    def _get_ioctx(self, pool_name: Optional[str] = None):
        pool = pool_name or self.default_pool
        cluster = rados.Rados(
            name=self.user_name,
            clustername=self.cluster_name,
            conf=self.conf_path,
        )
        if self.keyring_path:
            cluster.conf_set("keyring", self.keyring_path)
        cluster.connect()
        try:
            ioctx = cluster.open_ioctx(pool)
            try:
                yield ioctx
            finally:
                ioctx.close()
        finally:
            cluster.shutdown()

    def _get_features_list(self, features: int) -> List[str]:
        feature_map = {
            1: "layering",
            2: "striping",
            4: "exclusive-lock",
            8: "object-map",
            16: "fast-diff",
            32: "deep-flatten",
            64: "journaling",
            128: "data-pool",
            256: "fast-dump",
        }
        result = []
        for bit, name in feature_map.items():
            if features & bit:
                result.append(name)
        return result

    def list_pools(self) -> List[str]:
        cluster = rados.Rados(
            name=self.user_name,
            clustername=self.cluster_name,
            conf=self.conf_path,
        )
        if self.keyring_path:
            cluster.conf_set("keyring", self.keyring_path)
        cluster.connect()
        try:
            return cluster.list_pools()
        finally:
            cluster.shutdown()

    def list_images(self, pool_name: Optional[str] = None) -> List[str]:
        with self._get_ioctx(pool_name) as ioctx:
            rbd_inst = rbd.RBD()
            return rbd_inst.list(ioctx)

    def get_pool_info(self, pool_name: Optional[str] = None) -> PoolInfo:
        pool = pool_name or self.default_pool
        images = self.list_images(pool)
        return PoolInfo(name=pool, images=images)

    def get_image_info(self, image_name: str, pool_name: Optional[str] = None) -> ImageInfo:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                stat = img.stat()
                try:
                    parent = img.parent_info()
                    parent_info = {
                        "pool": parent[0].decode('utf-8') if parent[0] else "",
                        "image": parent[1].decode('utf-8') if parent[1] else "",
                        "snapshot": parent[2].decode('utf-8') if parent[2] else "",
                    } if parent else None
                except rbd.ImageNotFound:
                    parent_info = None

                features = img.features()
                return ImageInfo(
                    name=image_name,
                    pool=pool_name or self.default_pool,
                    size=stat["size"],
                    objects=stat["num_objs"],
                    order=stat["order"],
                    format=2,
                    features=self._get_features_list(features),
                    parent=parent_info,
                )

    def create_image(
        self,
        image_name: str,
        size: int,
        pool_name: Optional[str] = None,
    ) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            rbd_inst = rbd.RBD()
            features = rbd.RBD_FEATURE_LAYERING | rbd.RBD_FEATURE_EXCLUSIVE_LOCK | \
                       rbd.RBD_FEATURE_OBJECT_MAP | rbd.RBD_FEATURE_FAST_DIFF | \
                       rbd.RBD_FEATURE_DEEP_FLATTEN
            rbd_inst.create(ioctx, image_name, size, features=features)
            logger.info(f"Created image {image_name} with size {size}")
            return True

    def delete_image(self, image_name: str, pool_name: Optional[str] = None) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            rbd_inst = rbd.RBD()
            rbd_inst.remove(ioctx, image_name)
            logger.info(f"Deleted image {image_name}")
            return True

    def list_snapshots(self, image_name: str, pool_name: Optional[str] = None) -> List[SnapshotInfo]:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                snapshots = []
                for snap in img.list_snaps():
                    snapshots.append(SnapshotInfo(
                        name=snap["name"],
                        id=snap["id"],
                        size=snap["size"],
                        is_protected=img.is_protected_snap(snap["name"]),
                        timestamp=str(snap.get("timestamp", "")),
                    ))
                return snapshots

    def create_snapshot(
        self,
        image_name: str,
        snapshot_name: str,
        pool_name: Optional[str] = None,
    ) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                img.create_snap(snapshot_name)
                logger.info(f"Created snapshot {snapshot_name} for image {image_name}")
                return True

    def delete_snapshot(
        self,
        image_name: str,
        snapshot_name: str,
        pool_name: Optional[str] = None,
    ) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                try:
                    if img.is_protected_snap(snapshot_name):
                        img.unprotect_snap(snapshot_name)
                except rbd.InvalidArgument:
                    pass
                img.remove_snap(snapshot_name)
                logger.info(f"Deleted snapshot {snapshot_name} from image {image_name}")
                return True

    def protect_snapshot(
        self,
        image_name: str,
        snapshot_name: str,
        pool_name: Optional[str] = None,
    ) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                img.protect_snap(snapshot_name)
                logger.info(f"Protected snapshot {snapshot_name} for image {image_name}")
                return True

    def unprotect_snapshot(
        self,
        image_name: str,
        snapshot_name: str,
        pool_name: Optional[str] = None,
    ) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                img.unprotect_snap(snapshot_name)
                logger.info(f"Unprotected snapshot {snapshot_name} for image {image_name}")
                return True

    def create_clone(
        self,
        parent_pool: Optional[str],
        parent_image: str,
        parent_snapshot: str,
        child_pool: Optional[str],
        child_image: str,
    ) -> bool:
        parent_pool = parent_pool or self.default_pool
        child_pool = child_pool or self.default_pool

        with self._get_ioctx(parent_pool) as parent_ioctx:
            with rbd.Image(parent_ioctx, parent_image) as parent_img:
                if not parent_img.is_protected_snap(parent_snapshot):
                    parent_img.protect_snap(parent_snapshot)

        with self._get_ioctx(parent_pool) as parent_ioctx:
            with self._get_ioctx(child_pool) as child_ioctx:
                rbd_inst = rbd.RBD()
                features = rbd.RBD_FEATURE_LAYERING | rbd.RBD_FEATURE_EXCLUSIVE_LOCK | \
                           rbd.RBD_FEATURE_OBJECT_MAP | rbd.RBD_FEATURE_FAST_DIFF | \
                           rbd.RBD_FEATURE_DEEP_FLATTEN
                rbd_inst.clone(
                    parent_ioctx,
                    parent_image,
                    parent_snapshot,
                    child_ioctx,
                    child_image,
                    features=features,
                )
                logger.info(f"Created clone {child_image} from {parent_image}@{parent_snapshot}")
                return True

    def flatten_clone(self, image_name: str, pool_name: Optional[str] = None) -> bool:
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name) as img:
                img.flatten()
                logger.info(f"Flattened clone {image_name}")
                return True

    def _get_children_recursive(
        self,
        pool_name: str,
        image_name: str,
        snapshot_name: Optional[str] = None,
        current_depth: int = 1,
        parent_chain: List[str] = None,
    ) -> List[TreeNode]:
        children = []
        parent_chain = parent_chain or []
        
        with self._get_ioctx(pool_name) as ioctx:
            with rbd.Image(ioctx, image_name, snapshot=snapshot_name) as img:
                try:
                    child_list = img.list_children()
                    for child_pool, child_image in child_list:
                        child_pool_str = child_pool.decode('utf-8') if isinstance(child_pool, bytes) else str(child_pool)
                        child_image_str = child_image.decode('utf-8') if isinstance(child_image, bytes) else str(child_image)

                        try:
                            child_info = self.get_image_info(child_image_str, child_pool_str)
                            child_snaps = self.list_snapshots(child_image_str, child_pool_str)

                            child_id = f"clone-{child_pool_str}-{child_image_str}"
                            has_warning = current_depth >= self.max_depth
                            
                            child_chain = parent_chain + [f"{image_name}@{snapshot_name}"]
                            
                            child_node = TreeNode(
                                id=child_id,
                                name=child_image_str,
                                type="clone",
                                size=child_info.size,
                                depth=current_depth,
                                has_warning=has_warning,
                                parent_info={
                                    "pool": pool_name,
                                    "image": image_name,
                                    "snapshot": snapshot_name,
                                },
                                children=[],
                            )

                            for snap in child_snaps:
                                snap_id = f"snap-{child_pool_str}-{child_image_str}-{snap.name}"
                                snap_node = TreeNode(
                                    id=snap_id,
                                    name=snap.name,
                                    type="snapshot",
                                    size=snap.size,
                                    is_protected=snap.is_protected,
                                    timestamp=snap.timestamp,
                                    depth=current_depth,
                                    has_warning=has_warning,
                                    children=[],
                                )
                                snap_node.children = self._get_children_recursive(
                                    child_pool_str, child_image_str, snap.name,
                                    current_depth + 1, child_chain
                                )
                                child_node.children.append(snap_node)

                            children.append(child_node)
                        except Exception as e:
                            logger.warning(f"Error processing child {child_image_str}: {e}")
                except Exception as e:
                    logger.warning(f"Error listing children for {image_name}@{snapshot_name}: {e}")
        return children

    def get_snapshot_tree(self, image_name: str, pool_name: Optional[str] = None) -> TreeNode:
        pool = pool_name or self.default_pool
        image_info = self.get_image_info(image_name, pool)
        snapshots = self.list_snapshots(image_name, pool)

        root_id = f"image-{pool}-{image_name}"
        root_node = TreeNode(
            id=root_id,
            name=image_name,
            type="image",
            size=image_info.size,
            depth=0,
            has_warning=False,
            children=[],
        )

        for snap in snapshots:
            snap_id = f"snap-{pool}-{image_name}-{snap.name}"
            snap_node = TreeNode(
                id=snap_id,
                name=snap.name,
                type="snapshot",
                size=snap.size,
                is_protected=snap.is_protected,
                timestamp=snap.timestamp,
                depth=0,
                has_warning=False,
                children=[],
            )
            snap_node.children = self._get_children_recursive(
                pool, image_name, snap.name, 1, [image_name]
            )
            root_node.children.append(snap_node)

        return root_node

    def get_all_pools_with_images(self) -> List[PoolInfo]:
        pools = self.list_pools()
        result = []
        for pool in pools:
            try:
                images = self.list_images(pool)
                result.append(PoolInfo(name=pool, images=images))
            except Exception as e:
                logger.warning(f"Error listing images for pool {pool}: {e}")
                result.append(PoolInfo(name=pool, images=[]))
        return result

    def get_complete_tree(self) -> List[TreeNode]:
        all_trees = []
        pools = self.list_pools()
        for pool in pools:
            try:
                images = self.list_images(pool)
                for image in images:
                    try:
                        info = self.get_image_info(image, pool)
                        if info.parent is None:
                            tree = self.get_snapshot_tree(image, pool)
                            all_trees.append(tree)
                    except Exception as e:
                        logger.warning(f"Error processing image {image} in pool {pool}: {e}")
            except Exception as e:
                logger.warning(f"Error processing pool {pool}: {e}")
        return all_trees

    def _collect_warnings_from_tree(
        self,
        node: TreeNode,
        pool: str,
        warnings: List[TreeDepthWarning],
        chain_path: List[str] = None
    ) -> None:
        chain_path = chain_path or []
        
        if node.has_warning and node.type == 'clone':
            warnings.append(TreeDepthWarning(
                image_name=node.name,
                pool=pool,
                current_depth=node.depth,
                max_recommended_depth=self.max_depth,
                chain_path=chain_path + [node.name],
            ))
        
        for child in node.children:
            child_chain = chain_path + ([node.name] if node.type != 'snapshot' else [f"{node.name} (快照)"])
            self._collect_warnings_from_tree(child, pool, warnings, child_chain)

    def get_depth_warnings(self) -> List[TreeDepthWarning]:
        warnings = []
        pools = self.list_pools()
        
        for pool in pools:
            try:
                images = self.list_images(pool)
                for image in images:
                    try:
                        info = self.get_image_info(image, pool)
                        if info.parent is None:
                            tree = self.get_snapshot_tree(image, pool)
                            self._collect_warnings_from_tree(tree, pool, warnings, [image])
                    except Exception as e:
                        logger.warning(f"Error checking warnings for image {image}: {e}")
            except Exception as e:
                logger.warning(f"Error processing pool {pool}: {e}")
        
        return warnings

    def get_clone_chain_path(self, image_name: str, pool_name: Optional[str] = None) -> List[Dict[str, str]]:
        pool = pool_name or self.default_pool
        chain = []
        
        current_image = image_name
        current_pool = pool
        
        while True:
            try:
                info = self.get_image_info(current_image, current_pool)
                chain.append({
                    "name": current_image,
                    "pool": current_pool,
                    "type": "image" if len(chain) == 0 else "clone",
                })
                
                if not info.parent or not info.parent.get('image'):
                    break
                
                current_image = info.parent['image']
                current_pool = info.parent.get('pool', pool)
            except Exception as e:
                logger.warning(f"Error getting chain path for {current_image}: {e}")
                break
        
        chain.reverse()
        return chain

    def batch_flatten(self, image_names: List[str], pool_name: Optional[str] = None) -> BatchFlattenResult:
        pool = pool_name or self.default_pool
        result = BatchFlattenResult(
            success=[],
            failed=[],
        )
        
        def get_clone_depth(img_name: str, img_pool: str) -> int:
            depth = 0
            current = img_name
            current_pool = img_pool
            while True:
                try:
                    info = self.get_image_info(current, current_pool)
                    if not info.parent or not info.parent.get('image'):
                        break
                    current = info.parent['image']
                    current_pool = info.parent.get('pool', pool)
                    depth += 1
                except Exception:
                    break
            return depth
        
        images_with_depth = []
        for img_name in image_names:
            try:
                depth = get_clone_depth(img_name, pool)
                images_with_depth.append((img_name, depth))
            except Exception as e:
                result.failed.append({
                    "name": img_name,
                    "reason": f"获取深度失败: {str(e)}",
                })
        
        images_with_depth.sort(key=lambda x: -x[1])
        
        for img_name, _ in images_with_depth:
            try:
                self.flatten_clone(img_name, pool)
                result.success.append(img_name)
                logger.info(f"Successfully flattened clone: {img_name}")
            except Exception as e:
                result.failed.append({
                    "name": img_name,
                    "reason": str(e),
                })
                logger.error(f"Failed to flatten clone {img_name}: {e}")
        
        return result

    def flatten_deep_clones(
        self,
        pool_name: Optional[str] = None,
        min_depth: int = 5
    ) -> BatchFlattenResult:
        pool = pool_name or self.default_pool
        deep_clones = []
        
        pools = [pool] if pool else self.list_pools()
        
        for p in pools:
            try:
                images = self.list_images(p)
                for image in images:
                    try:
                        chain = self.get_clone_chain_path(image, p)
                        if len(chain) - 1 >= min_depth:
                            deep_clones.append(image)
                    except Exception as e:
                        logger.warning(f"Error checking image {image}: {e}")
            except Exception as e:
                logger.warning(f"Error processing pool {p}: {e}")
        
        return self.batch_flatten(deep_clones, pool)

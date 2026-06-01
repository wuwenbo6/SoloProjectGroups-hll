from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class ImageCreate(BaseModel):
    name: str = Field(..., description="镜像名称")
    size: int = Field(..., description="镜像大小（字节）", gt=0)
    pool: Optional[str] = Field(None, description="存储池名称，默认使用配置的默认池")


class ImageDelete(BaseModel):
    name: str = Field(..., description="镜像名称")
    pool: Optional[str] = Field(None, description="存储池名称")


class ImageInfo(BaseModel):
    name: str = Field(..., description="镜像名称")
    pool: str = Field(..., description="存储池名称")
    size: int = Field(..., description="镜像大小（字节）")
    objects: int = Field(..., description="对象数量")
    order: int = Field(..., description="对象大小阶数")
    format: int = Field(..., description="镜像格式")
    features: List[str] = Field(default_factory=list, description="特性列表")
    parent: Optional[Dict[str, str]] = Field(None, description="父镜像信息（用于克隆）")


class SnapshotCreate(BaseModel):
    image_name: str = Field(..., description="镜像名称")
    snapshot_name: str = Field(..., description="快照名称")
    pool: Optional[str] = Field(None, description="存储池名称")


class SnapshotDelete(BaseModel):
    image_name: str = Field(..., description="镜像名称")
    snapshot_name: str = Field(..., description="快照名称")
    pool: Optional[str] = Field(None, description="存储池名称")


class SnapshotInfo(BaseModel):
    name: str = Field(..., description="快照名称")
    id: int = Field(..., description="快照ID")
    size: int = Field(..., description="快照大小（字节）")
    is_protected: bool = Field(..., description="是否受保护")
    timestamp: Optional[str] = Field(None, description="创建时间戳")


class CloneCreate(BaseModel):
    parent_pool: Optional[str] = Field(None, description="父镜像存储池")
    parent_image: str = Field(..., description="父镜像名称")
    parent_snapshot: str = Field(..., description="父快照名称")
    child_pool: Optional[str] = Field(None, description="子镜像存储池")
    child_image: str = Field(..., description="子镜像名称")


class CloneFlatten(BaseModel):
    image_name: str = Field(..., description="要展平的镜像名称")
    pool: Optional[str] = Field(None, description="存储池名称")


class TreeNode(BaseModel):
    id: str = Field(..., description="节点唯一ID")
    name: str = Field(..., description="节点名称")
    type: str = Field(..., description="节点类型：image/snapshot/clone")
    size: Optional[int] = Field(None, description="大小（字节）")
    timestamp: Optional[str] = Field(None, description="创建时间")
    is_protected: Optional[bool] = Field(None, description="快照是否受保护")
    depth: int = Field(0, description="节点深度（克隆链深度，image为0）")
    has_warning: bool = Field(False, description="是否有深度警告")
    parent_info: Optional[Dict[str, Any]] = Field(None, description="父节点信息")
    children: List["TreeNode"] = Field(default_factory=list, description="子节点列表")


class PoolInfo(BaseModel):
    name: str = Field(..., description="存储池名称")
    images: List[str] = Field(default_factory=list, description="镜像列表")


class TreeDepthWarning(BaseModel):
    image_name: str = Field(..., description="镜像名称")
    pool: str = Field(..., description="存储池")
    current_depth: int = Field(..., description="当前深度")
    max_recommended_depth: int = Field(5, description="最大推荐深度")
    chain_path: List[str] = Field(default_factory=list, description="克隆链路径")


class BatchFlattenRequest(BaseModel):
    image_names: List[str] = Field(..., description="要展平的镜像名称列表")
    pool: Optional[str] = Field(None, description="存储池名称")


class BatchFlattenResult(BaseModel):
    success: List[str] = Field(default_factory=list, description="成功展平的镜像")
    failed: List[Dict[str, str]] = Field(default_factory=list, description="失败的镜像及原因")


class ResponseModel(BaseModel):
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")
    data: Optional[Any] = Field(None, description="响应数据")


TreeNode.model_rebuild()

from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class SimulationParamsBase(BaseModel):
    name: str = Field(..., description="参数配置名称")
    undercooling: float = Field(..., ge=0.1, le=2.0, description="过冷度 ΔT")
    anisotropy: float = Field(..., ge=0.0, le=0.1, description="各向异性强度")
    anisotropy_mode: int = Field(default=4, description="各向异性模式 (4或6)")
    interface_width: float = Field(default=3.0, description="界面宽度")
    mobility: float = Field(default=1.0, description="界面迁移率")


class SimulationParamsCreate(SimulationParamsBase):
    pass


class SimulationParams(SimulationParamsBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SimulationStartRequest(BaseModel):
    undercooling: float = Field(default=0.5, ge=0.1, le=2.0)
    anisotropy: float = Field(default=0.04, ge=0.0, le=0.1)
    anisotropy_mode: int = Field(default=4)
    interface_width: float = Field(default=3.0)
    mobility: float = Field(default=1.0)
    grid_size: int = Field(default=64, description="3D网格大小")
    total_steps: int = Field(default=200, description="总模拟步数")
    num_grains: int = Field(default=1, ge=1, le=20, description="晶粒数量")
    grain_radius: int = Field(default=3, ge=1, le=10, description="晶核半径")
    random_orientation: bool = Field(default=True, description="随机晶粒取向")
    export_obj: bool = Field(default=False, description="导出OBJ序列")


class WSMessage(BaseModel):
    type: str
    data: Optional[dict] = None
    step: Optional[int] = None

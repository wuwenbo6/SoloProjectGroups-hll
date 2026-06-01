from sqlalchemy.orm import Session
from typing import List, Optional

from app.models.simulation import SimulationParams as SimulationParamsModel
from app.schemas.simulation import SimulationParamsCreate


class ParameterService:
    @staticmethod
    def get_all_params(db: Session, skip: int = 0, limit: int = 100) -> List[SimulationParamsModel]:
        return db.query(SimulationParamsModel).order_by(
            SimulationParamsModel.created_at.desc()
        ).offset(skip).limit(limit).all()

    @staticmethod
    def get_params(db: Session, params_id: int) -> Optional[SimulationParamsModel]:
        return db.query(SimulationParamsModel).filter(SimulationParamsModel.id == params_id).first()

    @staticmethod
    def create_params(db: Session, params: SimulationParamsCreate) -> SimulationParamsModel:
        db_params = SimulationParamsModel(**params.model_dump())
        db.add(db_params)
        db.commit()
        db.refresh(db_params)
        return db_params

    @staticmethod
    def delete_params(db: Session, params_id: int) -> bool:
        db_params = ParameterService.get_params(db, params_id)
        if db_params:
            db.delete(db_params)
            db.commit()
            return True
        return False

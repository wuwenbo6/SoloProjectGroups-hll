from fastapi import APIRouter
from typing import List

from app.schemas import MutationStrategy
from app.services import ModbusMutator

router = APIRouter(prefix="/strategies", tags=["strategies"])

mutator = ModbusMutator()


@router.get("", response_model=List[MutationStrategy])
def get_strategies():
    strategies = mutator.get_available_strategies()
    return [
        MutationStrategy(
            id=s["id"],
            name=s["name"],
            description=s["description"],
            enabled=True
        )
        for s in strategies
    ]

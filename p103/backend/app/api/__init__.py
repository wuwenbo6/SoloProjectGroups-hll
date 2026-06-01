from fastapi import APIRouter

from .targets import router as targets_router
from .strategies import router as strategies_router
from .tasks import router as tasks_router
from .cases import router as cases_router
from .stats import router as stats_router
from .reports import router as reports_router
from .statemachine import router as statemachine_router
from .dnp3 import router as dnp3_router

api_router = APIRouter(prefix="/api")
api_router.include_router(targets_router)
api_router.include_router(strategies_router)
api_router.include_router(tasks_router)
api_router.include_router(cases_router)
api_router.include_router(stats_router)
api_router.include_router(reports_router)
api_router.include_router(statemachine_router)
api_router.include_router(dnp3_router)

__all__ = ["api_router"]

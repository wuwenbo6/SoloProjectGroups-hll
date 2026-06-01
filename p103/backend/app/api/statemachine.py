from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.core import get_db
from app.services import get_fuzzer_manager
from app.services.state_machine import ProtocolStateMachine

router = APIRouter(prefix="/statemachine", tags=["statemachine"])


@router.get("/{task_id}/status")
def get_state_machine_status(task_id: int):
    fuzzer_manager = get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    
    if not fuzzer or not hasattr(fuzzer, '_state_machine'):
        raise HTTPException(status_code=404, detail="状态机不存在或测试未运行")
    
    return fuzzer._state_machine.get_state_statistics()


@router.get("/{task_id}/transitions")
def get_recent_transitions(task_id: int, count: int = 20):
    fuzzer_manager = get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    
    if not fuzzer or not hasattr(fuzzer, '_state_machine'):
        raise HTTPException(status_code=404, detail="状态机不存在或测试未运行")
    
    return {
        "transitions": fuzzer._state_machine.get_recent_transitions(count)
    }


@router.get("/{task_id}/recommended_strategies")
def get_recommended_strategies(task_id: int):
    fuzzer_manager = get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    
    if not fuzzer or not hasattr(fuzzer, '_state_machine'):
        raise HTTPException(status_code=404, detail="状态机不存在或测试未运行")
    
    available_strategies = fuzzer.strategies
    recommended = fuzzer._state_machine.get_recommended_strategies(available_strategies)
    
    return {
        "available": available_strategies,
        "recommended": recommended
    }


@router.post("/{task_id}/reset")
def reset_state_machine(task_id: int):
    fuzzer_manager = get_fuzzer_manager()
    fuzzer = fuzzer_manager.get_fuzzer(task_id)
    
    if not fuzzer or not hasattr(fuzzer, '_state_machine'):
        raise HTTPException(status_code=404, detail="状态机不存在或测试未运行")
    
    fuzzer._state_machine.reset()
    
    return {"message": "状态机已重置"}


@router.get("/states")
def get_all_states():
    from app.services.state_machine import ModbusState
    
    return {
        "states": [
            {
                "name": state.name,
                "value": state.value,
                "description": {
                    "idle": "空闲状态",
                    "connected": "已连接",
                    "read_coils": "读取线圈",
                    "read_discrete_inputs": "读取离散输入",
                    "read_holding_registers": "读取保持寄存器",
                    "read_input_registers": "读取输入寄存器",
                    "write_single_coil": "写单个线圈",
                    "write_single_register": "写单个寄存器",
                    "write_multiple_coils": "写多个线圈",
                    "write_multiple_registers": "写多个寄存器",
                    "diagnostic": "诊断功能",
                    "error": "错误状态",
                    "timeout": "超时状态",
                    "exception": "异常响应",
                }.get(state.value, state.value)
            }
            for state in ModbusState
        ]
    }

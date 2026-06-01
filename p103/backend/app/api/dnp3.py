from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from app.core import get_db
from app.models import Target
from app.schemas import TargetCreate
from app.services.dnp3 import DNP3Mutator, DNP3HealthMonitor

router = APIRouter(prefix="/dnp3", tags=["dnp3"])

_dnp3_mutator = DNP3Mutator()


@router.get("/strategies")
def get_dnp3_strategies():
    return {
        "strategies": _dnp3_mutator.get_available_strategies(),
        "protocol": "dnp3",
        "default_port": 20000
    }


@router.post("/test/generate")
def generate_test_packet(strategy_id: str = None):
    try:
        packet = _dnp3_mutator.generate_mutation(strategy_id=strategy_id)
        return {
            "hex_data": packet.hex_data,
            "function_code": packet.function_code,
            "function_name": packet.function_name,
            "description": packet.description,
            "strategy": packet.strategy,
            "object_type": packet.object_type
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"报文生成失败: {str(e)}")


@router.post("/health/check")
def check_dnp3_health(ip_address: str, port: int = 20000, timeout: int = 5000):
    try:
        monitor = DNP3HealthMonitor(ip_address, port, timeout)
        
        tcp_ok, tcp_msg = monitor.check_tcp_connection()
        dnp3_ok, dnp3_msg = monitor.check_dnp3_protocol()
        
        return {
            "ip_address": ip_address,
            "port": port,
            "tcp_connection": {
                "ok": tcp_ok,
                "message": tcp_msg
            },
            "dnp3_protocol": {
                "ok": dnp3_ok,
                "message": dnp3_msg
            },
            "overall_health": "healthy" if tcp_ok and dnp3_ok else "unhealthy"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"健康检测失败: {str(e)}")


@router.post("/target")
def create_dnp3_target(target: TargetCreate, db: Session = Depends(get_db)):
    db_target = Target(
        name=target.name,
        ip_address=target.ip_address,
        port=target.port or 20000,
        slave_id=getattr(target, 'slave_id', 1),
        timeout=target.timeout or 5000,
        protocol="dnp3"
    )
    db.add(db_target)
    db.commit()
    db.refresh(db_target)
    return db_target


@router.get("/function_codes")
def get_function_codes():
    from app.services.dnp3 import DNP3FunctionCode
    
    return {
        "function_codes": [
            {
                "code": fc.value,
                "name": fc.name,
                "description": {
                    "CONFIRM": "确认",
                    "READ": "读取",
                    "WRITE": "写入",
                    "SELECT": "选择",
                    "OPERATE": "操作",
                    "DIRECT_OPERATE": "直接操作",
                    "DIRECT_OPERATE_NR": "直接操作无响应",
                    "IMMED_FREEZE": "立即冻结",
                    "FREEZE_CLEAR": "冻结并清除",
                    "COLD_RESTART": "冷重启",
                    "WARM_RESTART": "热重启",
                }.get(fc.name, fc.name.replace('_', ' ').title())
            }
            for fc in DNP3FunctionCode
        ]
    }


@router.get("/object_types")
def get_object_types():
    from app.services.dnp3 import DNP3ObjectType
    
    return {
        "object_types": [
            {
                "type": ot.value,
                "name": ot.name,
                "description": {
                    "BINARY_INPUT": "二进制输入",
                    "BINARY_INPUT_EVENT": "二进制输入事件",
                    "BINARY_OUTPUT": "二进制输出",
                    "COUNTER": "计数器",
                    "ANALOG_INPUT": "模拟量输入",
                    "ANALOG_OUTPUT": "模拟量输出",
                    "TIME_AND_DATE": "时间日期",
                    "CLASS_DATA": "分类数据",
                }.get(ot.name, ot.name.replace('_', ' ').title())
            }
            for ot in DNP3ObjectType
        ]
    }


@router.get("/packets/samples")
def get_sample_packets():
    samples = []
    
    strategies = ["dnp3_invalid_function_code", "dnp3_invalid_object_type", 
                  "dnp3_crc_corrupt", "dnp3_header_corrupt"]
    
    for strategy in strategies:
        try:
            packet = _dnp3_mutator.generate_mutation(strategy_id=strategy)
            samples.append({
                "strategy": strategy,
                "description": packet.description,
                "hex_data": packet.hex_data[:60] + "..." if len(packet.hex_data) > 60 else packet.hex_data
            })
        except:
            pass
    
    return {"samples": samples}

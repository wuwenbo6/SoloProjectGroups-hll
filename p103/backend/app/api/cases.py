from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import json

from app.core import get_db
from app.models import TestCase
from app.schemas import TestCaseCreate, TestCaseUpdate, TestCase as TestCaseSchema

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("", response_model=List[TestCaseSchema])
def get_cases(db: Session = Depends(get_db)):
    cases = db.query(TestCase).order_by(TestCase.created_at.desc()).all()
    return [
        TestCaseSchema(
            id=case.id,
            name=case.name,
            description=case.description,
            strategy_type=case.strategy_type,
            params=json.loads(case.params_json) if case.params_json else {},
            created_at=case.created_at,
            updated_at=case.updated_at
        )
        for case in cases
    ]


@router.get("/{case_id}", response_model=TestCaseSchema)
def get_case(case_id: int, db: Session = Depends(get_db)):
    case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="测试用例不存在")
    
    return TestCaseSchema(
        id=case.id,
        name=case.name,
        description=case.description,
        strategy_type=case.strategy_type,
        params=json.loads(case.params_json) if case.params_json else {},
        created_at=case.created_at,
        updated_at=case.updated_at
    )


@router.post("", response_model=TestCaseSchema)
def create_case(case: TestCaseCreate, db: Session = Depends(get_db)):
    db_case = TestCase(
        name=case.name,
        description=case.description,
        strategy_type=case.strategy_type,
        params_json=json.dumps(case.params)
    )
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    
    return TestCaseSchema(
        id=db_case.id,
        name=db_case.name,
        description=db_case.description,
        strategy_type=db_case.strategy_type,
        params=json.loads(db_case.params_json) if db_case.params_json else {},
        created_at=db_case.created_at,
        updated_at=db_case.updated_at
    )


@router.put("/{case_id}", response_model=TestCaseSchema)
def update_case(case_id: int, case: TestCaseUpdate, db: Session = Depends(get_db)):
    db_case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not db_case:
        raise HTTPException(status_code=404, detail="测试用例不存在")
    
    db_case.name = case.name
    db_case.description = case.description
    db_case.strategy_type = case.strategy_type
    db_case.params_json = json.dumps(case.params)
    
    db.commit()
    db.refresh(db_case)
    
    return TestCaseSchema(
        id=db_case.id,
        name=db_case.name,
        description=db_case.description,
        strategy_type=db_case.strategy_type,
        params=json.loads(db_case.params_json) if db_case.params_json else {},
        created_at=db_case.created_at,
        updated_at=db_case.updated_at
    )


@router.delete("/{case_id}")
def delete_case(case_id: int, db: Session = Depends(get_db)):
    db_case = db.query(TestCase).filter(TestCase.id == case_id).first()
    if not db_case:
        raise HTTPException(status_code=404, detail="测试用例不存在")
    
    db.delete(db_case)
    db.commit()
    return {"message": "删除成功"}

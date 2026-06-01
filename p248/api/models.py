from __future__ import annotations
from pydantic import BaseModel
from typing import Optional


class RuleResult(BaseModel):
    id: str
    category: str
    severity: str
    status: str
    description: str
    detail: Optional[str] = None
    xpath: Optional[str] = None
    suggestion: Optional[str] = None


class ValidationSummary(BaseModel):
    total: int
    passed: int
    warnings: int
    errors: int


class ValidationResult(BaseModel):
    status: str
    filename: str
    fileSize: int
    mpdType: str
    profiles: list[str]
    summary: ValidationSummary
    rules: list[RuleResult]
    xmlSource: str

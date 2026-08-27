from typing import Literal, Optional

from pydantic import BaseModel, Field


class RefreshAccountRequest(BaseModel):
    agent_name: str


class ReconcileAccountRequest(BaseModel):
    agent_name: str
    description: Optional[str] = None


class AdminAccountTransactionRequest(BaseModel):
    agent_name: str
    transaction_type: Literal["credit", "debit"]
    amount: float = Field(gt=0)
    description: Optional[str] = None
    note: Optional[str] = None


class CashReceiptRequest(BaseModel):
    agent_name: str
    amount: float = Field(gt=0)
    description: Optional[str] = None
    note: Optional[str] = None


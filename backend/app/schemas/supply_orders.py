from typing import Optional

from pydantic import BaseModel, Field


class SupplyOrderItemIn(BaseModel):
    category: str
    product_name: str
    size: str
    quantity: int = Field(gt=0)
    notes: Optional[str] = None


class SupplyOrderCreate(BaseModel):
    agent_name: str
    notes: Optional[str] = None
    items: list[SupplyOrderItemIn] = Field(min_length=1)


class SupplyOrderUpdate(BaseModel):
    agent_name: str
    notes: Optional[str] = None
    items: list[SupplyOrderItemIn] = Field(min_length=1)


class SupplyOrderReceivedUpdate(BaseModel):
    agent_name: str


class SupplyOrderApprove(BaseModel):
    approved_by: Optional[str] = None
    notes: Optional[str] = None


class SupplyOrderCancel(BaseModel):
    cancelled_by: Optional[str] = None
    notes: Optional[str] = None

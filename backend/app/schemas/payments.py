from typing import Optional

from pydantic import BaseModel


class NedarimPaymentItem(BaseModel):
    product_id: int
    variant_id: int
    quantity: int


class NedarimPaymentPrepareIn(BaseModel):
    product_id: Optional[int] = None
    variant_id: Optional[int] = None
    quantity: Optional[int] = None
    items: Optional[list[NedarimPaymentItem]] = None
    client_name: str
    agent: str

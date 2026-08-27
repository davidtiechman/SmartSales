from typing import Optional

from pydantic import BaseModel


class SaleIn(BaseModel):
    product_id: Optional[int] = None
    variant_id: Optional[int] = None
    product_name: Optional[str] = None
    size: Optional[str] = None
    quantity: int
    category: Optional[str] = None
    client_name: str
    client_phone: Optional[str] = None
    payment_method: str
    payment_source: str = "manual"
    agent: str

from typing import Optional

from pydantic import BaseModel, Field


class StockTransferIn(BaseModel):
    user_id: int
    variant_id: int
    quantity: int = Field(gt=0)
    notes: Optional[str] = None


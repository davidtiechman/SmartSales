from datetime import date

from pydantic import BaseModel, Field


class ProductPriceUpdateIn(BaseModel):
    category: str
    product_name: str
    size_tier: str
    client_price: float = Field(ge=0)
    owner_price: float = Field(ge=0)
    effective_from: date

from fastapi import APIRouter, Depends, HTTPException

from backend.app.core.auth import get_current_user, require_agent_access
from backend.app.core.settings import (
    NEDARIM_API_VALID,
    NEDARIM_CALLBACK_MAIL_ERROR,
    NEDARIM_MOSAD,
)
from backend.app.core.timing import timed_action
from backend.app.schemas.payments import NedarimPaymentPrepareIn
from backend.app.services.sales import (
    calculate_sale_components_from_catalog,
    resolve_sale_product_variant,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/nedarim/prepare")
def prepare_nedarim_payment(
    payload: NedarimPaymentPrepareIn,
    current_user: dict = Depends(get_current_user),
):
    try:
        require_agent_access(payload.agent, current_user)
        if not NEDARIM_MOSAD or not NEDARIM_API_VALID:
            raise RuntimeError("Nedarim Plus credentials are not configured")
        requested_items = payload.items or [payload]
        if not requested_items:
            raise ValueError("At least one sale item is required")

        products = []
        amount = 0
        with timed_action("nedarim payment prepare"):
            for item in requested_items:
                if not item.product_id or not item.variant_id or not item.quantity or item.quantity <= 0:
                    raise ValueError("Every sale item must have a product, variant and positive quantity")
                product = resolve_sale_product_variant(item)
                amounts = calculate_sale_components_from_catalog(product, item.quantity)
                products.append({**product, "quantity": item.quantity})
                amount += amounts["client_total"]

        comment_parts = [
            f"{product['product_name']} {product['size']} x{product['quantity']}"
            for product in products
        ]
        comment = ("; ".join(comment_parts) + f" - {payload.agent}")[:300]

        return {
            "amount": amount,
            "product": products[0] if len(products) == 1 else None,
            "products": products,
            "nedarim": {
                "Mosad": NEDARIM_MOSAD,
                "ApiValid": NEDARIM_API_VALID,
                "PaymentType": "Ragil",
                "Currency": "1",
                "Zeout": "",
                "FirstName": payload.client_name[:50],
                "LastName": "",
                "Street": "",
                "City": "",
                "Phone": "",
                "Mail": "",
                "Amount": str(amount),
                "Tashlumim": "1",
                "Day": "",
                "Groupe": "sales_outfit",
                "Comment": comment,
                "Param1": "",
                "Param2": "",
                "ForceUpdateMatching": "",
                "ThirdPartyReceipt": "",
                "CallBack": "",
                "CallBackMailError": NEDARIM_CALLBACK_MAIL_ERROR,
                "Tokef": "",
            },
        }
    except HTTPException:
        raise
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

"""Checkout and order management endpoints integrated with DynamoDB and SQS."""

import json
import uuid
from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.aws_clients import (
    get_orders_queue_url,
    get_orders_table,
    get_products_table,
    get_sqs_client,
)
from app.schemas import OrderCreateRequest, OrderResponse
from app.security import get_current_user, get_optional_current_user, require_admin
from app.utils.dynamodb import from_dynamodb, scan_all, to_dynamodb, utc_now_iso

router = APIRouter(prefix="/api/orders", tags=["Pedidos y Checkout SQS"])


def _aggregate_cart_items(items: list) -> dict[str, int]:
    """Combine duplicate product_ids into total requested quantities."""
    aggregated: dict[str, int] = {}
    for entry in items:
        aggregated[entry.product_id] = aggregated.get(entry.product_id, 0) + entry.quantity
    return aggregated


@router.post(
    "",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear pedido en DynamoDB (QUEUED) y enviarlo a SQS orders-queue",
)
def create_order(
    payload: OrderCreateRequest,
    current_user: dict | None = Depends(get_optional_current_user),
):
    """Validate inventory, persist a QUEUED order in DynamoDB, and enqueue a message to SQS."""
    products_table = get_products_table()
    orders_table = get_orders_table()
    requested_quantities = _aggregate_cart_items(payload.items)

    order_items: list[dict] = []
    total_amount = 0.0

    for product_id, quantity in requested_quantities.items():
        product_resp = products_table.get_item(Key={"product_id": product_id})
        raw_product = product_resp.get("Item")
        if not raw_product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"El producto '{product_id}' no existe en el catálogo.",
            )

        product = from_dynamodb(raw_product)
        available_stock = int(product.get("stock", 0))
        if available_stock < quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Stock insuficiente para '{product['name']}'. "
                    f"Disponible: {available_stock}, solicitado: {quantity}."
                ),
            )

        unit_price = round(float(product["price"]), 2)
        subtotal = round(unit_price * quantity, 2)
        total_amount = round(total_amount + subtotal, 2)
        order_items.append(
            {
                "product_id": product_id,
                "name": product["name"],
                "unit_price": unit_price,
                "quantity": quantity,
                "subtotal": subtotal,
            }
        )

    # Descontar stock con condición atómica por producto
    for item in order_items:
        try:
            products_table.update_item(
                Key={"product_id": item["product_id"]},
                UpdateExpression="SET stock = stock - :qty, updated_at = :ts",
                ConditionExpression="stock >= :qty",
                ExpressionAttributeValues=to_dynamodb({":qty": item["quantity"], ":ts": utc_now_iso()}),
            )
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"El stock de '{item['name']}' cambió durante el checkout. Intenta de nuevo.",
                ) from exc
            raise

    order_id = f"ord-{uuid.uuid4().hex[:10]}"
    now = utc_now_iso()
    user_id = current_user["user_id"] if current_user else f"guest-{uuid.uuid4().hex[:8]}"
    customer_name = (
        payload.customer_name.strip()
        if payload.customer_name
        else (current_user["username"] if current_user else "Cliente Invitado")
    )

    sqs_payload = {
        "order_id": order_id,
        "user_id": user_id,
        "customer_name": customer_name,
        "items": order_items,
        "total_amount": total_amount,
        "timestamp": now,
    }

    sqs = get_sqs_client()
    queue_url = get_orders_queue_url()
    sqs_response = sqs.send_message(
        QueueUrl=queue_url,
        MessageBody=json.dumps(sqs_payload, ensure_ascii=False),
    )
    sqs_message_id = sqs_response["MessageId"]

    order_record = {
        "order_id": order_id,
        "user_id": user_id,
        "customer_name": customer_name,
        "items": order_items,
        "total_amount": total_amount,
        "status": "QUEUED",
        "sqs_message_id": sqs_message_id,
        "created_at": now,
        "processed_at": None,
    }
    orders_table.put_item(Item=to_dynamodb(order_record))
    return OrderResponse(**order_record)


@router.get(
    "/me",
    response_model=list[OrderResponse],
    summary="Listar pedidos del usuario autenticado",
)
def get_my_orders(current_user: dict = Depends(get_current_user)):
    """Return orders belonging to the currently authenticated user."""
    orders = scan_all(
        get_orders_table(),
        FilterExpression=Attr("user_id").eq(current_user["user_id"]),
    )
    orders.sort(key=lambda o: str(o.get("created_at", "")), reverse=True)
    return [OrderResponse(**o) for o in orders]


@router.get(
    "",
    response_model=list[OrderResponse],
    summary="Listar todos los pedidos (solo administrador)",
)
def list_all_orders(
    status_filter: str | None = Query(
        default=None,
        alias="status",
        description="Filtrar por estado: QUEUED o PROCESSED",
    ),
    _: dict = Depends(require_admin),
):
    """List all orders stored in DynamoDB, optionally filtered by processing status."""
    orders = scan_all(get_orders_table())
    if status_filter:
        normalized = status_filter.strip().upper()
        orders = [o for o in orders if str(o.get("status", "")).upper() == normalized]

    orders.sort(key=lambda o: str(o.get("created_at", "")), reverse=True)
    return [OrderResponse(**o) for o in orders]

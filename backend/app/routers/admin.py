"""Administrator endpoints for SQS queue metrics and order worker processing."""

import json
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, Query

from app.aws_clients import get_orders_queue_url, get_orders_table, get_sqs_client
from app.config import get_settings
from app.schemas import OrdersSummary, SQSMetricsResponse, SQSProcessResponse
from app.security import require_admin
from app.utils.dynamodb import scan_all, to_dynamodb, utc_now_iso

router = APIRouter(prefix="/api/admin", tags=["Panel de Administración y Worker SQS"])


def _compute_orders_summary() -> OrdersSummary:
    orders = scan_all(get_orders_table())
    queued = sum(1 for o in orders if o.get("status") == "QUEUED")
    processed = sum(1 for o in orders if o.get("status") == "PROCESSED")
    total_revenue = round(sum(float(o.get("total_amount", 0)) for o in orders), 2)
    return OrdersSummary(
        total=len(orders),
        queued=queued,
        processed=processed,
        total_revenue=total_revenue,
    )


def _fetch_queue_counts(queue_url: str) -> dict[str, int]:
    attrs = get_sqs_client().get_queue_attributes(
        QueueUrl=queue_url,
        AttributeNames=[
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
            "ApproximateNumberOfMessagesDelayed",
        ],
    ).get("Attributes", {})

    return {
        "visible": int(attrs.get("ApproximateNumberOfMessages", 0)),
        "not_visible": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
        "delayed": int(attrs.get("ApproximateNumberOfMessagesDelayed", 0)),
    }


@router.get(
    "/sqs/metrics",
    response_model=SQSMetricsResponse,
    summary="Consultar métricas en tiempo real de SQS y resumen de DynamoDB Orders",
)
def get_sqs_metrics(_: dict = Depends(require_admin)):
    """Retrieve live SQS queue attribute counts alongside DynamoDB order status totals."""
    settings = get_settings()
    queue_url = get_orders_queue_url()
    counts = _fetch_queue_counts(queue_url)

    return SQSMetricsResponse(
        queue_name=settings.sqs_orders_queue,
        queue_url=queue_url,
        approximate_number_of_messages=counts["visible"],
        approximate_number_of_messages_not_visible=counts["not_visible"],
        approximate_number_of_messages_delayed=counts["delayed"],
        orders_summary=_compute_orders_summary(),
    )


def _mark_order_processed(orders_table, body: dict, message_id: str) -> str:
    """Update an existing order to PROCESSED, or insert a complete record if missing."""
    order_id = body["order_id"]
    now = utc_now_iso()

    try:
        orders_table.update_item(
            Key={"order_id": order_id},
            UpdateExpression="SET #s = :status, processed_at = :ts",
            ConditionExpression="attribute_exists(order_id)",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":status": "PROCESSED", ":ts": now},
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
            raise
        orders_table.put_item(
            Item=to_dynamodb(
                {
                    "order_id": order_id,
                    "user_id": body.get("user_id", "simulated-user"),
                    "customer_name": body.get("customer_name", "Cliente Simulado"),
                    "items": body.get("items", []),
                    "total_amount": round(float(body.get("total_amount", 0.0)), 2),
                    "status": "PROCESSED",
                    "sqs_message_id": message_id,
                    "created_at": body.get("timestamp", now),
                    "processed_at": now,
                }
            )
        )
    return order_id


@router.post(
    "/sqs/process",
    response_model=SQSProcessResponse,
    summary="Ejecutar worker para consumir mensajes de SQS y actualizar Orders a PROCESSED",
)
def process_sqs_orders(
    max_messages: int = Query(default=10, ge=1, le=500),
    _: dict = Depends(require_admin),
):
    """Consume up to max_messages from SQS orders-queue, update DynamoDB to PROCESSED, and delete messages."""
    sqs = get_sqs_client()
    queue_url = get_orders_queue_url()
    orders_table = get_orders_table()
    processed_order_ids: list[str] = []

    while len(processed_order_ids) < max_messages:
        batch_size = min(10, max_messages - len(processed_order_ids))
        response = sqs.receive_message(
            QueueUrl=queue_url,
            MaxNumberOfMessages=batch_size,
            WaitTimeSeconds=1,
            VisibilityTimeout=30,
        )
        messages = response.get("Messages", [])
        if not messages:
            break

        for msg in messages:
            try:
                body = json.loads(msg["Body"])
            except json.JSONDecodeError:
                body = {}

            if "order_id" in body:
                order_id = _mark_order_processed(orders_table, body, msg["MessageId"])
                processed_order_ids.append(order_id)

            sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=msg["ReceiptHandle"])

    remaining = _fetch_queue_counts(queue_url)["visible"]
    count = len(processed_order_ids)
    summary_msg = (
        f"Se procesaron {count} pedido(s) desde SQS y se marcaron como PROCESSED en DynamoDB."
        if count > 0
        else "No había mensajes visibles pendientes en la cola SQS."
    )

    return SQSProcessResponse(
        processed_count=count,
        processed_order_ids=processed_order_ids,
        remaining_approximate_messages=remaining,
        message=summary_msg,
    )

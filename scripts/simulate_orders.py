#!/usr/bin/env python3
"""
Simulador de carga de 100 pedidos hacia LocalStack SQS (orders-queue) y DynamoDB (Orders).

Ejecución desde WSL2:
    python3 scripts/simulate_orders.py
"""

import argparse
from datetime import datetime, timezone
from decimal import Decimal
import json
import os
import random
import sys
import time
import uuid

import boto3
from botocore.exceptions import ClientError

LOCALSTACK_ACCOUNT_ID = "000000000000"

FALLBACK_CATALOG = [
    {"product_id": "prod-001", "name": 'Laptop CloudBook Pro 16"', "price": 1499.99},
    {"product_id": "prod-002", "name": "Audífonos Studio ANC Pro", "price": 279.99},
    {"product_id": "prod-003", "name": "Teclado Mecánico RGB 75%", "price": 139.50},
    {"product_id": "prod-004", "name": "Mouse Ergonómico Wireless Pro", "price": 89.99},
    {"product_id": "prod-005", "name": 'Monitor UltraSharp 27" 4K IPS', "price": 459.00},
    {"product_id": "prod-006", "name": "Webcam 4K HDR Auto-Focus", "price": 119.00},
    {"product_id": "prod-007", "name": "Hub Dock USB-C Thunderbolt 12-en-1", "price": 149.99},
    {"product_id": "prod-008", "name": "SSD Externo NVMe 2TB USB 3.2", "price": 189.99},
]

CUSTOMER_NAMES = [
    "Ana Torres",
    "Luis Fernández",
    "Sofía Mendoza",
    "Diego Vargas",
    "Valentina Rojas",
    "Mateo Castillo",
    "Camila Herrera",
    "Sebastián Paredes",
    "Lucía Morales",
    "Andrés Navarro",
]


def to_decimal(value):
    """Convert floats recursively into Decimal for DynamoDB batch_writer."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_decimal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_decimal(v) for v in value]
    return value


def load_catalog(dynamodb_resource, table_name: str) -> list[dict]:
    """Fetch existing products from DynamoDB or fall back to built-in catalog."""
    try:
        table = dynamodb_resource.Table(table_name)
        items = table.scan().get("Items", [])
        if items:
            return [
                {
                    "product_id": str(item["product_id"]),
                    "name": str(item["name"]),
                    "price": float(item["price"]),
                }
                for item in items
            ]
    except ClientError as exc:
        print(f"[WARN] No se pudo escanear la tabla '{table_name}': {exc}", file=sys.stderr)
    return FALLBACK_CATALOG


def build_queue_url(endpoint: str, queue_name: str) -> str:
    """Build direct LocalStack SQS queue URL without DNS-based get_queue_url."""
    return f"{endpoint.rstrip('/')}/{LOCALSTACK_ACCOUNT_ID}/{queue_name}"


def ensure_queue_exists(sqs_client, queue_name: str, queue_url: str) -> None:
    """Verify the target queue exists via its direct URL, creating it if missing."""
    try:
        sqs_client.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
    except ClientError:
        sqs_client.create_queue(
            QueueName=queue_name,
            Attributes={"VisibilityTimeout": "30", "MessageRetentionPeriod": "86400"},
        )


def build_synthetic_order(index: int, catalog: list[dict]) -> dict:
    """Create a synthetic random order payload matching backend SQS/DynamoDB schema."""
    selected = random.sample(catalog, k=random.randint(1, min(4, len(catalog))))
    items = []
    total_amount = 0.0

    for prod in selected:
        qty = random.randint(1, 3)
        unit_price = round(float(prod["price"]), 2)
        subtotal = round(unit_price * qty, 2)
        total_amount = round(total_amount + subtotal, 2)
        items.append(
            {
                "product_id": prod["product_id"],
                "name": prod["name"],
                "unit_price": unit_price,
                "quantity": qty,
                "subtotal": subtotal,
            }
        )

    order_id = f"ord-sim-{index + 1:03d}-{uuid.uuid4().hex[:6]}"
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    customer_name = f"{random.choice(CUSTOMER_NAMES)} #{index + 1}"

    return {
        "order_id": order_id,
        "user_id": f"sim-user-{(index % 20) + 1:02d}",
        "customer_name": customer_name,
        "items": items,
        "total_amount": total_amount,
        "timestamp": timestamp,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Simulador de pedidos sintéticos hacia LocalStack SQS y DynamoDB."
    )
    parser.add_argument("--count", type=int, default=100, help="Cantidad de pedidos a generar.")
    parser.add_argument(
        "--endpoint",
        default=os.getenv("AWS_ENDPOINT_URL", "http://localhost:4566"),
        help="Endpoint de LocalStack (default: http://localhost:4566).",
    )
    parser.add_argument(
        "--region",
        default=os.getenv("AWS_REGION", "us-east-1"),
        help="Región AWS emulada (default: us-east-1).",
    )
    parser.add_argument(
        "--queue-name",
        default=os.getenv("SQS_ORDERS_QUEUE", "orders-queue"),
        help="Nombre de la cola SQS (default: orders-queue).",
    )
    parser.add_argument(
        "--orders-table",
        default=os.getenv("DYNAMODB_ORDERS_TABLE", "Orders"),
        help="Nombre de la tabla DynamoDB Orders (default: Orders).",
    )
    parser.add_argument(
        "--products-table",
        default=os.getenv("DYNAMODB_PRODUCTS_TABLE", "Products"),
        help="Nombre de la tabla DynamoDB Products (default: Products).",
    )
    parser.add_argument(
        "--skip-dynamodb",
        action="store_true",
        help="Si se especifica, solo envía los mensajes a SQS sin escribir en DynamoDB Orders.",
    )
    args = parser.parse_args()

    common_kwargs = {
        "endpoint_url": args.endpoint,
        "region_name": args.region,
        "aws_access_key_id": os.getenv("AWS_ACCESS_KEY_ID", "test"),
        "aws_secret_access_key": os.getenv("AWS_SECRET_ACCESS_KEY", "test"),
    }

    sqs = boto3.client("sqs", **common_kwargs)
    dynamodb = boto3.resource("dynamodb", **common_kwargs)

    queue_url = build_queue_url(args.endpoint, args.queue_name)
    ensure_queue_exists(sqs, args.queue_name, queue_url)
    catalog = load_catalog(dynamodb, args.products_table)
    orders = [build_synthetic_order(i, catalog) for i in range(args.count)]

    print(f"Conectado a LocalStack: {args.endpoint}")
    print(f"Cola SQS destino:       {queue_url}")
    print(f"Generando y enviando {args.count} pedidos en lotes de 10 (send_message_batch)...\n")

    start_time = time.perf_counter()
    sent_records: list[tuple[dict, str]] = []
    failed_count = 0

    for batch_start in range(0, len(orders), 10):
        chunk = orders[batch_start : batch_start + 10]
        entries = [
            {
                "Id": str(idx),
                "MessageBody": json.dumps(order, ensure_ascii=False),
            }
            for idx, order in enumerate(chunk)
        ]
        response = sqs.send_message_batch(QueueUrl=queue_url, Entries=entries)

        for ok in response.get("Successful", []):
            entry_idx = int(ok["Id"])
            sent_records.append((chunk[entry_idx], ok["MessageId"]))

        for fail in response.get("Failed", []):
            failed_count += 1
            print(f"[ERROR] Lote fallido: {fail}", file=sys.stderr)

    if not args.skip_dynamodb and sent_records:
        orders_table = dynamodb.Table(args.orders_table)
        with orders_table.batch_writer() as batch:
            for order, message_id in sent_records:
                batch.put_item(
                    Item=to_decimal(
                        {
                            "order_id": order["order_id"],
                            "user_id": order["user_id"],
                            "customer_name": order["customer_name"],
                            "items": order["items"],
                            "total_amount": order["total_amount"],
                            "status": "QUEUED",
                            "sqs_message_id": message_id,
                            "created_at": order["timestamp"],
                            "processed_at": None,
                        }
                    )
                )

    elapsed = time.perf_counter() - start_time
    attrs = sqs.get_queue_attributes(
        QueueUrl=queue_url,
        AttributeNames=[
            "ApproximateNumberOfMessages",
            "ApproximateNumberOfMessagesNotVisible",
            "ApproximateNumberOfMessagesDelayed",
        ],
    ).get("Attributes", {})

    print("--------------------------------------------------------------------------------")
    print(f" {'#':>3} | {'Order ID':<22} | {'Total':>9} | {'SQS MessageId'}")
    print("--------------------------------------------------------------------------------")
    for idx, (order, msg_id) in enumerate(sent_records, start=1):
        print(f" {idx:>3} | {order['order_id']:<22} | ${order['total_amount']:>8.2f} | {msg_id}")
    print("--------------------------------------------------------------------------------\n")

    rate = len(sent_records) / elapsed if elapsed > 0 else 0.0
    print("=== RESUMEN DE SIMULACIÓN ===")
    print(f"Mensajes enviados a SQS:                 {len(sent_records)} / {args.count}")
    print(f"Envíos fallidos:                         {failed_count}")
    print(
        "Pedidos registrados en DynamoDB Orders:  "
        f"{0 if args.skip_dynamodb else len(sent_records)}"
    )
    print(f"Tiempo total de ejecución:               {elapsed:.3f} s ({rate:.1f} pedidos/s)")
    print("\n=== MÉTRICAS ACTUALES DE LA COLA SQS (get_queue_attributes) ===")
    print(
        f"ApproximateNumberOfMessages:             "
        f"{attrs.get('ApproximateNumberOfMessages', '0')}"
    )
    print(
        f"ApproximateNumberOfMessagesNotVisible:   "
        f"{attrs.get('ApproximateNumberOfMessagesNotVisible', '0')}"
    )
    print(
        f"ApproximateNumberOfMessagesDelayed:      "
        f"{attrs.get('ApproximateNumberOfMessagesDelayed', '0')}"
    )

    return 0 if failed_count == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

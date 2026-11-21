"""CloudStore E-Commerce API powered by FastAPI and AWS LocalStack (DynamoDB, S3, SQS)."""

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from app.aws_clients import (
    get_dynamodb_client,
    get_orders_queue_url,
    get_s3_client,
    get_sqs_client,
)
from app.config import get_settings
from app.routers import admin, auth, orders, products, users

settings = get_settings()

app = FastAPI(
    title="CloudStore E-Commerce API (LocalStack AWS)",
    description=(
        "Backend Full-Stack Cloud-Native en FastAPI integrado con LocalStack "
        "(DynamoDB para usuarios/productos/pedidos, S3 para avatares y SQS para procesamiento asíncrono)."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(products.router)
app.include_router(orders.router)
app.include_router(admin.router)


@app.get("/health", tags=["Sistema"], summary="Verificar conectividad con LocalStack (DynamoDB, S3, SQS)")
def health_check():
    """Verify live connectivity to LocalStack DynamoDB, S3, and SQS services."""
    try:
        tables = get_dynamodb_client().list_tables().get("TableNames", [])
        get_s3_client().head_bucket(Bucket=settings.s3_avatars_bucket)
        queue_url = get_orders_queue_url()
        get_sqs_client().get_queue_attributes(
            QueueUrl=queue_url,
            AttributeNames=["QueueArn"],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"LocalStack aún no está disponible: {exc}",
        ) from exc

    return {
        "status": "ok",
        "aws_endpoint": settings.aws_endpoint_url,
        "dynamodb_tables": tables,
        "s3_bucket": settings.s3_avatars_bucket,
        "sqs_queue_url": queue_url,
    }

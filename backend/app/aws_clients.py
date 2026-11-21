"""AWS / LocalStack boto3 clients and storage helpers."""

from functools import lru_cache
import mimetypes
import uuid

import boto3
from botocore.config import Config
from fastapi import HTTPException, status

from app.config import get_settings

LOCALSTACK_ACCOUNT_ID = "000000000000"

ALLOWED_AVATAR_MIME_TYPES: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}
MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB


def _client_kwargs() -> dict:
    settings = get_settings()
    return {
        "endpoint_url": settings.aws_endpoint_url,
        "region_name": settings.aws_region,
        "aws_access_key_id": settings.aws_access_key_id,
        "aws_secret_access_key": settings.aws_secret_access_key,
    }


@lru_cache
def get_dynamodb_resource():
    """Return cached boto3 DynamoDB service resource."""
    return boto3.resource("dynamodb", **_client_kwargs())


@lru_cache
def get_dynamodb_client():
    """Return cached boto3 DynamoDB low-level client."""
    return boto3.client("dynamodb", **_client_kwargs())


@lru_cache
def get_s3_client():
    """Return cached boto3 S3 client configured with path-style addressing."""
    return boto3.client(
        "s3",
        config=Config(s3={"addressing_style": "path"}),
        **_client_kwargs(),
    )


@lru_cache
def get_sqs_client():
    """Return cached boto3 SQS client."""
    return boto3.client("sqs", **_client_kwargs())


def get_users_table():
    """Return DynamoDB Users table resource."""
    return get_dynamodb_resource().Table(get_settings().dynamodb_users_table)


def get_products_table():
    """Return DynamoDB Products table resource."""
    return get_dynamodb_resource().Table(get_settings().dynamodb_products_table)


def get_orders_table():
    """Return DynamoDB Orders table resource."""
    return get_dynamodb_resource().Table(get_settings().dynamodb_orders_table)


def get_orders_queue_url() -> str:
    """Build the direct SQS queue URL using the configured LocalStack endpoint."""
    settings = get_settings()
    return f"{settings.aws_endpoint_url.rstrip('/')}/{LOCALSTACK_ACCOUNT_ID}/{settings.sqs_orders_queue}"


def _resolve_avatar_extension(filename: str | None, content_type: str | None) -> tuple[str, str]:
    normalized_mime = (content_type or "").split(";")[0].strip().lower()
    if not normalized_mime and filename:
        guessed, _ = mimetypes.guess_type(filename)
        normalized_mime = (guessed or "").lower()

    if normalized_mime not in ALLOWED_AVATAR_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato de imagen no válido. Usa JPG, PNG, WEBP, GIF o SVG.",
        )
    return normalized_mime, ALLOWED_AVATAR_MIME_TYPES[normalized_mime]


def upload_avatar_to_s3(
    user_id: str,
    file_bytes: bytes,
    filename: str | None,
    content_type: str | None,
) -> str:
    """Upload a validated user avatar to LocalStack S3 and return its browser-accessible URL."""
    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo de avatar está vacío.",
        )
    if len(file_bytes) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La imagen supera el límite máximo permitido de 5 MB.",
        )

    mime_type, ext = _resolve_avatar_extension(filename, content_type)
    settings = get_settings()
    s3 = get_s3_client()
    object_key = f"avatars/{user_id}/{uuid.uuid4().hex}{ext}"

    s3.put_object(
        Bucket=settings.s3_avatars_bucket,
        Key=object_key,
        Body=file_bytes,
        ContentType=mime_type,
        CacheControl="public, max-age=31536000",
    )

    public_base = settings.s3_public_endpoint_url.rstrip("/")
    return f"{public_base}/{settings.s3_avatars_bucket}/{object_key}"

"""Centralized application settings loaded from environment variables."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration for AWS/LocalStack, JWT auth, and CORS."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    aws_region: str = "us-east-1"
    aws_access_key_id: str = "test"
    aws_secret_access_key: str = "test"
    aws_endpoint_url: str = "http://localstack:4566"
    s3_public_endpoint_url: str = "http://localhost:4566"

    s3_avatars_bucket: str = "user-avatars-bucket"
    sqs_orders_queue: str = "orders-queue"
    dynamodb_users_table: str = "Users"
    dynamodb_products_table: str = "Products"
    dynamodb_orders_table: str = "Orders"

    jwt_secret_key: str = "localstack-ecommerce-dev-secret-key-2026-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings instance."""
    return Settings()

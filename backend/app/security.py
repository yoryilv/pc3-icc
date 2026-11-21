"""Password hashing (PBKDF2-HMAC-SHA256) and JWT authentication dependencies."""

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt

from app.aws_clients import get_users_table
from app.config import get_settings
from app.utils.dynamodb import from_dynamodb

PBKDF2_ITERATIONS = 260_000
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str, salt_hex: str | None = None) -> str:
    """Hash a plaintext password using PBKDF2-HMAC-SHA256."""
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${derived_key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify a plaintext password against a stored PBKDF2 hash in constant time."""
    try:
        algorithm, iter_str, salt_hex, expected_hex = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iter_str)
        derived_key = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            iterations,
        )
        return hmac.compare_digest(derived_key.hex(), expected_hex)
    except (ValueError, TypeError):
        return False


def create_access_token(user: dict[str, Any]) -> str:
    """Generate a signed HS256 JWT token for an authenticated user."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user["user_id"],
        "email": user["email"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate an HS256 JWT token."""
    settings = get_settings()
    try:
        return jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="El token ha expirado. Inicia sesión nuevamente.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticación inválido.",
        ) from exc


def sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    """Remove sensitive fields from a DynamoDB user item."""
    return {
        "user_id": user["user_id"],
        "username": user["username"],
        "email": user["email"],
        "role": user.get("role", "customer"),
        "avatar_url": user.get("avatar_url"),
        "created_at": user.get("created_at", ""),
    }


def _fetch_user_by_id(user_id: str) -> dict[str, Any] | None:
    response = get_users_table().get_item(Key={"user_id": user_id})
    item = response.get("Item")
    return from_dynamodb(item) if item else None


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any] | None:
    """Return authenticated user if Bearer token is present, otherwise None."""
    if credentials is None or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sin identificador de usuario.",
        )
    user = _fetch_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o eliminado.",
        )
    return sanitize_user(user)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Require a valid Bearer JWT and return the active user."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida.",
        )
    user = get_optional_current_user(credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticación requerida.",
        )
    return user


def require_admin(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """Ensure the authenticated user has administrator privileges."""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso denegado: se requiere rol de administrador.",
        )
    return current_user

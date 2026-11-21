"""Authentication endpoints: registration with S3 avatar upload, JWT login, and session lookup."""

import uuid
from boto3.dynamodb.conditions import Key
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import EmailStr, TypeAdapter, ValidationError

from app.aws_clients import get_users_table, upload_avatar_to_s3
from app.schemas import AuthResponse, LoginRequest, UserResponse
from app.security import (
    create_access_token,
    get_current_user,
    hash_password,
    sanitize_user,
    verify_password,
)
from app.utils.dynamodb import from_dynamodb, to_dynamodb, utc_now_iso

router = APIRouter(prefix="/api/auth", tags=["Autenticación"])
_email_adapter = TypeAdapter(EmailStr)


def _find_user_by_email(email: str) -> dict | None:
    response = get_users_table().query(
        IndexName="email-index",
        KeyConditionExpression=Key("email").eq(email),
        Limit=1,
    )
    items = response.get("Items", [])
    return from_dynamodb(items[0]) if items else None


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar usuario y subir avatar a S3",
)
async def register_user(
    username: str = Form(..., min_length=2, max_length=100),
    email: str = Form(...),
    password: str = Form(..., min_length=6, max_length=128),
    avatar: UploadFile | None = File(default=None),
):
    """Create a new customer user in DynamoDB, optionally uploading an avatar image to S3."""
    try:
        normalized_email = str(_email_adapter.validate_python(email.strip().lower()))
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El correo electrónico no tiene un formato válido.",
        ) from exc

    if _find_user_by_email(normalized_email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta registrada con ese correo electrónico.",
        )

    user_id = f"usr-{uuid.uuid4().hex[:10]}"
    avatar_url: str | None = None

    if avatar is not None and avatar.filename:
        file_bytes = await avatar.read()
        avatar_url = upload_avatar_to_s3(
            user_id=user_id,
            file_bytes=file_bytes,
            filename=avatar.filename,
            content_type=avatar.content_type,
        )

    user_item = {
        "user_id": user_id,
        "username": username.strip(),
        "email": normalized_email,
        "password_hash": hash_password(password),
        "role": "customer",
        "avatar_url": avatar_url,
        "created_at": utc_now_iso(),
    }

    get_users_table().put_item(Item=to_dynamodb(user_item))
    clean_user = sanitize_user(user_item)
    token = create_access_token(clean_user)
    return AuthResponse(access_token=token, user=UserResponse(**clean_user))


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Iniciar sesión y obtener token JWT",
)
def login_user(payload: LoginRequest):
    """Authenticate an existing user (admin or customer) and issue a JWT bearer token."""
    normalized_email = payload.email.strip().lower()
    user = _find_user_by_email(normalized_email)

    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas. Verifica tu correo y contraseña.",
        )

    clean_user = sanitize_user(user)
    token = create_access_token(clean_user)
    return AuthResponse(access_token=token, user=UserResponse(**clean_user))


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Obtener perfil del usuario autenticado",
)
def get_me(current_user: dict = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return UserResponse(**current_user)

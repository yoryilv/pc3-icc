"""User profile endpoints including S3 avatar updates."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.aws_clients import get_users_table, upload_avatar_to_s3
from app.schemas import UserResponse
from app.security import get_current_user, require_admin, sanitize_user
from app.utils.dynamodb import build_update_expression, from_dynamodb, scan_all, utc_now_iso

router = APIRouter(prefix="/api/users", tags=["Usuarios y Avatares S3"])


@router.put(
    "/profile",
    response_model=UserResponse,
    summary="Actualizar perfil de usuario y/o avatar en S3",
)
async def update_profile(
    username: str | None = Form(default=None),
    avatar: UploadFile | None = File(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Update authenticated user's display name and/or upload a new avatar image to LocalStack S3."""
    updates: dict = {}

    if username is not None:
        cleaned = username.strip()
        if len(cleaned) < 2 or len(cleaned) > 100:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="El nombre de usuario debe tener entre 2 y 100 caracteres.",
            )
        updates["username"] = cleaned

    if avatar is not None and avatar.filename:
        file_bytes = await avatar.read()
        updates["avatar_url"] = upload_avatar_to_s3(
            user_id=current_user["user_id"],
            file_bytes=file_bytes,
            filename=avatar.filename,
            content_type=avatar.content_type,
        )

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Debes proporcionar un nuevo nombre o una imagen de avatar para actualizar.",
        )

    updates["updated_at"] = utc_now_iso()
    expr = build_update_expression(updates)

    response = get_users_table().update_item(
        Key={"user_id": current_user["user_id"]},
        ReturnValues="ALL_NEW",
        **expr,
    )
    updated_user = sanitize_user(from_dynamodb(response["Attributes"]))
    return UserResponse(**updated_user)


@router.get(
    "",
    response_model=list[UserResponse],
    summary="Listar usuarios registrados (solo administrador)",
)
def list_users(_: dict = Depends(require_admin)):
    """Return all registered users stored in DynamoDB (admin only)."""
    items = scan_all(get_users_table())
    sanitized = [UserResponse(**sanitize_user(u)) for u in items]
    sanitized.sort(key=lambda u: u.created_at, reverse=True)
    return sanitized

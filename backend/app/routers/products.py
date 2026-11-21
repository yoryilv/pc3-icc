"""Product catalog endpoints backed by DynamoDB."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.aws_clients import get_products_table
from app.schemas import ProductCreate, ProductResponse, ProductUpdate
from app.security import require_admin
from app.utils.dynamodb import (
    build_update_expression,
    from_dynamodb,
    scan_all,
    to_dynamodb,
    utc_now_iso,
)

router = APIRouter(prefix="/api/products", tags=["Catálogo de Productos"])


@router.get(
    "",
    response_model=list[ProductResponse],
    summary="Listar productos con búsqueda y filtro por categoría",
)
def list_products(
    search: str | None = Query(default=None, description="Texto a buscar en nombre o descripción"),
    category: str | None = Query(default=None, description="Filtrar por categoría exacta"),
):
    """Fetch all products from DynamoDB with optional text search and category filter."""
    products = scan_all(get_products_table())

    if category and category.lower() != "todas":
        target_cat = category.strip().lower()
        products = [p for p in products if str(p.get("category", "")).lower() == target_cat]

    if search and search.strip():
        needle = search.strip().lower()
        products = [
            p
            for p in products
            if needle in str(p.get("name", "")).lower()
            or needle in str(p.get("description", "")).lower()
            or needle in str(p.get("category", "")).lower()
        ]

    products.sort(key=lambda item: str(item.get("name", "")).lower())
    return [ProductResponse(**p) for p in products]


@router.get(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Obtener detalle de un producto",
)
def get_product(product_id: str):
    """Fetch a single product by its DynamoDB primary key."""
    response = get_products_table().get_item(Key={"product_id": product_id})
    item = response.get("Item")
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto '{product_id}' no encontrado.",
        )
    return ProductResponse(**from_dynamodb(item))


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear nuevo producto (solo administrador)",
)
def create_product(payload: ProductCreate, _: dict = Depends(require_admin)):
    """Create a new product item in DynamoDB."""
    product_id = f"prod-{uuid.uuid4().hex[:8]}"
    now = utc_now_iso()
    item = {
        "product_id": product_id,
        "name": payload.name.strip(),
        "description": payload.description.strip(),
        "price": round(float(payload.price), 2),
        "stock": int(payload.stock),
        "category": payload.category.strip(),
        "image_url": payload.image_url.strip() or "/products/laptop-pro.svg",
        "created_at": now,
        "updated_at": now,
    }
    get_products_table().put_item(Item=to_dynamodb(item))
    return ProductResponse(**item)


@router.put(
    "/{product_id}",
    response_model=ProductResponse,
    summary="Actualizar producto existente (solo administrador)",
)
def update_product(
    product_id: str,
    payload: ProductUpdate,
    _: dict = Depends(require_admin),
):
    """Update one or more fields of an existing product in DynamoDB."""
    table = get_products_table()
    existing = table.get_item(Key={"product_id": product_id}).get("Item")
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto '{product_id}' no encontrado.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se enviaron campos para actualizar.",
        )

    if "price" in updates and updates["price"] is not None:
        updates["price"] = round(float(updates["price"]), 2)
    for text_field in ("name", "description", "category", "image_url"):
        if text_field in updates and updates[text_field] is not None:
            updates[text_field] = updates[text_field].strip()

    updates["updated_at"] = utc_now_iso()
    expr = build_update_expression(updates)

    response = table.update_item(
        Key={"product_id": product_id},
        ReturnValues="ALL_NEW",
        **expr,
    )
    return ProductResponse(**from_dynamodb(response["Attributes"]))


@router.delete(
    "/{product_id}",
    summary="Eliminar producto (solo administrador)",
)
def delete_product(product_id: str, _: dict = Depends(require_admin)):
    """Delete a product from DynamoDB."""
    table = get_products_table()
    existing = table.get_item(Key={"product_id": product_id}).get("Item")
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Producto '{product_id}' no encontrado.",
        )
    table.delete_item(Key={"product_id": product_id})
    return {"deleted": True, "product_id": product_id}

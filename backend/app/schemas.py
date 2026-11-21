"""Pydantic v2 request and response schemas for the CloudStore API."""

from typing import Literal
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    role: Literal["admin", "customer"]
    avatar_url: str | None = None
    created_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str = Field(min_length=4, max_length=1000)
    price: float = Field(gt=0)
    stock: int = Field(ge=0)
    category: str = Field(min_length=2, max_length=80)
    image_url: str = Field(default="/products/laptop-pro.svg", max_length=500)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, min_length=4, max_length=1000)
    price: float | None = Field(default=None, gt=0)
    stock: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, min_length=2, max_length=80)
    image_url: str | None = Field(default=None, max_length=500)


class ProductResponse(ProductBase):
    product_id: str
    created_at: str | None = None
    updated_at: str | None = None


class OrderItemInput(BaseModel):
    product_id: str = Field(min_length=1)
    quantity: int = Field(ge=1, le=99)


class OrderItemDetail(BaseModel):
    product_id: str
    name: str
    unit_price: float
    quantity: int
    subtotal: float


class OrderCreateRequest(BaseModel):
    customer_name: str | None = Field(default=None, min_length=2, max_length=120)
    items: list[OrderItemInput] = Field(min_length=1)


class OrderResponse(BaseModel):
    order_id: str
    user_id: str
    customer_name: str
    items: list[OrderItemDetail]
    total_amount: float
    status: Literal["QUEUED", "PROCESSED"]
    sqs_message_id: str | None = None
    created_at: str
    processed_at: str | None = None


class OrdersSummary(BaseModel):
    total: int
    queued: int
    processed: int
    total_revenue: float


class SQSMetricsResponse(BaseModel):
    queue_name: str
    queue_url: str
    approximate_number_of_messages: int
    approximate_number_of_messages_not_visible: int
    approximate_number_of_messages_delayed: int
    orders_summary: OrdersSummary


class SQSProcessResponse(BaseModel):
    processed_count: int
    processed_order_ids: list[str]
    remaining_approximate_messages: int
    message: str

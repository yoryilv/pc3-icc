"""DynamoDB serialization, pagination, and update helpers."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any


def to_dynamodb(value: Any) -> Any:
    """Recursively convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_dynamodb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_dynamodb(v) for v in value]
    return value


def from_dynamodb(value: Any) -> Any:
    """Recursively convert Decimal values back to int or float for JSON responses."""
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    if isinstance(value, dict):
        return {k: from_dynamodb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [from_dynamodb(v) for v in value]
    return value


def scan_all(table: Any, **kwargs: Any) -> list[dict[str, Any]]:
    """Scan all pages of a DynamoDB table and return Python-native dictionaries."""
    items: list[dict[str, Any]] = []
    scan_kwargs = dict(kwargs)

    while True:
        response = table.scan(**scan_kwargs)
        items.extend(from_dynamodb(item) for item in response.get("Items", []))
        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        scan_kwargs["ExclusiveStartKey"] = last_key

    return items


def build_update_expression(fields: dict[str, Any]) -> dict[str, Any]:
    """Build a safe DynamoDB UpdateExpression aliasing every attribute name."""
    expr_parts: list[str] = []
    attr_names: dict[str, str] = {}
    attr_values: dict[str, Any] = {}

    for idx, (key, val) in enumerate(fields.items()):
        name_alias = f"#attr_{idx}"
        val_alias = f":val_{idx}"
        attr_names[name_alias] = key
        attr_values[val_alias] = to_dynamodb(val)
        expr_parts.append(f"{name_alias} = {val_alias}")

    return {
        "UpdateExpression": "SET " + ", ".join(expr_parts),
        "ExpressionAttributeNames": attr_names,
        "ExpressionAttributeValues": attr_values,
    }


def utc_now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format with Z suffix."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

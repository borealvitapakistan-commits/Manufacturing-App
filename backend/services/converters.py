import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID


DB_TO_APP = {
    "has_njp": "hasNJP",
    "bottle_cc": "bottleCC",
}


def snake_to_camel(value: str) -> str:
    return DB_TO_APP.get(value, re.sub(r"_([a-z])", lambda m: m.group(1).upper(), value))


def camel_to_snake(value: str) -> str:
    value = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", value)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value).lower()


def to_json_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, list):
        return [to_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: to_json_value(item) for key, item in value.items()}
    return value


def row_to_app(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if row is None:
        return None
    result: dict[str, Any] = {}
    for key, value in row.items():
        app_key = snake_to_camel(key)
        if key.endswith("_at") and isinstance(value, str):
            try:
                result[app_key] = int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
                continue
            except ValueError:
                pass
        result[app_key] = to_json_value(value)
    return result


def rows_to_app(rows: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [row_to_app(row) or {} for row in (rows or [])]


def payload_to_db(payload: dict[str, Any], *, drop: set[str] | None = None) -> dict[str, Any]:
    ignored = drop or set()
    return {
        camel_to_snake(key): to_json_value(value)
        for key, value in payload.items()
        if key not in ignored
    }

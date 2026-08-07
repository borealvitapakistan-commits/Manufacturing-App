from __future__ import annotations

from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID, uuid4

from services.base_service import ServiceError, translate_error
from services.supabase_client import get_supabase


def client():
    return get_supabase()


def data(response) -> list[dict[str, Any]]:
    return list(response.data or [])


def one(response) -> dict[str, Any] | None:
    rows = data(response)
    return rows[0] if rows else None


def execute(query):
    try:
        return query.execute()
    except Exception as error:
        raise translate_error(error) from error


def as_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value in (None, ""):
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return default


def as_float(value: Any, default: float = 0.0) -> float:
    return float(as_decimal(value, Decimal(str(default))))


def as_int(value: Any, default: int = 0) -> int:
    if value in (None, ""):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def decimal_str(value: Any, places: str = "0.000001") -> str:
    return str(as_decimal(value).quantize(Decimal(places)))


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return value


def clean_text(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


def date_from_ms(value: Any) -> str | None:
    if value in (None, ""):
        return None
    try:
        seconds = int(value) / 1000
        return datetime.fromtimestamp(seconds, tz=timezone.utc).date().isoformat()
    except (TypeError, ValueError, OSError):
        text = str(value).strip()
        return text[:10] if text else None


def timestamp_ms(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        if isinstance(value, (int, float)) and value > 10_000_000_000:
            return int(value)
        text = str(value).strip()
        if text.isdigit():
            number = int(text)
            return number if number > 10_000_000_000 else number * 1000
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return int(parsed.timestamp() * 1000)
    except (TypeError, ValueError, OSError):
        return None


def first_present(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def ensure_location(location_text: str | None) -> str | None:
    text = clean_text(location_text)
    if not text:
        return None

    db = client()
    found = one(
        execute(
            db.table("inventory_locations")
            .select("id")
            .ilike("location_name", text)
            .limit(1)
        )
    )
    if found:
        return str(found["id"])

    created = one(
        execute(
            db.table("inventory_locations")
            .insert(
                {
                    "location_name": text,
                    "location_code": text,
                }
            )
        )
    )
    return str(created["id"]) if created else None


def create_inventory_item(
    *,
    item_kind: str,
    item_name: str,
    unit_of_measure: str,
    item_code: str | None = None,
    reorder_level: Any = 0,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "item_kind": item_kind,
        "item_code": clean_text(item_code),
        "item_name": clean_text(item_name) or item_kind,
        "unit_of_measure": unit_of_measure,
        "reorder_level": decimal_str(reorder_level),
        "metadata": json_safe(metadata or {}),
    }
    return one(execute(client().table("inventory_items").insert(payload))) or {}


def create_lot(
    *,
    inventory_item_id: str,
    lot_code: str,
    location_id: str | None = None,
    received_date: str | None = None,
    manufacture_date: str | None = None,
    expiry_date: str | None = None,
    source_document_type: str | None = None,
    source_document_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "inventory_item_id": inventory_item_id,
        "lot_code": clean_text(lot_code) or inventory_item_id,
        "location_id": location_id,
        "received_date": received_date,
        "manufacture_date": manufacture_date,
        "expiry_date": expiry_date,
        "source_document_type": source_document_type,
        "source_document_id": source_document_id,
        "metadata": json_safe(metadata or {}),
        "status": "available",
    }
    return one(execute(client().table("inventory_lots").insert(payload))) or {}


def latest_lot_id(inventory_item_id: str) -> str | None:
    row = one(
        execute(
            client()
            .table("inventory_lots")
            .select("id")
            .eq("inventory_item_id", inventory_item_id)
            .order("created_at", desc=True)
            .limit(1)
        )
    )
    return str(row["id"]) if row else None


def get_inventory_quantity(
    *,
    inventory_item_id: str,
    inventory_lot_id: str | None = None,
    location_id: str | None = None,
) -> Decimal:
    query = (
        client()
        .table("inventory_balances")
        .select("quantity")
        .eq("inventory_item_id", inventory_item_id)
    )
    if inventory_lot_id:
        query = query.eq("inventory_lot_id", inventory_lot_id)
    if location_id:
        query = query.eq("location_id", location_id)
    return sum((as_decimal(row.get("quantity")) for row in data(execute(query))), Decimal("0"))


def get_inventory_quantity_as_of(
    *,
    inventory_item_id: str,
    inventory_lot_id: str | None,
    as_of: datetime,
) -> Decimal:
    """Balance for a single lot at a point in time, reconstructed from the
    inventory_movements ledger rather than the live inventory_balances table.
    """
    query = (
        client()
        .table("inventory_movements")
        .select("quantity_after")
        .eq("inventory_item_id", inventory_item_id)
        .lt("created_at", as_of.isoformat())
        .order("created_at", desc=True)
        .limit(1)
    )
    if inventory_lot_id:
        query = query.eq("inventory_lot_id", inventory_lot_id)
    row = one(execute(query))
    return as_decimal(row["quantity_after"]) if row else Decimal("0")


def inventory_balance_rows(
    *,
    inventory_item_id: str,
    location_id: str | None = None,
) -> list[dict[str, Any]]:
    query = (
        client()
        .table("inventory_balances")
        .select("inventory_lot_id, location_id, quantity")
        .eq("inventory_item_id", inventory_item_id)
    )
    if location_id:
        query = query.eq("location_id", location_id)
    rows = data(execute(query))
    return [row for row in rows if as_decimal(row.get("quantity")) > 0]


def inventory_movement(
    *,
    inventory_item_id: str,
    quantity_delta: Any,
    movement_type: str,
    inventory_lot_id: str | None = None,
    location_id: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: str | None = None,
    reason: str | None = None,
    metadata: dict[str, Any] | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    response = execute(
        client().rpc(
            "apply_inventory_movement",
            {
                "p_inventory_item_id": inventory_item_id,
                "p_inventory_lot_id": inventory_lot_id,
                "p_location_id": location_id,
                "p_quantity_delta": decimal_str(quantity_delta),
                "p_movement_type": movement_type,
                "p_related_entity_type": related_entity_type,
                "p_related_entity_id": related_entity_id,
                "p_reason": reason,
                "p_metadata": json_safe(metadata or {}),
                "p_idempotency_key": idempotency_key or str(uuid4()),
            },
        )
    )
    result = response.data
    if isinstance(result, dict):
        return result
    if isinstance(result, list) and result:
        return result[0]
    return {}


def consume_inventory_quantity(
    *,
    inventory_item_id: str,
    quantity: Any,
    movement_type: str = "consume",
    location_id: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: str | None = None,
    reason: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    requested = as_decimal(quantity)
    if requested <= 0:
        return []

    available = get_inventory_quantity(
        inventory_item_id=inventory_item_id,
        location_id=location_id,
    )
    if requested > available:
        raise ServiceError(
            f"Inventory is not enough. Available: {available}, required: {requested}.",
            400,
        )

    remaining = requested
    movements: list[dict[str, Any]] = []
    for row in inventory_balance_rows(
        inventory_item_id=inventory_item_id,
        location_id=location_id,
    ):
        row_qty = as_decimal(row.get("quantity"))
        if row_qty <= 0:
            continue
        used = min(row_qty, remaining)
        if used <= 0:
            continue
        movements.append(
            inventory_movement(
                inventory_item_id=inventory_item_id,
                inventory_lot_id=(
                    str(row["inventory_lot_id"])
                    if row.get("inventory_lot_id")
                    else None
                ),
                location_id=(
                    str(row["location_id"]) if row.get("location_id") else None
                ),
                quantity_delta=-used,
                movement_type=movement_type,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
                reason=reason,
                metadata=metadata,
            )
        )
        remaining -= used
        if remaining <= 0:
            break

    return movements


def require_row(row: dict[str, Any] | None, message: str, status_code: int = 404):
    if not row:
        raise ServiceError(message, status_code)
    return row

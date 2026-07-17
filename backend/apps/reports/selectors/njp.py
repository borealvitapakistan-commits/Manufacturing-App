from __future__ import annotations

from datetime import date
from typing import Any

from apps.manufacturing.services import NJPService

from .utils import filter_by_date_range


def list_njp_reports(
    *,
    brand_id: str | None = None,
    product_id: str | None = None,
    mixing_id: str | None = None,
    search: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    rows = NJPService.list(
        brand_id=brand_id,
        product_id=product_id,
        mixing_id=mixing_id,
        search=search,
        limit=limit,
    )
    return filter_by_date_range(
        rows,
        from_date=from_date,
        to_date=to_date,
        date_keys=("productionDate", "startDate", "createdAt"),
    )


def get_njp_report(item_id: str) -> dict[str, Any]:
    return NJPService.get(item_id)

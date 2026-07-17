from __future__ import annotations

from datetime import date
from typing import Any

from apps.manufacturing.services import MixingService

from .utils import filter_by_date_range


def list_mixing_reports(
    *,
    brand_id: str | None = None,
    product_id: str | None = None,
    search: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    rows = MixingService.list(
        brand_id=brand_id,
        product_id=product_id,
        search=search,
        limit=limit,
    )
    return filter_by_date_range(
        rows,
        from_date=from_date,
        to_date=to_date,
        date_keys=("productionDate", "startDate", "mixingStartDate", "createdAt"),
    )


def get_mixing_report(item_id: str) -> dict[str, Any]:
    return MixingService.get(item_id)

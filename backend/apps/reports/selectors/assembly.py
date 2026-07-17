from __future__ import annotations

from datetime import date
from typing import Any

from apps.manufacturing.services import AssemblyService

from .utils import filter_by_date_range


def list_assembly_reports(
    *,
    brand_id: str | None = None,
    product_id: str | None = None,
    njp_id: str | None = None,
    search: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 500,
) -> list[dict[str, Any]]:
    rows = AssemblyService.list(
        brand_id=brand_id,
        product_id=product_id,
        njp_id=njp_id,
        search=search,
        limit=limit,
    )
    return filter_by_date_range(
        rows,
        from_date=from_date,
        to_date=to_date,
        date_keys=("productionDate", "assemblyDate", "createdAt"),
    )


def get_assembly_report(item_id: str) -> dict[str, Any]:
    return AssemblyService.get(item_id)

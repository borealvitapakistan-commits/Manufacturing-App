from __future__ import annotations

from datetime import date
from typing import Any, Iterable


def first_present(record: dict[str, Any], keys: Iterable[str]) -> Any:
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return value
    return None


def normalize_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def filter_by_date_range(
    rows: list[dict[str, Any]],
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    date_keys: tuple[str, ...],
) -> list[dict[str, Any]]:
    if not from_date and not to_date:
        return rows

    filtered = []
    for row in rows:
        row_date = normalize_date(first_present(row, date_keys))
        if row_date is None:
            continue
        if from_date and row_date < from_date:
            continue
        if to_date and row_date > to_date:
            continue
        filtered.append(row)
    return filtered

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from fnmatch import fnmatchcase
from typing import Any, Callable
from uuid import uuid4

from .local_json_store import LocalJSONStore


KNOWN_TABLES = {
    "assembly_reports",
    "batches",
    "brands",
    "company_settings",
    "employee_loans",
    "employees",
    "expense_books",
    "expenses",
    "finished_goods",
    "finished_goods_history",
    "label_inventory",
    "mixing_reports",
    "njp_reports",
    "po_document_items",
    "po_documents",
    "products",
    "purchase_orders",
    "raw_material_categories",
    "raw_materials",
    "salary_sheets",
    "time_entries",
    "vendors",
    "work_entries",
}


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _today_ms() -> int:
    today = date.today()
    return int(datetime(today.year, today.month, today.day).timestamp() * 1000)


def _value_for_compare(value: Any) -> Any:
    if isinstance(value, str):
        return value.lower()
    return value


def _matches_like(value: Any, pattern: str, *, case_sensitive: bool) -> bool:
    text = "" if value is None else str(value)
    compare_text = text if case_sensitive else text.lower()
    compare_pattern = pattern if case_sensitive else pattern.lower()
    if "%" in compare_pattern:
        return fnmatchcase(compare_text, compare_pattern.replace("%", "*"))
    return compare_text == compare_pattern


@dataclass
class LocalResponse:
    data: Any = None
    count: int | None = None


class LocalTableStore:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.store = LocalJSONStore(f"tables/{table_name}.json", [])

    def read(self) -> list[dict[str, Any]]:
        rows = self.store.read()
        if not isinstance(rows, list):
            rows = []
            self.write(rows)
        if self.table_name == "raw_material_categories" and not rows:
            rows = [
                {
                    "id": str(uuid4()),
                    "name": "Other",
                    "description": "Default category for uncategorized raw materials.",
                    "is_active": True,
                    "created_at": _now_iso(),
                    "updated_at": _now_iso(),
                }
            ]
            self.write(rows)
        return rows

    def write(self, rows: list[dict[str, Any]]) -> None:
        self.store.write(rows)


class LocalTableQuery:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.store = LocalTableStore(table_name)
        self._action = "select"
        self._payload: Any = None
        self._filters: list[Callable[[dict[str, Any]], bool]] = []
        self._orders: list[tuple[str, bool]] = []
        self._limit: int | None = None
        self._maybe_single = False
        self._count_requested = False

    def select(self, _columns: str = "*", count: str | None = None):
        self._action = "select"
        self._count_requested = count == "exact"
        return self

    def insert(self, payload: dict[str, Any] | list[dict[str, Any]]):
        self._action = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict[str, Any]):
        self._action = "update"
        self._payload = payload
        return self

    def delete(self):
        self._action = "delete"
        return self

    def eq(self, key: str, value: Any):
        self._filters.append(lambda row, k=key, v=value: row.get(k) == v)
        return self

    def in_(self, key: str, values: list[Any]):
        allowed = {str(value) for value in values}
        self._filters.append(lambda row, k=key, a=allowed: str(row.get(k)) in a)
        return self

    def gte(self, key: str, value: Any):
        self._filters.append(lambda row, k=key, v=value: row.get(k) is not None and row.get(k) >= v)
        return self

    def lte(self, key: str, value: Any):
        self._filters.append(lambda row, k=key, v=value: row.get(k) is not None and row.get(k) <= v)
        return self

    def ilike(self, key: str, pattern: str):
        self._filters.append(
            lambda row, k=key, p=pattern: _matches_like(row.get(k), p, case_sensitive=False)
        )
        return self

    def like(self, key: str, pattern: str):
        self._filters.append(
            lambda row, k=key, p=pattern: _matches_like(row.get(k), p, case_sensitive=True)
        )
        return self

    def or_(self, expression: str):
        terms = []
        for part in expression.split(","):
            pieces = part.split(".", 2)
            if len(pieces) == 3:
                terms.append(tuple(pieces))

        def matches(row: dict[str, Any]) -> bool:
            for key, operation, pattern in terms:
                if operation == "ilike" and _matches_like(
                    row.get(key), pattern, case_sensitive=False
                ):
                    return True
                if operation == "like" and _matches_like(
                    row.get(key), pattern, case_sensitive=True
                ):
                    return True
                if operation == "eq" and row.get(key) == pattern:
                    return True
            return False

        self._filters.append(matches)
        return self

    def order(self, key: str, desc: bool = False):
        self._orders.append((key, desc))
        return self

    def limit(self, value: int):
        self._limit = value
        return self

    def maybe_single(self):
        self._maybe_single = True
        return self

    def execute(self):
        if self._action == "insert":
            return self._execute_insert()
        if self._action == "update":
            return self._execute_update()
        if self._action == "delete":
            return self._execute_delete()
        return self._execute_select()

    def _filtered(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        filtered = [
            row for row in rows if all(filter_fn(row) for filter_fn in self._filters)
        ]
        for key, descending in reversed(self._orders):
            filtered.sort(
                key=lambda row, k=key: _value_for_compare(row.get(k)),
                reverse=descending,
            )
        return filtered

    def _execute_select(self):
        rows = self._filtered(self.store.read())
        count = len(rows) if self._count_requested else None
        if self._limit is not None:
            rows = rows[: max(0, self._limit)]
        if self._maybe_single:
            return LocalResponse(data=rows[0] if rows else None, count=count)
        return LocalResponse(data=rows, count=count)

    def _execute_insert(self):
        rows = self.store.read()
        payloads = self._payload if isinstance(self._payload, list) else [self._payload]
        inserted = []
        for payload in payloads:
            now = _now_iso()
            row = dict(payload or {})
            row.setdefault("id", str(uuid4()))
            row.setdefault("created_at", now)
            row.setdefault("updated_at", now)
            rows.append(row)
            inserted.append(row)
        self.store.write(rows)
        return LocalResponse(data=inserted)

    def _execute_update(self):
        rows = self.store.read()
        updated = []
        for index, row in enumerate(rows):
            if all(filter_fn(row) for filter_fn in self._filters):
                next_row = {**row, **dict(self._payload or {}), "updated_at": _now_iso()}
                rows[index] = next_row
                updated.append(next_row)
        self.store.write(rows)
        return LocalResponse(data=updated)

    def _execute_delete(self):
        rows = self.store.read()
        deleted = []
        kept = []
        for row in rows:
            if all(filter_fn(row) for filter_fn in self._filters):
                deleted.append(row)
            else:
                kept.append(row)
        self.store.write(kept)
        return LocalResponse(data=deleted)


class LocalRPCQuery:
    def __init__(self, name: str, params: dict[str, Any] | None):
        self.name = name
        self.params = params or {}

    def execute(self):
        handler = getattr(self, f"_handle_{self.name}", None)
        if not handler:
            return LocalResponse(data=None)
        return LocalResponse(data=handler())

    @staticmethod
    def _table(name: str) -> LocalTableStore:
        return LocalTableStore(name)

    def _handle_create_batch_with_inventory_deduction(self):
        row = {
            "brand_id": self.params.get("p_brand_id"),
            "brand_name": self.params.get("p_brand_name"),
            "brand_code_prefix": self.params.get("p_brand_code_prefix"),
            "batch_code": self.params.get("p_batch_code"),
            "product_id": self.params.get("p_product_id"),
            "product_name": self.params.get("p_product_name"),
            "dosage_form": self.params.get("p_dosage_form"),
            "units_per_container": self.params.get("p_units_per_container"),
            "container_count": self.params.get("p_container_count"),
            "total_units": self.params.get("p_total_units"),
            "notes": self.params.get("p_notes") or "",
            "created_by": self.params.get("p_created_by"),
            "start_time": self.params.get("p_start_time"),
            "end_time": self.params.get("p_end_time"),
            "status": "mixingPending",
            "has_mixing": False,
            "has_njp": False,
            "has_assembly": False,
        }
        return LocalTableQuery("batches").insert(row).execute().data[0]["id"]

    def _handle_update_batch_with_inventory_deduction(self):
        batch_id = self.params.get("p_batch_id")
        payload = {
            "brand_id": self.params.get("p_brand_id"),
            "brand_name": self.params.get("p_brand_name"),
            "brand_code_prefix": self.params.get("p_brand_code_prefix"),
            "batch_code": self.params.get("p_batch_code"),
            "product_id": self.params.get("p_product_id"),
            "product_name": self.params.get("p_product_name"),
            "dosage_form": self.params.get("p_dosage_form"),
            "units_per_container": self.params.get("p_units_per_container"),
            "container_count": self.params.get("p_container_count"),
            "total_units": self.params.get("p_total_units"),
            "notes": self.params.get("p_notes") or "",
            "created_by": self.params.get("p_created_by"),
            "start_time": self.params.get("p_start_time"),
            "end_time": self.params.get("p_end_time"),
        }
        LocalTableQuery("batches").update(payload).eq("id", batch_id).execute()
        return batch_id

    def _handle_delete_batch_cascade(self):
        batch_id = self.params.get("p_batch_id")
        deleted = {}
        for table in ("mixing_reports", "njp_reports", "assembly_reports"):
            response = LocalTableQuery(table).delete().eq("batch_id", batch_id).execute()
            deleted[table.replace("_reports", "")] = len(response.data or [])
        LocalTableQuery("finished_goods").delete().eq("batch_id", batch_id).execute()
        LocalTableQuery("batches").delete().eq("id", batch_id).execute()
        return {
            "restored": {},
            "deleted": {
                "mixing": deleted.get("mixing", 0),
                "njp": deleted.get("njp", 0),
                "assembly": deleted.get("assembly", 0),
            },
        }

    def _handle_create_mixing_report_with_deduction(self):
        row = {
            "batch_id": self.params.get("p_batch_id"),
            "brand_id": self.params.get("p_brand_id"),
            "product_id": self.params.get("p_product_id"),
            "rm_usage": self.params.get("p_rm_usage") or [],
            "non_med_usage": self.params.get("p_non_med_usage") or [],
            "mixing_dates": self.params.get("p_mixing_dates") or [],
            "mixing_notes": self.params.get("p_mixing_notes") or "",
            "batch_code": self.params.get("p_batch_code"),
            "brand_name": self.params.get("p_brand_name"),
            "product_name": self.params.get("p_product_name"),
            "mixing_date": self.params.get("p_mixing_date") or _today_ms(),
            "mixed_powder_name": self.params.get("p_mixed_powder_name"),
            "mixed_powder_qty_kg": self.params.get("p_mixed_powder_qty_kg"),
            "total_formula_qty_kg": self.params.get("p_total_formula_qty_kg"),
            "total_mixed_qty_kg": self.params.get("p_total_mixed_qty_kg"),
            "existing_mixed_powder_used_kg": self.params.get(
                "p_existing_mixed_powder_used_kg"
            ),
        }
        report_id = LocalTableQuery("mixing_reports").insert(row).execute().data[0]["id"]
        self._apply_mixing_stock(row["rm_usage"])
        LocalTableQuery("batches").update(
            {"has_mixing": True, "status": "ngpPending"}
        ).eq("id", row["batch_id"]).execute()
        return report_id

    def _handle_delete_mixing_report_with_restore(self):
        report_id = self.params.get("p_report_id")
        response = LocalTableQuery("mixing_reports").select("*").eq("id", report_id).maybe_single().execute()
        report = response.data
        if not report:
            return {"restored": {}, "deleted": 0}
        self._restore_mixing_stock(report.get("rm_usage") or [])
        LocalTableQuery("mixing_reports").delete().eq("id", report_id).execute()
        LocalTableQuery("batches").update(
            {"has_mixing": False, "status": "mixingPending"}
        ).eq("id", report.get("batch_id")).execute()
        return {"restored": {"rawMaterials": len(report.get("rm_usage") or [])}, "deleted": 1}

    def _handle_save_loan_with_expense(self):
        employee_id = self.params.get("p_employee_id")
        amount = float(self.params.get("p_amount") or 0)
        note = self.params.get("p_note") or ""
        book_id = self.params.get("p_book_id")
        given_from = self.params.get("p_given_from")
        LocalTableQuery("employee_loans").insert(
            {
                "employee_id": employee_id,
                "amount": amount,
                "description": note,
                "date": _today_ms(),
            }
        ).execute()
        LocalTableQuery("expenses").insert(
            {
                "book_id": book_id,
                "amount": amount,
                "description": note,
                "given_from": given_from,
                "direction": "debit",
                "date": _today_ms(),
            }
        ).execute()
        return {"success": True}

    @staticmethod
    def _apply_mixing_stock(rows: list[dict[str, Any]]) -> None:
        materials = LocalTableStore("raw_materials").read()
        by_id = {str(row.get("id")): row for row in materials}
        changed = False
        for usage in rows or []:
            material = by_id.get(str(usage.get("rawMaterialId") or usage.get("raw_material_id") or ""))
            if not material:
                continue
            if usage.get("qtyAfterKg") is not None:
                material["qty_kg"] = usage.get("qtyAfterKg")
            else:
                material["qty_kg"] = round(
                    float(material.get("qty_kg") or 0)
                    - float(usage.get("requiredQtyKgThisMix") or usage.get("usedQtyKg") or 0),
                    4,
                )
            changed = True
        if changed:
            LocalTableStore("raw_materials").write(materials)

    @staticmethod
    def _restore_mixing_stock(rows: list[dict[str, Any]]) -> None:
        materials = LocalTableStore("raw_materials").read()
        by_id = {str(row.get("id")): row for row in materials}
        changed = False
        for usage in rows or []:
            material = by_id.get(str(usage.get("rawMaterialId") or usage.get("raw_material_id") or ""))
            if not material:
                continue
            if usage.get("qtyBeforeKg") is not None:
                material["qty_kg"] = usage.get("qtyBeforeKg")
            else:
                material["qty_kg"] = round(
                    float(material.get("qty_kg") or 0)
                    + float(usage.get("requiredQtyKgThisMix") or usage.get("usedQtyKg") or 0),
                    4,
                )
            changed = True
        if changed:
            LocalTableStore("raw_materials").write(materials)


class LocalSupabaseClient:
    def __init__(self):
        for table_name in sorted(KNOWN_TABLES):
            LocalTableStore(table_name).read()

    def table(self, table_name: str) -> LocalTableQuery:
        return LocalTableQuery(table_name)

    def rpc(self, name: str, params: dict[str, Any] | None = None) -> LocalRPCQuery:
        return LocalRPCQuery(name, params)

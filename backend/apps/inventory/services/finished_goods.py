from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.utils import timezone as dj_timezone

from services import db
from services.base_service import ServiceError, TableService


FINISHED_GOOD_FIELDS = {
    "brandId",
    "productId",
    "batchCode",
    "brandName",
    "productName",
    "category",
    "name",
    "location",
    "comments",
    "powderNo",
    "rackNo",
    "weightKg",
    "capsuleCode",
    "bucket",
    "capsuleMg",
    "capsuleWeightKg",
    "capsuleAmount",
    "capsuleStatus",
    "boxNo",
    "bottleTotal",
    "expiryDate",
}


def sql_date(value: Any) -> str | None:
    if value in {None, ""}:
        return None
    if isinstance(value, str) and len(value) >= 10 and value[4] == "-" and value[7] == "-":
        return value[:10]
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000).date().isoformat()
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return None


class FinishedGoodsHistoryService(TableService):
    table_name = "finished_goods_history"

    @classmethod
    def list(cls, **kwargs):
        return []


class FinishedGoodsService(TableService):
    table_name = "finished_goods"

    @classmethod
    def list(cls, **kwargs):
        return cls._db_list(**kwargs)

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        for record in cls._db_list(limit=1000):
            if str(record.get("id")) == str(item_id):
                return record
        raise ServiceError("Finished goods record not found", 404)

    @classmethod
    def _clean_payload(cls, payload: dict[str, Any]) -> dict[str, Any]:
        cleaned = {key: value for key, value in payload.items() if key in FINISHED_GOOD_FIELDS}
        if "expiryDate" in cleaned:
            cleaned["expiryDate"] = sql_date(cleaned["expiryDate"])
        for field in ("batchCode", "brandName", "productName", "name", "location", "comments"):
            if field in cleaned:
                cleaned[field] = str(cleaned[field] or "").strip()
        return cleaned

    @classmethod
    def _record_history(
        cls,
        item_id: str,
        *,
        source: str,
        change_type: str,
        changes: dict[str, Any],
        reason: str | None,
    ) -> None:
        FinishedGoodsHistoryService.create(
            {
                "finishedGoodId": item_id,
                "changeSource": source,
                "changeType": change_type,
                "changes": changes,
                "reason": reason,
            }
        )

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        raise ServiceError(
            "Finished goods are generated from Mixing, Encapsulation, and Assembly records. Edit the source record instead.",
            400,
        )

    @classmethod
    def update_with_history(
        cls,
        item_id: str,
        changes: dict[str, Any],
        *,
        reason: str,
        source: str = "manual",
        change_type: str | None = None,
    ) -> dict[str, Any]:
        raise ServiceError(
            "Finished goods are generated from Mixing, Encapsulation, and Assembly records. Edit the source record instead.",
            400,
        )

    @classmethod
    def delete(cls, item_id: str) -> None:
        raise ServiceError(
            "Finished goods are generated from Mixing, Encapsulation, and Assembly records. Delete the source record instead.",
            400,
        )

    @staticmethod
    def _current_month_key() -> str:
        return dj_timezone.localdate().strftime("%Y-%m")

    @staticmethod
    def _month_cutoff(month: str) -> datetime | None:
        """First instant of the month *after* `month` (a "YYYY-MM" string),
        in the app's configured timezone. Used as an exclusive upper bound
        so "as of end of month" means created_at < cutoff.
        """
        try:
            year, mon = (int(part) for part in month.split("-", 1))
            next_year, next_mon = (year + 1, 1) if mon == 12 else (year, mon + 1)
            return dj_timezone.make_aware(datetime(next_year, next_mon, 1))
        except (ValueError, TypeError):
            return None

    @classmethod
    def _db_list(cls, **kwargs) -> list[dict[str, Any]]:
        filters = kwargs.get("filters") or {}
        search = kwargs.get("search")
        limit = max(1, min(int(kwargs.get("limit") or 500), 1000))
        category = str(filters.get("category") or "").strip().lower()
        month = str(filters.get("month") or "").strip()
        cutoff = cls._month_cutoff(month) if month else None
        use_as_of = cutoff is not None and month < cls._current_month_key()

        records: list[dict[str, Any]] = []
        if use_as_of:
            if category in {"", "powder"}:
                records.extend(cls._db_powders_as_of(cutoff, limit=limit))
            if category in {"", "capsule"}:
                records.extend(cls._db_capsules_as_of(cutoff, limit=limit))
            if category in {"", "bottle"}:
                records.extend(cls._db_bottles_as_of(cutoff, limit=limit))
        else:
            if category in {"", "powder"}:
                records.extend(cls._db_powders(limit=limit))
            if category in {"", "capsule"}:
                records.extend(cls._db_capsules(limit=limit))
            if category in {"", "bottle"}:
                records.extend(cls._db_bottles(limit=limit))

        records = [record for record in records if cls._matches_filters(record, filters)]
        if search and search[1]:
            needle = str(search[1]).lower()
            records = [
                record
                for record in records
                if needle in str(record.get("name") or "").lower()
                or needle in str(record.get("productName") or "").lower()
                or needle in str(record.get("batchCode") or "").lower()
                or needle in str(record.get("mixingCode") or "").lower()
                or needle in str(record.get("capsuleCode") or "").lower()
            ]
        records.sort(key=lambda row: str(row.get("updated_at") or row.get("created_at") or ""), reverse=True)
        return records[:limit]

    @staticmethod
    def _brand_ids(row: dict[str, Any]) -> list[str]:
        raw_ids = row.get("brand_ids") or row.get("brandIds") or []
        if isinstance(raw_ids, str):
            return [item.strip() for item in raw_ids.strip("{}").split(",") if item.strip()]
        return [str(item) for item in raw_ids if item not in (None, "")]

    @classmethod
    def _matches_filters(cls, record: dict[str, Any], filters: dict[str, Any]) -> bool:
        brand_id = filters.get("brand_id")
        product_id = filters.get("product_id")
        category = filters.get("category")
        if category and str(record.get("category")) != str(category):
            return False
        if product_id and str(record.get("productId") or "") != str(product_id):
            return False
        if brand_id:
            if str(record.get("brandId") or "") == str(brand_id):
                return True
            return str(brand_id) in [str(item) for item in (record.get("brandIds") or [])]
        return True

    @classmethod
    def _db_powders(cls, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("v_mixing_reports")
                .select("*")
                .order("updated_at", desc=True)
                .limit(limit)
            )
        )
        return [
            {
                "id": str(row["id"]),
                "category": "powder",
                "brandId": None,
                "brandIds": cls._brand_ids(row),
                "brandName": row.get("brand_names"),
                "productId": row.get("product_id"),
                "productName": row.get("product_name"),
                "productCode": row.get("product_code"),
                "name": row.get("product_name"),
                "batchCode": row.get("mixing_code"),
                "mixingCode": row.get("mixing_code"),
                "powderNo": row.get("mixing_code"),
                "location": row.get("location"),
                "rackNo": row.get("location"),
                "weightKg": db.as_float(row.get("available_mixed_powder_kg")),
                "comments": row.get("remarks"),
                "createdAt": db.timestamp_ms(row.get("created_at")),
                "updatedAt": db.timestamp_ms(row.get("updated_at")),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
            for row in rows
        ]

    @classmethod
    def _db_capsules(cls, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("v_encapsulation_reports")
                .select("*")
                .order("updated_at", desc=True)
                .limit(limit)
            )
        )
        records = []
        for row in rows:
            encapsulation_code = row.get("encapsulation_code") or row.get("njp_code")
            records.append(
                {
                    "id": str(row["id"]),
                    "category": "capsule",
                    "brandId": None,
                    "brandIds": cls._brand_ids(row),
                    "brandName": row.get("brand_names"),
                    "productId": row.get("product_id"),
                    "productName": row.get("product_name"),
                    "productCode": row.get("product_code"),
                    "name": row.get("product_name"),
                    "batchCode": encapsulation_code,
                    "mixingCode": row.get("mixing_code"),
                    "encapsulationCode": encapsulation_code,
                    "capsuleCode": encapsulation_code,
                    "bucket": row.get("bucket"),
                    "location": row.get("location"),
                    "capsuleMg": db.as_float(row.get("target_fill_weight_mg")),
                    "capsuleWeightKg": db.as_float(row.get("total_capsules_produced_kg")),
                    "capsuleAmount": int(db.as_float(row.get("available_capsules_qty"))),
                    "capsuleStatus": row.get("status"),
                    "status": row.get("status"),
                    "targetFillWeightMg": db.as_float(row.get("target_fill_weight_mg")),
                    "totalCapsulesFilledQty": int(db.as_float(row.get("total_capsules_filled_qty"))),
                    "availableCapsulesQty": int(db.as_float(row.get("available_capsules_qty"))),
                    "comments": row.get("remarks"),
                    "createdAt": db.timestamp_ms(row.get("created_at")),
                    "updatedAt": db.timestamp_ms(row.get("updated_at")),
                    "created_at": row.get("created_at"),
                    "updated_at": row.get("updated_at"),
                }
            )
        return records

    @classmethod
    def _db_bottles(cls, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("v_finished_goods")
                .select("*")
                .order("updated_at", desc=True)
                .limit(limit)
            )
        )
        records = []
        for row in rows:
            encapsulation_code = row.get("encapsulation_code") or row.get("njp_code")
            records.append(
                {
                    "id": str(row["id"]),
                    "assemblyId": str(row["assembly_id"]) if row.get("assembly_id") else None,
                    "category": "bottle",
                    "brandId": row.get("brand_id"),
                    "brandIds": [str(row.get("brand_id"))] if row.get("brand_id") else [],
                    "brandName": row.get("brand_name"),
                    "productId": row.get("product_id"),
                    "productName": row.get("product_name"),
                    "productCode": row.get("product_code"),
                    "name": row.get("product_name"),
                    "batchCode": row.get("batch_code"),
                    "assemblyCode": row.get("assembly_code"),
                    "encapsulationCode": encapsulation_code,
                    "capsuleCode": encapsulation_code,
                    "mixingCode": row.get("mixing_code"),
                    "location": row.get("location"),
                    "boxNo": row.get("box_number"),
                    "bottleTotal": int(db.as_float(row.get("available_bottles"))),
                    "bottleTotalMade": int(db.as_float(row.get("total_bottles"))),
                    "bottleQuantity": int(db.as_float(row.get("total_bottles_made"))),
                    "totalBottlesMade": int(db.as_float(row.get("total_bottles_made"))),
                    "availableBottleQuantity": int(db.as_float(row.get("available_bottles"))),
                    "capsulesPerBottle": int(db.as_float(row.get("capsules_per_bottle"))),
                    "totalUnitsUsed": db.as_float(row.get("capsules_received_qty")),
                    "availableUnitsQty": db.as_float(row.get("remaining_capsules_qty")),
                    "filledBottleWeight": (
                        db.as_float(row.get("filled_bottle_weight"))
                        if row.get("filled_bottle_weight") not in (None, "")
                        else None
                    ),
                    "weightUnit": row.get("weight_unit"),
                    "expiryDate": row.get("expiry_date"),
                    "productionDate": row.get("production_date"),
                    "status": row.get("status"),
                    "comments": row.get("comments"),
                    "createdAt": db.timestamp_ms(row.get("created_at")),
                    "updatedAt": db.timestamp_ms(row.get("updated_at")),
                    "created_at": row.get("created_at"),
                    "updated_at": row.get("updated_at"),
                }
            )
        return records

    # ------------------------------------------------------------------
    # Point-in-time ("as of end of month") reconstruction.
    #
    # The live _db_powders/_db_capsules/_db_bottles methods above read the
    # v_mixing_reports/v_encapsulation_reports/v_finished_goods views, which
    # sum today's inventory_balances only - there's no history in them. For
    # a past month we instead read the raw tables directly and compute each
    # row's quantity from the inventory_movements ledger as of the cutoff,
    # via db.get_inventory_quantity_as_of. Every mixing/encapsulation/
    # assembly-brand-lot owns exactly one dedicated output lot, so this is
    # always a single-lot lookup, never a sum across lots.
    # ------------------------------------------------------------------

    @staticmethod
    def _by_id(table: str, columns: str, ids: set[Any]) -> dict[str, dict[str, Any]]:
        clean_ids = {str(item) for item in ids if item}
        if not clean_ids:
            return {}
        rows = db.data(
            db.execute(
                db.client().table(table).select(columns).in_("id", list(clean_ids))
            )
        )
        return {str(row["id"]): row for row in rows}

    @classmethod
    def _products_by_id(cls, ids: set[Any]) -> dict[str, dict[str, Any]]:
        return cls._by_id("products", "id, product_name, product_code, npn", ids)

    @classmethod
    def _mixings_by_id(cls, ids: set[Any]) -> dict[str, dict[str, Any]]:
        return cls._by_id("mixings", "id, mixing_code, product_id", ids)

    @classmethod
    def _encapsulations_by_id(cls, ids: set[Any]) -> dict[str, dict[str, Any]]:
        return cls._by_id("encapsulations", "id, encapsulation_code, mixing_id", ids)

    @classmethod
    def _assemblies_by_id(cls, ids: set[Any]) -> dict[str, dict[str, Any]]:
        return cls._by_id("assemblies", "id, assembly_code, encapsulation_id", ids)

    @classmethod
    def _db_powders_as_of(cls, cutoff: datetime, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("mixings")
                .select(
                    "id, mixing_code, product_id, output_inventory_item_id, "
                    "output_inventory_lot_id, created_at, updated_at"
                )
                .lt("created_at", cutoff.isoformat())
                .order("created_at", desc=True)
                .limit(limit)
            )
        )
        products = cls._products_by_id({row.get("product_id") for row in rows})

        records = []
        for row in rows:
            product = products.get(str(row.get("product_id")), {})
            item_id = row.get("output_inventory_item_id")
            qty = (
                db.get_inventory_quantity_as_of(
                    inventory_item_id=str(item_id),
                    inventory_lot_id=(
                        str(row["output_inventory_lot_id"])
                        if row.get("output_inventory_lot_id")
                        else None
                    ),
                    as_of=cutoff,
                )
                if item_id
                else Decimal("0")
            )
            records.append(
                {
                    "id": str(row["id"]),
                    "category": "powder",
                    "productId": row.get("product_id"),
                    "productName": product.get("product_name"),
                    "productCode": product.get("product_code") or product.get("npn"),
                    "name": product.get("product_name"),
                    "batchCode": row.get("mixing_code"),
                    "mixingCode": row.get("mixing_code"),
                    "powderNo": row.get("mixing_code"),
                    "weightKg": db.as_float(qty),
                    "createdAt": db.timestamp_ms(row.get("created_at")),
                    "updatedAt": db.timestamp_ms(row.get("updated_at")),
                    "created_at": row.get("created_at"),
                    "updated_at": row.get("updated_at"),
                }
            )
        return records

    @classmethod
    def _db_capsules_as_of(cls, cutoff: datetime, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("encapsulations")
                .select(
                    "id, encapsulation_code, mixing_id, output_capsule_inventory_item_id, "
                    "output_capsule_lot_id, created_at, updated_at"
                )
                .lt("created_at", cutoff.isoformat())
                .order("created_at", desc=True)
                .limit(limit)
            )
        )
        mixings = cls._mixings_by_id({row.get("mixing_id") for row in rows})
        products = cls._products_by_id({m.get("product_id") for m in mixings.values()})

        records = []
        for row in rows:
            mixing = mixings.get(str(row.get("mixing_id")), {})
            product = products.get(str(mixing.get("product_id")), {})
            item_id = row.get("output_capsule_inventory_item_id")
            qty = (
                db.get_inventory_quantity_as_of(
                    inventory_item_id=str(item_id),
                    inventory_lot_id=(
                        str(row["output_capsule_lot_id"])
                        if row.get("output_capsule_lot_id")
                        else None
                    ),
                    as_of=cutoff,
                )
                if item_id
                else Decimal("0")
            )
            encapsulation_code = row.get("encapsulation_code")
            records.append(
                {
                    "id": str(row["id"]),
                    "category": "capsule",
                    "productId": mixing.get("product_id"),
                    "productName": product.get("product_name"),
                    "productCode": product.get("product_code") or product.get("npn"),
                    "name": product.get("product_name"),
                    "batchCode": encapsulation_code,
                    "mixingCode": mixing.get("mixing_code"),
                    "encapsulationCode": encapsulation_code,
                    "capsuleCode": encapsulation_code,
                    "availableCapsulesQty": int(db.as_float(qty)),
                    "capsuleAmount": int(db.as_float(qty)),
                    "createdAt": db.timestamp_ms(row.get("created_at")),
                    "updatedAt": db.timestamp_ms(row.get("updated_at")),
                    "created_at": row.get("created_at"),
                    "updated_at": row.get("updated_at"),
                }
            )
        return records

    @classmethod
    def _db_bottles_as_of(cls, cutoff: datetime, *, limit: int) -> list[dict[str, Any]]:
        rows = db.data(
            db.execute(
                db.client()
                .table("assembly_brand_lots")
                .select(
                    "id, assembly_id, batch_code, finished_good_inventory_item_id, "
                    "finished_good_lot_id, created_at"
                )
                .lt("created_at", cutoff.isoformat())
                .order("created_at", desc=True)
                .limit(limit)
            )
        )
        assemblies = cls._assemblies_by_id({row.get("assembly_id") for row in rows})
        encapsulations = cls._encapsulations_by_id(
            {a.get("encapsulation_id") for a in assemblies.values()}
        )
        mixings = cls._mixings_by_id({e.get("mixing_id") for e in encapsulations.values()})
        products = cls._products_by_id({m.get("product_id") for m in mixings.values()})

        records = []
        for row in rows:
            assembly = assemblies.get(str(row.get("assembly_id")), {})
            encapsulation = encapsulations.get(str(assembly.get("encapsulation_id")), {})
            mixing = mixings.get(str(encapsulation.get("mixing_id")), {})
            product = products.get(str(mixing.get("product_id")), {})
            item_id = row.get("finished_good_inventory_item_id")
            qty = (
                db.get_inventory_quantity_as_of(
                    inventory_item_id=str(item_id),
                    inventory_lot_id=(
                        str(row["finished_good_lot_id"])
                        if row.get("finished_good_lot_id")
                        else None
                    ),
                    as_of=cutoff,
                )
                if item_id
                else Decimal("0")
            )
            records.append(
                {
                    "id": str(row["id"]),
                    "assemblyId": str(assembly["id"]) if assembly.get("id") else None,
                    "category": "bottle",
                    "productId": mixing.get("product_id"),
                    "productName": product.get("product_name"),
                    "productCode": product.get("product_code") or product.get("npn"),
                    "name": product.get("product_name"),
                    "batchCode": row.get("batch_code"),
                    "assemblyCode": assembly.get("assembly_code"),
                    "encapsulationCode": encapsulation.get("encapsulation_code"),
                    "capsuleCode": encapsulation.get("encapsulation_code"),
                    "mixingCode": mixing.get("mixing_code"),
                    "availableBottleQuantity": int(db.as_float(qty)),
                    "bottleTotal": int(db.as_float(qty)),
                    "createdAt": db.timestamp_ms(row.get("created_at")),
                    "updatedAt": db.timestamp_ms(row.get("created_at")),
                    "created_at": row.get("created_at"),
                    "updated_at": row.get("created_at"),
                }
            )
        return records

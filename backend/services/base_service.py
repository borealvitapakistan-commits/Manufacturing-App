from typing import Any

from django.conf import settings

from .converters import payload_to_db, row_to_app, rows_to_app
from .local_supabase import LocalSupabaseClient
from .supabase_client import SupabaseConfigurationError, get_supabase


class ServiceError(RuntimeError):
    def __init__(self, message: str, status_code: int = 500, details: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.details = details


def translate_error(error: Exception) -> ServiceError:
    message = str(error)
    if isinstance(error, SupabaseConfigurationError):
        return ServiceError(message, 503)
    lowered = message.lower()
    if "duplicate key" in lowered or "unique constraint" in lowered:
        return ServiceError(message, 409)
    if "not found" in lowered or "0 rows" in lowered:
        return ServiceError(message, 404)
    if "violates" in lowered or "invalid input" in lowered or "insufficient" in lowered:
        return ServiceError(message, 400)
    return ServiceError(message, 502)


class TableService:
    table_name = ""
    _local_client: LocalSupabaseClient | None = None

    @classmethod
    def client(cls):
        if settings.LOCAL_DATA_MODE:
            if TableService._local_client is None:
                TableService._local_client = LocalSupabaseClient()
            return TableService._local_client
        return get_supabase()

    @classmethod
    def list(
        cls,
        *,
        filters: dict[str, Any] | None = None,
        search: tuple[str, str] | None = None,
        order_by: str = "created_at",
        descending: bool = True,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        try:
            query = cls.client().table(cls.table_name).select("*")
            for key, value in (filters or {}).items():
                if value is not None and value != "":
                    query = query.eq(key, value)
            if search and search[1]:
                query = query.ilike(search[0], f"%{search[1]}%")
            if order_by:
                query = query.order(order_by, desc=descending)
            response = query.limit(max(1, min(limit, 500))).execute()
            return rows_to_app(response.data)
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def get(cls, item_id: str) -> dict[str, Any]:
        try:
            response = (
                cls.client().table(cls.table_name).select("*").eq("id", item_id).maybe_single().execute()
            )
            data = getattr(response, "data", None)
            if not data:
                raise ServiceError(f"{cls.table_name} record not found", 404)
            return row_to_app(data) or {}
        except ServiceError:
            raise
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def create(cls, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            response = cls.client().table(cls.table_name).insert(payload_to_db(payload)).execute()
            if not response.data:
                raise ServiceError(f"Failed to create {cls.table_name} record", 502)
            return row_to_app(response.data[0]) or {}
        except ServiceError:
            raise
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def update(cls, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            db_payload = payload_to_db(payload, drop={"id", "createdAt", "updatedAt"})
            response = cls.client().table(cls.table_name).update(db_payload).eq("id", item_id).execute()
            if not response.data:
                raise ServiceError(f"{cls.table_name} record not found", 404)
            return row_to_app(response.data[0]) or {}
        except ServiceError:
            raise
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def delete(cls, item_id: str) -> None:
        try:
            cls.get(item_id)
            cls.client().table(cls.table_name).delete().eq("id", item_id).execute()
        except ServiceError:
            raise
        except Exception as error:
            raise translate_error(error) from error

    @classmethod
    def count(cls, filters: dict[str, Any] | None = None) -> int:
        try:
            query = cls.client().table(cls.table_name).select("id", count="exact")
            for key, value in (filters or {}).items():
                query = query.eq(key, value)
            response = query.limit(1).execute()
            return int(response.count or 0)
        except Exception as error:
            raise translate_error(error) from error

from rest_framework.response import Response
from rest_framework.views import exception_handler

from services.base_service import ServiceError
from services.supabase_client import SupabaseConfigurationError


def api_exception_handler(exc, context):
    if isinstance(exc, SupabaseConfigurationError):
        return Response({"error": str(exc)}, status=503)
    if isinstance(exc, ServiceError):
        body = {"error": str(exc)}
        if exc.details is not None:
            body["details"] = exc.details
        return Response(body, status=exc.status_code)

    response = exception_handler(exc, context)
    if response is None:
        return Response({"error": str(exc) or "Unexpected server error"}, status=500)

    if isinstance(response.data, dict) and "detail" in response.data:
        response.data = {"error": response.data["detail"]}
    elif response.status_code == 400:
        response.data = {"error": "Validation failed", "details": response.data}
    return response

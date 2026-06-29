from datetime import UTC, datetime

from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from services.supabase_client import (
    credential_mode,
    get_supabase,
    is_supabase_configured,
)


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        configured = is_supabase_configured()
        connected = False
        error_message = None

        if configured:
            try:
                get_supabase().table("brands").select("id").limit(1).execute()
                connected = True
            except Exception as error:
                error_message = str(error)

        payload = {
            "ok": configured and connected,
            "service": "manufacturing-django-api",
            "database": "supabase",
            "supabaseConfigured": configured,
            "supabaseConnected": connected,
            "supabaseCredentialMode": credential_mode(),
            "time": datetime.now(UTC).isoformat(),
        }
        if error_message:
            payload["error"] = error_message
        return Response(payload, status=200 if payload["ok"] else 503)

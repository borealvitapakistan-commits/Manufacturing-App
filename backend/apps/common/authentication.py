from types import SimpleNamespace

from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from services.supabase_client import get_supabase


class SupabaseBearerAuthentication(BaseAuthentication):
    """Optionally validate a Supabase access token for the Django API."""

    def authenticate(self, request):
        if not settings.SUPABASE_REQUIRE_AUTH:
            return (SimpleNamespace(is_authenticated=True, id="development"), None)

        header = get_authorization_header(request).split()
        if len(header) != 2 or header[0].lower() != b"bearer":
            raise AuthenticationFailed("A Supabase bearer token is required.")

        token = header[1].decode("utf-8")
        try:
            response = get_supabase().auth.get_user(token)
            user = response.user
        except Exception as error:
            raise AuthenticationFailed("Invalid or expired Supabase token.") from error

        if not user:
            raise AuthenticationFailed("Invalid or expired Supabase token.")
        authenticated_user = SimpleNamespace(
            is_authenticated=True,
            id=str(user.id),
            email=getattr(user, "email", None),
            supabase_user=user,
        )
        return (authenticated_user, token)

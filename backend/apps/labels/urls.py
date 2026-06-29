from django.urls import path

from .views import LabelDetailView, LabelListCreateView, LabelValidationView


urlpatterns = [
    path("", LabelListCreateView.as_view(), name="label-list-create"),
    path("validate/", LabelValidationView.as_view(), name="label-validate"),
    path("<uuid:item_id>/", LabelDetailView.as_view(), name="label-detail"),
]

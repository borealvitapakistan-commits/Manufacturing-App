from django.urls import path

from .views import (
    CloseExpenseBookView,
    ExpenseBookBalanceView,
    ExpenseBookDetailView,
    ExpenseBookListCreateView,
    ExpenseDetailView,
    ExpenseListCreateView,
    PullCarryView,
    ReopenExpenseBookView,
)


urlpatterns = [
    path("expense-books/", ExpenseBookListCreateView.as_view(), name="expense-book-list-create"),
    path("expense-books/<uuid:item_id>/", ExpenseBookDetailView.as_view(), name="expense-book-detail"),
    path("expense-books/<uuid:item_id>/close/", CloseExpenseBookView.as_view(), name="expense-book-close"),
    path("expense-books/<uuid:item_id>/reopen/", ReopenExpenseBookView.as_view(), name="expense-book-reopen"),
    path("expense-books/<uuid:item_id>/balance/", ExpenseBookBalanceView.as_view(), name="expense-book-balance"),
    path("expense-books/<uuid:item_id>/pull-carry/", PullCarryView.as_view(), name="expense-book-pull-carry"),
    path("expenses/", ExpenseListCreateView.as_view(), name="expense-list-create"),
    path("expenses/<uuid:item_id>/", ExpenseDetailView.as_view(), name="expense-detail"),
]

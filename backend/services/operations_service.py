"""Backward-compatible imports for the split domain service modules."""

from .finance_service import ExpenseBookService, ExpenseService
from .hr_service import (
    EmployeeLoanService,
    EmployeeService,
    SalarySheetService,
    TimeEntryService,
    WorkEntryService,
)
from .inventory_service import FinishedGoodsHistoryService, FinishedGoodsService
from .procurement_service import (
    PODocumentItemService,
    PODocumentService,
    PurchaseOrderService,
    VendorService,
)

__all__ = [
    "EmployeeLoanService",
    "EmployeeService",
    "ExpenseBookService",
    "ExpenseService",
    "FinishedGoodsHistoryService",
    "FinishedGoodsService",
    "PODocumentItemService",
    "PODocumentService",
    "PurchaseOrderService",
    "SalarySheetService",
    "TimeEntryService",
    "VendorService",
    "WorkEntryService",
]

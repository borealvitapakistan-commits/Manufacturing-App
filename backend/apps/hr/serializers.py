from decimal import Decimal

from rest_framework import serializers

from apps.common.serializers import NullableUUIDField


class EmployeeSerializer(serializers.Serializer):
    fullName = serializers.CharField()
    phone = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    brandIds = serializers.ListField(child=serializers.UUIDField(), required=False, default=list)
    primaryBrandId = NullableUUIDField(required=False, allow_null=True)
    roleTitle = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    isActive = serializers.BooleanField(required=False, default=True)
    payType = serializers.ChoiceField(
        choices=["monthly", "hourly", "perTask"],
        required=False,
        default="monthly",
    )
    baseSalaryMonthly = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    hourlyRate = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    perTaskRate = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    currency = serializers.CharField(required=False, default="PKR")
    joinDate = serializers.IntegerField(required=False, allow_null=True)
    endDate = serializers.IntegerField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class TimeEntrySerializer(serializers.Serializer):
    employeeId = serializers.UUIDField()
    date = serializers.IntegerField()
    status = serializers.ChoiceField(
        choices=["present", "leave", "absent"],
        required=False,
        default="absent",
    )
    timeIn = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    timeOut = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    hoursWorked = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    leaveType = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class WorkEntrySerializer(serializers.Serializer):
    employeeId = serializers.UUIDField()
    brandId = NullableUUIDField(required=False, allow_null=True)
    date = serializers.IntegerField()
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    hours = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    quantity = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    unit = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    batchCode = serializers.CharField(required=False, allow_blank=True, allow_null=True)



class SalarySheetSerializer(serializers.Serializer):
    employeeId = serializers.UUIDField()
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    totalDaysPresent = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=0)
    totalDaysLeave = serializers.DecimalField(max_digits=5, decimal_places=1, min_value=0)
    totalHoursWorked = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=0)
    totalTasks = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    baseSalary = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    overtimePay = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    bonus = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    totalLoanDeduction = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    otherDeductions = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    netPayable = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    currency = serializers.CharField(required=False, default="PKR")
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    locked = serializers.BooleanField(required=False, default=False)


class GenerateSalarySerializer(serializers.Serializer):
    employeeId = serializers.UUIDField()
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    otherDeductions = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    loanDeduction = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    overtimePay = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    bonus = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=0, required=False, default=0
    )
    notes = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    locked = serializers.BooleanField(required=False, default=False)


class EmployeeLoanSerializer(serializers.Serializer):
    employeeId = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    date = serializers.IntegerField(required=False, allow_null=True)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    salarySheetId = NullableUUIDField(required=False, allow_null=True)


class LoanWithExpenseSerializer(serializers.Serializer):
    employeeId = serializers.UUIDField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    note = serializers.CharField(required=False, allow_blank=True)
    bookId = serializers.UUIDField()
    givenFrom = serializers.CharField()

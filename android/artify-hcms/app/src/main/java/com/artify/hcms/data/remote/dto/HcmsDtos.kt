package com.artify.hcms.data.remote.dto

import com.google.gson.annotations.SerializedName

// --- Authentication DTOs ---
data class LoginRequest(
    @SerializedName("username") val username: String,
    @SerializedName("password") val password: String
)

data class LoginResponse(
    @SerializedName("token") val token: String,
    @SerializedName("user") val user: UserDto
)

data class UserDto(
    @SerializedName("id") val id: String,
    @SerializedName("username") val username: String,
    @SerializedName("role") val role: String,
    @SerializedName("employeeId") val employeeId: String?,
    @SerializedName("companyScope") val companyScope: String?
)

// --- Employee DTOs ---
data class EmployeeDto(
    @SerializedName("id") val id: String,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("name") val name: String,
    @SerializedName("company") val company: String?,
    @SerializedName("department") val department: String?,
    @SerializedName("designation") val designation: String?,
    @SerializedName("nationality") val nationality: String?,
    @SerializedName("wageType") val wageType: String?,
    @SerializedName("basicSalary") val basicSalary: Double?,
    @SerializedName("hourlyRate") val hourlyRate: Double?,
    @SerializedName("civilId") val civilId: String?,
    @SerializedName("civilIdExpiry") val civilIdExpiry: String?,
    @SerializedName("visaExpiry") val visaExpiry: String?,
    @SerializedName("passportExpiry") val passportExpiry: String?,
    @SerializedName("joiningDate") val joiningDate: String?,
    @SerializedName("status") val status: String?,
    @SerializedName("assignedProject") val assignedProject: String?,
    @SerializedName("phone") val phone: String?,
    @SerializedName("email") val email: String?,
    @SerializedName("accountNumber") val accountNumber: String?,
    @SerializedName("bankName") val bankName: String?,
    @SerializedName("iban") val iban: String?
)

// --- Mobile Attendance Punch DTOs ---
data class PunchRequest(
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("type") val type: String, // "CHECK_IN" or "CHECK_OUT"
    @SerializedName("latitude") val latitude: Double?,
    @SerializedName("longitude") val longitude: Double?,
    @SerializedName("accuracyMeters") val accuracyMeters: Double? = null,
    @SerializedName("worksiteId") val worksiteId: String? = null,
    @SerializedName("notes") val notes: String? = null,
    @SerializedName("timestamp") val timestamp: String? = null
)

data class PunchResponse(
    @SerializedName("id") val id: String,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("type") val type: String,
    @SerializedName("timestamp") val timestamp: String,
    @SerializedName("isGeofenceException") val isGeofenceException: Boolean,
    @SerializedName("exceptionReason") val exceptionReason: String?,
    @SerializedName("workedHours") val workedHours: Double?,
    @SerializedName("syncedToAttendance") val syncedToAttendance: Boolean?
)

data class TodayPunchStatusDto(
    @SerializedName("hasCheckedIn") val hasCheckedIn: Boolean,
    @SerializedName("hasCheckedOut") val hasCheckedOut: Boolean,
    @SerializedName("checkInTime") val checkInTime: String?,
    @SerializedName("checkOutTime") val checkOutTime: String?,
    @SerializedName("todayHours") val todayHours: Double?,
    @SerializedName("monthHours") val monthHours: Double?,
    @SerializedName("overtimeHours") val overtimeHours: Double?,
    @SerializedName("punches") val punches: List<PunchResponse>?
)

// --- Leave Management DTOs ---
data class LeaveBalanceDto(
    @SerializedName("annualEntitlement") val annualEntitlement: Double,
    @SerializedName("takenDays") val takenDays: Double,
    @SerializedName("pendingDays") val pendingDays: Double,
    @SerializedName("remainingDays") val remainingDays: Double,
    @SerializedName("sickLeaveBalance") val sickLeaveBalance: Double?
)

data class LeaveRequestDto(
    @SerializedName("id") val id: String?,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("leaveType") val leaveType: String,
    @SerializedName("startDate") val startDate: String,
    @SerializedName("endDate") val endDate: String,
    @SerializedName("days") val days: Double,
    @SerializedName("reason") val reason: String,
    @SerializedName("status") val status: String?, // "PENDING", "APPROVED", "REJECTED", "CANCELLED"
    @SerializedName("createdAt") val createdAt: String?,
    @SerializedName("approvedBy") val approvedBy: String?
)

// --- Timesheet DTOs ---
data class TimesheetEntryDto(
    @SerializedName("id") val id: String?,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("projectCode") val projectCode: String,
    @SerializedName("workDate") val workDate: String,
    @SerializedName("hours") val hours: Double,
    @SerializedName("description") val description: String,
    @SerializedName("status") val status: String?, // "SUBMITTED", "APPROVED", "REJECTED"
    @SerializedName("createdAt") val createdAt: String?
)

// --- Payroll DTOs ---
data class PayrollLineDto(
    @SerializedName("id") val id: String,
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("employeeName") val employeeName: String?,
    @SerializedName("month") val month: String,
    @SerializedName("basicSalary") val basicSalary: Double,
    @SerializedName("housingAllowance") val housingAllowance: Double?,
    @SerializedName("transportAllowance") val transportAllowance: Double?,
    @SerializedName("overtimePay") val overtimePay: Double?,
    @SerializedName("bonus") val bonus: Double?,
    @SerializedName("grossSalary") val grossSalary: Double,
    @SerializedName("loanDeduction") val loanDeduction: Double?,
    @SerializedName("otherDeductions") val otherDeductions: Double?,
    @SerializedName("netSalary") val netSalary: Double,
    @SerializedName("paymentStatus") val paymentStatus: String?, // "PAID", "PARTIAL", "UNPAID"
    @SerializedName("isFinalized") val isFinalized: Boolean?,
    @SerializedName("paymentReference") val paymentReference: String?,
    @SerializedName("paidAt") val paidAt: String?
)

// --- Financial Ledger DTOs ---
data class LedgerEntryDto(
    @SerializedName("id") val id: String,
    @SerializedName("date") val date: String,
    @SerializedName("type") val type: String, // "PAYROLL", "PAYMENT", "LOAN_DISBURSEMENT", "LOAN_RECOVERY", "ADVANCE"
    @SerializedName("description") val description: String,
    @SerializedName("debit") val debit: Double?,
    @SerializedName("credit") val credit: Double?,
    @SerializedName("balance") val balance: Double,
    @SerializedName("reference") val reference: String?
)

data class LedgerSummaryDto(
    @SerializedName("employeeId") val employeeId: String,
    @SerializedName("totalEarnings") val totalEarnings: Double,
    @SerializedName("totalPaid") val totalPaid: Double,
    @SerializedName("currentBalance") val currentBalance: Double,
    @SerializedName("activeLoanBalance") val activeLoanBalance: Double,
    @SerializedName("transactions") val transactions: List<LedgerEntryDto>
)

data class ApiResponse<T>(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: T?,
    @SerializedName("message") val message: String?
)

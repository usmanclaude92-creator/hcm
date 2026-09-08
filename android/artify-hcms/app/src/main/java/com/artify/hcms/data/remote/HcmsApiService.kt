package com.artify.hcms.data.remote

import com.artify.hcms.data.remote.dto.EmployeeDto
import com.artify.hcms.data.remote.dto.LeaveBalanceDto
import com.artify.hcms.data.remote.dto.LeaveRequestDto
import com.artify.hcms.data.remote.dto.LedgerSummaryDto
import com.artify.hcms.data.remote.dto.LoginRequest
import com.artify.hcms.data.remote.dto.LoginResponse
import com.artify.hcms.data.remote.dto.PayrollLineDto
import com.artify.hcms.data.remote.dto.PunchRequest
import com.artify.hcms.data.remote.dto.PunchResponse
import com.artify.hcms.data.remote.dto.TimesheetEntryDto
import com.artify.hcms.data.remote.dto.TodayPunchStatusDto
import com.artify.hcms.data.remote.dto.UserDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface HcmsApiService {

    // --- Authentication ---
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    @GET("api/auth/me")
    suspend fun getCurrentUser(): Response<UserDto>

    // --- Employees ---
    @GET("api/employees")
    suspend fun getEmployees(
        @Query("company") company: String? = null,
        @Query("search") search: String? = null
    ): Response<List<EmployeeDto>>

    @GET("api/employees/{id}")
    suspend fun getEmployeeById(@Path("id") id: String): Response<EmployeeDto>

    // --- Attendance & Geofence Punches ---
    @POST("api/attendance/punch")
    suspend fun submitPunch(@Body punch: PunchRequest): Response<PunchResponse>

    @GET("api/attendance/punches/today")
    suspend fun getTodayPunchStatus(@Query("employeeId") employeeId: String): Response<TodayPunchStatusDto>

    @GET("api/attendance/punches/history")
    suspend fun getPunchHistory(
        @Query("employeeId") employeeId: String,
        @Query("month") month: String? = null
    ): Response<List<PunchResponse>>

    // --- Leave Management ---
    @GET("api/leave/balances")
    suspend fun getLeaveBalances(@Query("employeeId") employeeId: String): Response<LeaveBalanceDto>

    @GET("api/leave/requests")
    suspend fun getLeaveRequests(@Query("employeeId") employeeId: String): Response<List<LeaveRequestDto>>

    @POST("api/leave/requests")
    suspend fun submitLeaveRequest(@Body request: LeaveRequestDto): Response<LeaveRequestDto>

    @POST("api/leave/requests/{id}/cancel")
    suspend fun cancelLeaveRequest(@Path("id") requestId: String): Response<Unit>

    // --- Timesheets ---
    @GET("api/timesheets")
    suspend fun getTimesheets(
        @Query("employeeId") employeeId: String,
        @Query("month") month: String? = null
    ): Response<List<TimesheetEntryDto>>

    @POST("api/timesheets")
    suspend fun submitTimesheet(@Body entry: TimesheetEntryDto): Response<TimesheetEntryDto>

    // --- Payroll & Compensation ---
    @GET("api/payroll/records")
    suspend fun getPayrollRecords(
        @Query("employeeId") employeeId: String,
        @Query("year") year: String? = null
    ): Response<List<PayrollLineDto>>

    // --- Financial Statement / Employee Ledger ---
    @GET("api/ledger")
    suspend fun getEmployeeLedger(@Query("employeeId") employeeId: String): Response<LedgerSummaryDto>
}

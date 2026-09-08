package com.artify.hcms.data.repository

import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.core.util.DateUtils
import com.artify.hcms.core.util.LocationHelper
import com.artify.hcms.data.local.AppDatabase
import com.artify.hcms.data.local.entity.CachedEmployeeEntity
import com.artify.hcms.data.local.entity.OfflinePunchEntity
import com.artify.hcms.data.remote.HcmsApiService
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AuthRepository(
    private val api: HcmsApiService,
    private val sessionManager: SessionManager
) {
    suspend fun login(username: String, password: String): NetworkResult<LoginResponse> = withContext(Dispatchers.IO) {
        try {
            val response = api.login(LoginRequest(username.trim(), password))
            if (response.isSuccessful && response.body() != null) {
                val loginData = response.body()!!
                sessionManager.saveAuthSession(
                    token = loginData.token,
                    userId = loginData.user.id,
                    username = loginData.user.username,
                    role = loginData.user.role,
                    employeeId = loginData.user.employeeId,
                    companyScope = loginData.user.companyScope
                )
                NetworkResult.Success(loginData)
            } else {
                NetworkResult.Error(response.errorBody()?.string() ?: "Login failed. Check username and password.", response.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network connection error")
        }
    }

    fun logout() {
        sessionManager.clearSession()
    }

    fun isLoggedIn(): Boolean = sessionManager.isLoggedIn()
    fun getSession(): SessionManager = sessionManager
}

class EmployeeRepository(
    private val api: HcmsApiService,
    private val database: AppDatabase
) {
    suspend fun getEmployee(employeeId: String): NetworkResult<EmployeeDto> = withContext(Dispatchers.IO) {
        try {
            val response = api.getEmployeeById(employeeId)
            if (response.isSuccessful && response.body() != null) {
                val emp = response.body()!!
                // Cache locally for offline preview
                database.cachedEmployeeDao().insertEmployee(
                    CachedEmployeeEntity(
                        employeeId = emp.employeeId,
                        name = emp.name,
                        company = emp.company,
                        department = emp.department,
                        designation = emp.designation,
                        nationality = emp.nationality,
                        wageType = emp.wageType,
                        basicSalary = emp.basicSalary,
                        civilId = emp.civilId,
                        phone = emp.phone,
                        email = emp.email
                    )
                )
                NetworkResult.Success(emp)
            } else {
                // Fallback to local cache if available
                val cached = database.cachedEmployeeDao().getEmployee(employeeId)
                if (cached != null) {
                    NetworkResult.Success(
                        EmployeeDto(
                            id = cached.employeeId,
                            employeeId = cached.employeeId,
                            name = cached.name,
                            company = cached.company,
                            department = cached.department,
                            designation = cached.designation,
                            nationality = cached.nationality,
                            wageType = cached.wageType,
                            basicSalary = cached.basicSalary,
                            hourlyRate = null,
                            civilId = cached.civilId,
                            civilIdExpiry = null,
                            visaExpiry = null,
                            passportExpiry = null,
                            joiningDate = null,
                            status = "ACTIVE",
                            assignedProject = null,
                            phone = cached.phone,
                            email = cached.email,
                            accountNumber = null,
                            bankName = null,
                            iban = null
                        )
                    )
                } else {
                    NetworkResult.Error("Employee not found", response.code())
                }
            }
        } catch (e: Exception) {
            val cached = database.cachedEmployeeDao().getEmployee(employeeId)
            if (cached != null) {
                NetworkResult.Success(
                    EmployeeDto(
                        id = cached.employeeId,
                        employeeId = cached.employeeId,
                        name = cached.name,
                        company = cached.company,
                        department = cached.department,
                        designation = cached.designation,
                        nationality = cached.nationality,
                        wageType = cached.wageType,
                        basicSalary = cached.basicSalary,
                        hourlyRate = null,
                        civilId = cached.civilId,
                        civilIdExpiry = null,
                        visaExpiry = null,
                        passportExpiry = null,
                        joiningDate = null,
                        status = "ACTIVE",
                        assignedProject = null,
                        phone = cached.phone,
                        email = cached.email,
                        accountNumber = null,
                        bankName = null,
                        iban = null
                    )
                )
            } else {
                NetworkResult.Error("Failed to load employee: ${e.localizedMessage}")
            }
        }
    }
}

class AttendanceRepository(
    private val api: HcmsApiService,
    private val database: AppDatabase
) {
    suspend fun getTodayStatus(employeeId: String): NetworkResult<TodayPunchStatusDto> = withContext(Dispatchers.IO) {
        try {
            val response = api.getTodayPunchStatus(employeeId)
            if (response.isSuccessful && response.body() != null) {
                NetworkResult.Success(response.body()!!)
            } else {
                NetworkResult.Error("Failed to fetch today status", response.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Offline: could not load attendance status")
        }
    }

    suspend fun submitPunch(
        employeeId: String,
        type: String,
        latitude: Double?,
        longitude: Double?
    ): NetworkResult<PunchResponse> = withContext(Dispatchers.IO) {
        val geofenceEval = LocationHelper.evaluateGeofence(latitude, longitude)
        val isoTime = DateUtils.getCurrentIsoTimestamp()

        val punchRequest = PunchRequest(
            employeeId = employeeId,
            type = type,
            latitude = latitude,
            longitude = longitude,
            accuracyMeters = 10.0,
            worksiteId = geofenceEval.matchedSite?.id,
            notes = if (geofenceEval.isException) geofenceEval.exceptionReason else "Within designated worksite",
            timestamp = isoTime
        )

        try {
            val response = api.submitPunch(punchRequest)
            if (response.isSuccessful && response.body() != null) {
                NetworkResult.Success(response.body()!!)
            } else {
                queueOfflinePunch(employeeId, type, latitude, longitude, isoTime, geofenceEval.isException, geofenceEval.exceptionReason)
                NetworkResult.Error(response.errorBody()?.string() ?: "Server rejected punch, queued locally", response.code())
            }
        } catch (e: Exception) {
            // Network failure: queue offline
            queueOfflinePunch(employeeId, type, latitude, longitude, isoTime, geofenceEval.isException, geofenceEval.exceptionReason)
            NetworkResult.Error("Network error: Punch queued in local offline store. It will sync once connection returns.")
        }
    }

    private suspend fun queueOfflinePunch(
        employeeId: String,
        type: String,
        lat: Double?,
        lon: Double?,
        timestamp: String,
        isException: Boolean,
        exceptionReason: String?
    ) {
        database.offlinePunchDao().insertPunch(
            OfflinePunchEntity(
                employeeId = employeeId,
                type = type,
                latitude = lat,
                longitude = lon,
                accuracyMeters = 10.0,
                worksiteId = null,
                timestamp = timestamp,
                isException = isException,
                exceptionReason = exceptionReason,
                syncStatus = "PENDING"
            )
        )
    }

    suspend fun syncPendingPunches(): Int = withContext(Dispatchers.IO) {
        val pending = database.offlinePunchDao().getPendingPunches()
        var syncedCount = 0
        for (punch in pending) {
            try {
                val req = PunchRequest(
                    employeeId = punch.employeeId,
                    type = punch.type,
                    latitude = punch.latitude,
                    longitude = punch.longitude,
                    accuracyMeters = punch.accuracyMeters,
                    worksiteId = punch.worksiteId,
                    notes = punch.exceptionReason,
                    timestamp = punch.timestamp
                )
                val response = api.submitPunch(req)
                if (response.isSuccessful) {
                    database.offlinePunchDao().deletePunch(punch.localId)
                    syncedCount++
                } else {
                    database.offlinePunchDao().updatePunch(
                        punch.copy(retryCount = punch.retryCount + 1, lastError = "Server code ${response.code()}")
                    )
                }
            } catch (e: Exception) {
                database.offlinePunchDao().updatePunch(
                    punch.copy(retryCount = punch.retryCount + 1, lastError = e.message)
                )
            }
        }
        syncedCount
    }

    suspend fun getPunchHistory(employeeId: String, month: String?): NetworkResult<List<PunchResponse>> = withContext(Dispatchers.IO) {
        try {
            val response = api.getPunchHistory(employeeId, month)
            if (response.isSuccessful && response.body() != null) {
                NetworkResult.Success(response.body()!!)
            } else {
                NetworkResult.Error("Failed to fetch punch history", response.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Failed to fetch punch history")
        }
    }
}

class LeaveRepository(private val api: HcmsApiService) {
    suspend fun getBalances(employeeId: String): NetworkResult<LeaveBalanceDto> = withContext(Dispatchers.IO) {
        try {
            val res = api.getLeaveBalances(employeeId)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error("Failed to fetch balances", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }

    suspend fun getRequests(employeeId: String): NetworkResult<List<LeaveRequestDto>> = withContext(Dispatchers.IO) {
        try {
            val res = api.getLeaveRequests(employeeId)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error("Failed to fetch leave requests", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }

    suspend fun submitRequest(request: LeaveRequestDto): NetworkResult<LeaveRequestDto> = withContext(Dispatchers.IO) {
        try {
            val res = api.submitLeaveRequest(request)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error(res.errorBody()?.string() ?: "Leave request failed", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }

    suspend fun cancelRequest(requestId: String): NetworkResult<Unit> = withContext(Dispatchers.IO) {
        try {
            val res = api.cancelLeaveRequest(requestId)
            if (res.isSuccessful) {
                NetworkResult.Success(Unit)
            } else {
                NetworkResult.Error("Could not cancel request", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }
}

class TimesheetRepository(private val api: HcmsApiService) {
    suspend fun getTimesheets(employeeId: String, month: String?): NetworkResult<List<TimesheetEntryDto>> = withContext(Dispatchers.IO) {
        try {
            val res = api.getTimesheets(employeeId, month)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error("Failed to fetch timesheets", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }

    suspend fun submitTimesheet(entry: TimesheetEntryDto): NetworkResult<TimesheetEntryDto> = withContext(Dispatchers.IO) {
        try {
            val res = api.submitTimesheet(entry)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error(res.errorBody()?.string() ?: "Submission failed", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }
}

class PayrollRepository(private val api: HcmsApiService) {
    suspend fun getPayrollRecords(employeeId: String, year: String?): NetworkResult<List<PayrollLineDto>> = withContext(Dispatchers.IO) {
        try {
            val res = api.getPayrollRecords(employeeId, year)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error("Failed to fetch payroll", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }

    suspend fun getLedger(employeeId: String): NetworkResult<LedgerSummaryDto> = withContext(Dispatchers.IO) {
        try {
            val res = api.getEmployeeLedger(employeeId)
            if (res.isSuccessful && res.body() != null) {
                NetworkResult.Success(res.body()!!)
            } else {
                NetworkResult.Error("Failed to load employee ledger", res.code())
            }
        } catch (e: Exception) {
            NetworkResult.Error(e.localizedMessage ?: "Network error")
        }
    }
}

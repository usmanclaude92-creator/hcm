package com.artify.hcms.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.data.remote.dto.EmployeeDto
import com.artify.hcms.data.remote.dto.LeaveBalanceDto
import com.artify.hcms.data.remote.dto.TodayPunchStatusDto
import com.artify.hcms.data.repository.AttendanceRepository
import com.artify.hcms.data.repository.EmployeeRepository
import com.artify.hcms.data.repository.LeaveRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val isLoading: Boolean = false,
    val employee: EmployeeDto? = null,
    val todayAttendance: TodayPunchStatusDto? = null,
    val leaveBalance: LeaveBalanceDto? = null,
    val isPunching: Boolean = false,
    val punchSuccessMessage: String? = null,
    val errorMessage: String? = null
)

class DashboardViewModel(
    private val sessionManager: SessionManager,
    private val employeeRepository: EmployeeRepository,
    private val attendanceRepository: AttendanceRepository,
    private val leaveRepository: LeaveRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboardData()
    }

    fun loadDashboardData() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            // 1. Fetch Employee Profile
            when (val empResult = employeeRepository.getEmployee(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(employee = empResult.data)
                }
                is NetworkResult.Error -> {
                    // Non-fatal if session has basic user details
                }
                is NetworkResult.Loading -> Unit
            }

            // 2. Fetch Today Attendance & Punches
            when (val attResult = attendanceRepository.getTodayStatus(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(todayAttendance = attResult.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            // 3. Fetch Leave Balances
            when (val leaveResult = leaveRepository.getBalances(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(leaveBalance = leaveResult.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun performQuickPunch(latitude: Double?, longitude: Double?) {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        val nextType = if (_uiState.value.todayAttendance?.hasCheckedIn == true && _uiState.value.todayAttendance?.hasCheckedOut != true) {
            "CHECK_OUT"
        } else {
            "CHECK_IN"
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isPunching = true, punchSuccessMessage = null, errorMessage = null)
            when (val result = attendanceRepository.submitPunch(empId, nextType, latitude, longitude)) {
                is NetworkResult.Success -> {
                    val statusText = if (result.data.isGeofenceException) {
                        "${nextType.replace('_', ' ')} recorded (Geofence exception noted: ${result.data.exceptionReason})"
                    } else {
                        "${nextType.replace('_', ' ')} verified within site boundary!"
                    }
                    _uiState.value = _uiState.value.copy(
                        isPunching = false,
                        punchSuccessMessage = statusText
                    )
                    loadDashboardData()
                }
                is NetworkResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isPunching = false,
                        errorMessage = result.message
                    )
                }
                is NetworkResult.Loading -> Unit
            }
        }
    }

    fun clearMessages() {
        _uiState.value = _uiState.value.copy(punchSuccessMessage = null, errorMessage = null)
    }
}

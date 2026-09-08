package com.artify.hcms.presentation.attendance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.core.util.DateUtils
import com.artify.hcms.core.util.GeofenceResult
import com.artify.hcms.core.util.LocationHelper
import com.artify.hcms.data.remote.dto.PunchResponse
import com.artify.hcms.data.remote.dto.TodayPunchStatusDto
import com.artify.hcms.data.repository.AttendanceRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AttendanceUiState(
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val todayStatus: TodayPunchStatusDto? = null,
    val history: List<PunchResponse> = emptyList(),
    val currentLat: Double? = 23.5880, // Default Muscat coordinates
    val currentLon: Double? = 58.3829,
    val geofenceStatus: GeofenceResult? = null,
    val syncedCount: Int? = null,
    val feedbackMessage: String? = null,
    val errorMessage: String? = null
)

class AttendanceViewModel(
    private val sessionManager: SessionManager,
    private val attendanceRepository: AttendanceRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(AttendanceUiState())
    val uiState: StateFlow<AttendanceUiState> = _uiState.asStateFlow()

    init {
        updateLocation(23.5880, 58.3829)
        loadAttendanceData()
    }

    fun updateLocation(lat: Double?, lon: Double?) {
        val eval = LocationHelper.evaluateGeofence(lat, lon)
        _uiState.value = _uiState.value.copy(
            currentLat = lat,
            currentLon = lon,
            geofenceStatus = eval
        )
    }

    fun loadAttendanceData() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            // Today's status
            when (val res = attendanceRepository.getTodayStatus(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(todayStatus = res.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            // History
            val currentMonth = DateUtils.getCurrentMonthString()
            when (val histRes = attendanceRepository.getPunchHistory(empId, currentMonth)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(history = histRes.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun submitPunch(type: String) {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSubmitting = true, feedbackMessage = null, errorMessage = null)
            val lat = _uiState.value.currentLat
            val lon = _uiState.value.currentLon

            when (val res = attendanceRepository.submitPunch(empId, type, lat, lon)) {
                is NetworkResult.Success -> {
                    val msg = if (res.data.isGeofenceException) {
                        "${type.replace('_', ' ')} recorded with geofence exception: ${res.data.exceptionReason}"
                    } else {
                        "${type.replace('_', ' ')} successfully recorded within site perimeter!"
                    }
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        feedbackMessage = msg
                    )
                    loadAttendanceData()
                }
                is NetworkResult.Error -> {
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        errorMessage = res.message
                    )
                }
                is NetworkResult.Loading -> Unit
            }
        }
    }

    fun syncOfflinePunches() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val count = attendanceRepository.syncPendingPunches()
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                syncedCount = count,
                feedbackMessage = if (count > 0) "Successfully synced $count pending offline punches to server!" else "No pending offline punches."
            )
            loadAttendanceData()
        }
    }

    fun clearFeedback() {
        _uiState.value = _uiState.value.copy(feedbackMessage = null, errorMessage = null)
    }
}

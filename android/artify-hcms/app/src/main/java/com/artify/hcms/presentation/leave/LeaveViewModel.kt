package com.artify.hcms.presentation.leave

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.core.util.DateUtils
import com.artify.hcms.data.remote.dto.LeaveBalanceDto
import com.artify.hcms.data.remote.dto.LeaveRequestDto
import com.artify.hcms.data.repository.LeaveRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LeaveUiState(
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val balances: LeaveBalanceDto? = null,
    val requests: List<LeaveRequestDto> = emptyList(),
    val showApplyDialog: Boolean = false,
    val selectedType: String = "Annual Leave",
    val startDate: String = DateUtils.getTodayDateString(),
    val endDate: String = DateUtils.getTodayDateString(),
    val days: Double = 1.0,
    val reason: String = "",
    val feedbackMessage: String? = null,
    val errorMessage: String? = null
)

class LeaveViewModel(
    private val sessionManager: SessionManager,
    private val leaveRepository: LeaveRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LeaveUiState())
    val uiState: StateFlow<LeaveUiState> = _uiState.asStateFlow()

    init {
        loadLeaveData()
    }

    fun loadLeaveData() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            // Balances
            when (val bRes = leaveRepository.getBalances(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(balances = bRes.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            // Requests
            when (val rRes = leaveRepository.getRequests(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(requests = rRes.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun setShowApplyDialog(show: Boolean) {
        _uiState.value = _uiState.value.copy(showApplyDialog = show)
    }

    fun onTypeChange(type: String) { _uiState.value = _uiState.value.copy(selectedType = type) }
    fun onStartDateChange(date: String) { _uiState.value = _uiState.value.copy(startDate = date) }
    fun onEndDateChange(date: String) { _uiState.value = _uiState.value.copy(endDate = date) }
    fun onDaysChange(d: Double) { _uiState.value = _uiState.value.copy(days = d) }
    fun onReasonChange(r: String) { _uiState.value = _uiState.value.copy(reason = r) }

    fun submitLeave() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        if (_uiState.value.reason.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please provide a reason for the leave request")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSubmitting = true, feedbackMessage = null, errorMessage = null)
            val request = LeaveRequestDto(
                id = null,
                employeeId = empId,
                leaveType = _uiState.value.selectedType,
                startDate = _uiState.value.startDate,
                endDate = _uiState.value.endDate,
                days = _uiState.value.days,
                reason = _uiState.value.reason,
                status = "PENDING",
                createdAt = DateUtils.getCurrentIsoTimestamp(),
                approvedBy = null
            )

            when (val res = leaveRepository.submitRequest(request)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        showApplyDialog = false,
                        reason = "",
                        feedbackMessage = "Leave request submitted to HR for review"
                    )
                    loadLeaveData()
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

    fun cancelLeave(requestId: String) {
        viewModelScope.launch {
            when (leaveRepository.cancelRequest(requestId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(feedbackMessage = "Leave request cancelled successfully")
                    loadLeaveData()
                }
                is NetworkResult.Error -> {
                    _uiState.value = _uiState.value.copy(errorMessage = "Could not cancel request")
                }
                is NetworkResult.Loading -> Unit
            }
        }
    }

    fun clearMessages() {
        _uiState.value = _uiState.value.copy(feedbackMessage = null, errorMessage = null)
    }
}

package com.artify.hcms.presentation.timesheet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.core.util.DateUtils
import com.artify.hcms.data.remote.dto.TimesheetEntryDto
import com.artify.hcms.data.repository.TimesheetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TimesheetUiState(
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val entries: List<TimesheetEntryDto> = emptyList(),
    val showAddDialog: Boolean = false,
    val projectCode: String = "PRJ-MUSCAT-HQ",
    val workDate: String = DateUtils.getTodayDateString(),
    val hours: Double = 8.0,
    val description: String = "",
    val feedbackMessage: String? = null,
    val errorMessage: String? = null
)

class TimesheetViewModel(
    private val sessionManager: SessionManager,
    private val timesheetRepository: TimesheetRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TimesheetUiState())
    val uiState: StateFlow<TimesheetUiState> = _uiState.asStateFlow()

    init {
        loadTimesheets()
    }

    fun loadTimesheets() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val currentMonth = DateUtils.getCurrentMonthString()
            when (val res = timesheetRepository.getTimesheets(empId, currentMonth)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(entries = res.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }
            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun setShowAddDialog(show: Boolean) {
        _uiState.value = _uiState.value.copy(showAddDialog = show)
    }

    fun onProjectChange(code: String) { _uiState.value = _uiState.value.copy(projectCode = code) }
    fun onDateChange(date: String) { _uiState.value = _uiState.value.copy(workDate = date) }
    fun onHoursChange(h: Double) { _uiState.value = _uiState.value.copy(hours = h) }
    fun onDescriptionChange(d: String) { _uiState.value = _uiState.value.copy(description = d) }

    fun submitTimesheet() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        if (_uiState.value.description.isBlank()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter task description")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSubmitting = true, feedbackMessage = null, errorMessage = null)
            val entry = TimesheetEntryDto(
                id = null,
                employeeId = empId,
                projectCode = _uiState.value.projectCode,
                workDate = _uiState.value.workDate,
                hours = _uiState.value.hours,
                description = _uiState.value.description,
                status = "SUBMITTED",
                createdAt = DateUtils.getCurrentIsoTimestamp()
            )

            when (val res = timesheetRepository.submitTimesheet(entry)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(
                        isSubmitting = false,
                        showAddDialog = false,
                        description = "",
                        feedbackMessage = "Timesheet logged for ${_uiState.value.projectCode}"
                    )
                    loadTimesheets()
                }
                is NetworkResult.Error -> {
                    _uiState.value = _uiState.value.copy(isSubmitting = false, errorMessage = res.message)
                }
                is NetworkResult.Loading -> Unit
            }
        }
    }

    fun clearMessages() {
        _uiState.value = _uiState.value.copy(feedbackMessage = null, errorMessage = null)
    }
}

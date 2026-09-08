package com.artify.hcms.presentation.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.data.remote.dto.EmployeeDto
import com.artify.hcms.data.repository.EmployeeRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProfileUiState(
    val isLoading: Boolean = false,
    val employee: EmployeeDto? = null,
    val errorMessage: String? = null
)

class ProfileViewModel(
    private val sessionManager: SessionManager,
    private val employeeRepository: EmployeeRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    fun loadProfile() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val res = employeeRepository.getEmployee(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(employee = res.data)
                }
                is NetworkResult.Error -> {
                    _uiState.value = _uiState.value.copy(errorMessage = res.message)
                }
                is NetworkResult.Loading -> Unit
            }
            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun getSessionManager(): SessionManager = sessionManager
}

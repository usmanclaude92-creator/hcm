package com.artify.hcms.presentation.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.ApiClient
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LoginUiState(
    val username: String = "",
    val password: String = "",
    val customServerUrl: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isSuccess: Boolean = false,
    val showServerConfigDialog: Boolean = false
)

class LoginViewModel(private val authRepository: AuthRepository) : ViewModel() {

    private val _uiState = MutableStateFlow(
        LoginUiState(
            customServerUrl = authRepository.getSession().getCustomBaseUrl() ?: ""
        )
    )
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onUsernameChange(value: String) {
        _uiState.value = _uiState.value.copy(username = value, errorMessage = null)
    }

    fun onPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(password = value, errorMessage = null)
    }

    fun onServerUrlChange(value: String) {
        _uiState.value = _uiState.value.copy(customServerUrl = value)
    }

    fun setShowServerConfigDialog(show: Boolean) {
        _uiState.value = _uiState.value.copy(showServerConfigDialog = show)
    }

    fun saveServerUrl() {
        val url = _uiState.value.customServerUrl.trim()
        authRepository.getSession().setCustomBaseUrl(if (url.isEmpty()) null else url)
        ApiClient.invalidate()
        _uiState.value = _uiState.value.copy(showServerConfigDialog = false)
    }

    fun login() {
        val username = _uiState.value.username.trim()
        val password = _uiState.value.password

        if (username.isEmpty() || password.isEmpty()) {
            _uiState.value = _uiState.value.copy(errorMessage = "Please enter username and password")
            return
        }

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            when (val result = authRepository.login(username, password)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, isSuccess = true)
                }
                is NetworkResult.Error -> {
                    _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = result.message)
                }
                is NetworkResult.Loading -> Unit
            }
        }
    }
}

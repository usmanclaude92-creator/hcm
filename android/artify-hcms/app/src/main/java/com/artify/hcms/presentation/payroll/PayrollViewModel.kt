package com.artify.hcms.presentation.payroll

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.artify.hcms.core.network.NetworkResult
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.data.remote.dto.LedgerSummaryDto
import com.artify.hcms.data.remote.dto.PayrollLineDto
import com.artify.hcms.data.repository.PayrollRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PayrollUiState(
    val isLoading: Boolean = false,
    val payrollRecords: List<PayrollLineDto> = emptyList(),
    val ledgerSummary: LedgerSummaryDto? = null,
    val selectedYear: String = "2026",
    val errorMessage: String? = null
)

class PayrollViewModel(
    private val sessionManager: SessionManager,
    private val payrollRepository: PayrollRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PayrollUiState())
    val uiState: StateFlow<PayrollUiState> = _uiState.asStateFlow()

    init {
        loadPayrollAndLedger()
    }

    fun loadPayrollAndLedger() {
        val empId = sessionManager.getEmployeeId() ?: sessionManager.getUsername() ?: "EMP001"
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)

            // 1. Fetch Payroll Records
            when (val pRes = payrollRepository.getPayrollRecords(empId, _uiState.value.selectedYear)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(payrollRecords = pRes.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            // 2. Fetch Financial Ledger
            when (val lRes = payrollRepository.getLedger(empId)) {
                is NetworkResult.Success -> {
                    _uiState.value = _uiState.value.copy(ledgerSummary = lRes.data)
                }
                is NetworkResult.Error -> Unit
                is NetworkResult.Loading -> Unit
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }
}

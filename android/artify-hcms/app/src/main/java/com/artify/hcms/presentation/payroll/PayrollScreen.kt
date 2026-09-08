package com.artify.hcms.presentation.payroll

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artify.hcms.core.util.CurrencyUtils
import com.artify.hcms.data.remote.dto.PayrollLineDto
import com.artify.hcms.presentation.theme.AmberWarm
import com.artify.hcms.presentation.theme.EmeraldSuccess
import com.artify.hcms.presentation.theme.NavyPrimary
import com.artify.hcms.presentation.theme.RoseDanger
import com.artify.hcms.presentation.theme.Slate100
import com.artify.hcms.presentation.theme.Slate200
import com.artify.hcms.presentation.theme.Slate400
import com.artify.hcms.presentation.theme.Slate600
import com.artify.hcms.presentation.theme.Slate800
import com.artify.hcms.presentation.theme.Slate900
import com.artify.hcms.presentation.theme.TealAccent

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PayrollScreen(
    viewModel: PayrollViewModel,
    onNavigateToLedger: () -> Unit,
    onNavigateBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Payroll & Payslips", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadPayrollAndLedger() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = NavyPrimary,
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = Slate100
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Ledger Banner Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = NavyPrimary)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = "Current Ledger Balance",
                                    color = Slate400,
                                    fontSize = 12.sp
                                )
                                Text(
                                    text = CurrencyUtils.formatOMR(state.ledgerSummary?.currentBalance ?: 0.0),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 24.sp
                                )
                            }
                            Button(
                                onClick = onNavigateToLedger,
                                colors = ButtonDefaults.buttonColors(containerColor = TealAccent),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.testTag("view_ledger_button")
                            ) {
                                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Full Ledger", fontSize = 12.sp)
                            }
                        }

                        if ((state.ledgerSummary?.activeLoanBalance ?: 0.0) > 0.0) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "Active Loan Principal: ${CurrencyUtils.formatOMR(state.ledgerSummary?.activeLoanBalance)}",
                                color = AmberWarm,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }

            item {
                Text(
                    text = "Finalized WPS Payslips",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = Slate900,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }

            if (state.payrollRecords.isEmpty()) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White)
                    ) {
                        Box(
                            modifier = Modifier.fillMaxWidth().padding(32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "No finalized payslips available for the selected period.",
                                color = Slate400,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            } else {
                items(state.payrollRecords) { record ->
                    PayslipCard(record)
                }
            }
        }
    }
}

@Composable
fun PayslipCard(record: PayrollLineDto) {
    val isPaid = record.paymentStatus == "PAID"
    val statusColor = if (isPaid) EmeraldSuccess else AmberWarm

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header: Month & Payment Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Payroll: ${record.month}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Slate900
                    )
                    Text(
                        text = if (record.isFinalized == true) "CBO WPS Finalized SIF" else "Draft Calculation",
                        fontSize = 11.sp,
                        color = Slate600
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(12.dp))
                        .background(statusColor.copy(alpha = 0.12f))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Icon(
                        imageVector = if (isPaid) Icons.Default.CheckCircle else Icons.Default.HourglassEmpty,
                        contentDescription = null,
                        tint = statusColor,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = record.paymentStatus ?: "PENDING",
                        color = statusColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            }

            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), color = Slate200)

            // Earnings Breakdown
            SalaryRow(label = "Basic Salary", amount = CurrencyUtils.formatOMR(record.basicSalary))
            record.housingAllowance?.let { if (it > 0) SalaryRow(label = "Housing Allowance", amount = CurrencyUtils.formatOMR(it)) }
            record.transportAllowance?.let { if (it > 0) SalaryRow(label = "Transport Allowance", amount = CurrencyUtils.formatOMR(it)) }
            record.overtimePay?.let { if (it > 0) SalaryRow(label = "Overtime Earnings", amount = CurrencyUtils.formatOMR(it)) }
            record.bonus?.let { if (it > 0) SalaryRow(label = "Performance Bonus", amount = CurrencyUtils.formatOMR(it)) }

            SalaryRow(label = "Gross Earnings", amount = CurrencyUtils.formatOMR(record.grossSalary), isBold = true)

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Slate200)

            // Deductions
            record.loanDeduction?.let { if (it > 0) SalaryRow(label = "Loan Recovery", amount = "- ${CurrencyUtils.formatOMR(it)}", color = RoseDanger) }
            record.otherDeductions?.let { if (it > 0) SalaryRow(label = "Other Deductions", amount = "- ${CurrencyUtils.formatOMR(it)}", color = RoseDanger) }

            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Slate200)

            // Net Payable
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Net Take-Home Salary",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Slate900
                )
                Text(
                    text = CurrencyUtils.formatOMR(record.netSalary),
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    color = EmeraldSuccess
                )
            }

            if (!record.paymentReference.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "Ref: ${record.paymentReference} • Paid on: ${record.paidAt ?: "Completed"}",
                    fontSize = 11.sp,
                    color = Slate400
                )
            }
        }
    }
}

@Composable
fun SalaryRow(
    label: String,
    amount: String,
    isBold: Boolean = false,
    color: Color = Slate900
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 12.sp, color = if (isBold) Slate900 else Slate600, fontWeight = if (isBold) FontWeight.SemiBold else FontWeight.Normal)
        Text(text = amount, fontSize = 12.sp, color = color, fontWeight = if (isBold) FontWeight.Bold else FontWeight.Medium)
    }
}

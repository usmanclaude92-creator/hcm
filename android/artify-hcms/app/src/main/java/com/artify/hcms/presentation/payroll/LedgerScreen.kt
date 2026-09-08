package com.artify.hcms.presentation.payroll

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artify.hcms.core.util.CurrencyUtils
import com.artify.hcms.data.remote.dto.LedgerEntryDto
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LedgerScreen(
    viewModel: PayrollViewModel,
    onNavigateBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val ledger = state.ledgerSummary

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Employee Financial Statement", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
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
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Balance Summary Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = NavyPrimary)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Text("Current Balance (Receivable / Payable)", color = Slate400, fontSize = 12.sp)
                        Text(
                            text = CurrencyUtils.formatOMR(ledger?.currentBalance ?: 0.0),
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 24.sp
                        )

                        Spacer(modifier = Modifier.height(14.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text("Total Earned", color = Slate400, fontSize = 11.sp)
                                Text(
                                    text = CurrencyUtils.formatOMR(ledger?.totalEarnings ?: 0.0),
                                    color = Color.White,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp
                                )
                            }
                            Column {
                                Text("Total Disbursed", color = Slate400, fontSize = 11.sp)
                                Text(
                                    text = CurrencyUtils.formatOMR(ledger?.totalPaid ?: 0.0),
                                    color = EmeraldSuccess,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp
                                )
                            }
                            Column {
                                Text("Active Loan", color = Slate400, fontSize = 11.sp)
                                Text(
                                    text = CurrencyUtils.formatOMR(ledger?.activeLoanBalance ?: 0.0),
                                    color = AmberWarm,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }
                }
            }

            item {
                Text(
                    text = "Chronological Transactions",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = Slate900,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }

            val txs = ledger?.transactions ?: emptyList()
            if (txs.isEmpty()) {
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
                                text = "No financial ledger entries recorded yet.",
                                color = Slate400,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            } else {
                items(txs) { entry ->
                    LedgerEntryCard(entry)
                }
            }
        }
    }
}

@Composable
fun LedgerEntryCard(entry: LedgerEntryDto) {
    val isCredit = (entry.credit ?: 0.0) > 0.0
    val amountColor = if (isCredit) EmeraldSuccess else NavyPrimary

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = entry.description,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Slate900
                )
                Text(
                    text = if (isCredit) "+ ${CurrencyUtils.formatOMR(entry.credit)}" else "- ${CurrencyUtils.formatOMR(entry.debit)}",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = amountColor
                )
            }

            Spacer(modifier = Modifier.height(4.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "${entry.date} • ${entry.type}", fontSize = 11.sp, color = Slate600)
                Text(
                    text = "Bal: ${CurrencyUtils.formatOMR(entry.balance)}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Slate800
                )
            }

            if (!entry.reference.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(text = "Ref: ${entry.reference}", fontSize = 10.sp, color = Slate400)
            }
        }
    }
}

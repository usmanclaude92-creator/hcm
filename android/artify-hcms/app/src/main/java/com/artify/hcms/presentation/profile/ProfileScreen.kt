package com.artify.hcms.presentation.profile

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Badge
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Phone
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
fun ProfileScreen(
    viewModel: ProfileViewModel,
    onLogout: () -> Unit,
    onNavigateBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val emp = state.employee

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Employee Profile", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Profile Card Header
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .clip(CircleShape)
                            .background(TealAccent),
                        contentAlignment = Alignment.Center
                    ) {
                        val initials = emp?.name?.take(2)?.uppercase() ?: "HC"
                        Text(text = initials, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 24.sp)
                    }

                    Spacer(modifier = Modifier.height(12.dp))
                    Text(text = emp?.name ?: "Employee", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Slate900)
                    Text(text = "${emp?.employeeId ?: "EMP001"} • ${emp?.designation ?: "Staff"}", fontSize = 13.sp, color = Slate600)

                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(NavyPrimary.copy(alpha = 0.08f))
                            .padding(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "${emp?.company ?: "Oman Ops"} • ${emp?.wageType ?: "Fixed Monthly"}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = NavyPrimary
                        )
                    }
                }
            }

            // Employment Details Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Employment Master Data", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Slate900)
                    Spacer(modifier = Modifier.height(10.dp))

                    ProfileRow(label = "Department", value = emp?.department ?: "--")
                    ProfileRow(label = "Nationality", value = emp?.nationality ?: "--")
                    ProfileRow(label = "Basic Wage", value = CurrencyUtils.formatOMR(emp?.basicSalary))
                    ProfileRow(label = "Joining Date", value = emp?.joiningDate ?: "--")
                    ProfileRow(label = "Assigned Site", value = emp?.assignedProject ?: "Artify Muscat HQ")
                }
            }

            // Compliance & Legal Documents Card (Oman Labour Law)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Document & Banking Verification", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Slate900)
                    Spacer(modifier = Modifier.height(10.dp))

                    val maskedCivilId = emp?.civilId?.let { if (it.length > 4) "••••••${it.takeLast(4)}" else it } ?: "••••1234"
                    ProfileRow(label = "Oman Civil ID", value = maskedCivilId)
                    ProfileRow(label = "Civil ID Expiry", value = emp?.civilIdExpiry ?: "Valid")
                    ProfileRow(label = "Visa Expiry", value = emp?.visaExpiry ?: "Valid")
                    ProfileRow(label = "Bank Name", value = emp?.bankName ?: "Bank Muscat")
                    ProfileRow(label = "Account / IBAN", value = emp?.iban ?: (emp?.accountNumber ?: "••••5678"))
                }
            }

            // Sign Out Button
            Button(
                onClick = onLogout,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("profile_logout_button"),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = RoseDanger)
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = null, tint = Color.White)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sign Out", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Color.White)
            }
        }
    }
}

@Composable
fun ProfileRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, fontSize = 12.sp, color = Slate600)
        Text(text = value, fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Slate900)
    }
}

package com.artify.hcms.presentation.dashboard

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.artify.hcms.core.util.DateUtils
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

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    onNavigateToAttendance: () -> Unit,
    onNavigateToLeave: () -> Unit,
    onNavigateToTimesheet: () -> Unit,
    onNavigateToPayroll: () -> Unit,
    onNavigateToLedger: () -> Unit,
    onNavigateToProfile: () -> Unit,
    onLogout: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.punchSuccessMessage) {
        state.punchSuccessMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearMessages()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(Slate100)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
        ) {
            // Header Bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(NavyPrimary)
                    .padding(horizontal = 20.dp, vertical = 20.dp)
            ) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.clickable { onNavigateToProfile() }
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(46.dp)
                                    .clip(CircleShape)
                                    .background(TealAccent),
                                contentAlignment = Alignment.Center
                            ) {
                                val initials = state.employee?.name?.take(2)?.uppercase() ?: "HC"
                                Text(
                                    text = initials,
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = state.employee?.name ?: "Employee",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                                Text(
                                    text = "${state.employee?.employeeId ?: "ID"} • ${state.employee?.designation ?: "Staff"}",
                                    color = Slate400,
                                    fontSize = 12.sp
                                )
                            }
                        }

                        Row {
                            IconButton(onClick = { viewModel.loadDashboardData() }) {
                                Icon(
                                    imageVector = Icons.Default.Refresh,
                                    contentDescription = "Refresh Data",
                                    tint = Slate400
                                )
                            }
                            IconButton(
                                onClick = onLogout,
                                modifier = Modifier.testTag("logout_button")
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                                    contentDescription = "Sign Out",
                                    tint = Slate400
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Slate800)
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Company: ${state.employee?.company ?: "Oman Operations"} | Department: ${state.employee?.department ?: "Operations"}",
                            color = Slate200,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Quick Punch Status Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
                    .padding(top = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Today's Attendance",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = Slate900
                            )
                            Text(
                                text = DateUtils.getTodayDateString(),
                                fontSize = 12.sp,
                                color = Slate600
                            )
                        }

                        val isCheckedIn = state.todayAttendance?.hasCheckedIn == true
                        val isCheckedOut = state.todayAttendance?.hasCheckedOut == true

                        val statusBadgeColor = when {
                            isCheckedOut -> EmeraldSuccess
                            isCheckedIn -> AmberWarm
                            else -> Slate400
                        }

                        val statusText = when {
                            isCheckedOut -> "Completed"
                            isCheckedIn -> "Checked In"
                            else -> "Not Checked In"
                        }

                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(statusBadgeColor.copy(alpha = 0.15f))
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(statusBadgeColor)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = statusText,
                                color = statusBadgeColor,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text("Check-In", fontSize = 11.sp, color = Slate400)
                            Text(
                                text = DateUtils.formatTime(state.todayAttendance?.checkInTime),
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Slate800
                            )
                        }
                        Column {
                            Text("Check-Out", fontSize = 11.sp, color = Slate400)
                            Text(
                                text = DateUtils.formatTime(state.todayAttendance?.checkOutTime),
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Slate800
                            )
                        }
                        Column {
                            Text("Hours", fontSize = 11.sp, color = Slate400)
                            Text(
                                text = String.format("%.1f hrs", state.todayAttendance?.todayHours ?: 0.0),
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Slate800
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Punch In / Out Button
                    val nextActionLabel = if (state.todayAttendance?.hasCheckedIn == true && state.todayAttendance?.hasCheckedOut != true) {
                        "Punch Out"
                    } else {
                        "Punch In"
                    }

                    Button(
                        onClick = { viewModel.performQuickPunch(23.5880, 58.3829) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .testTag("quick_punch_button"),
                        enabled = !state.isPunching,
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (nextActionLabel == "Punch Out") RoseDanger else TealAccent
                        )
                    ) {
                        if (state.isPunching) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = nextActionLabel,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 15.sp,
                                color = Color.White
                            )
                        }
                    }
                }
            }

            // Overview Metric Cards
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Month Hours Card
                Card(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onNavigateToAttendance() },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Icon(
                            imageVector = Icons.Default.AccessTime,
                            contentDescription = "Hours",
                            tint = NavyPrimary,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = String.format("%.1f", state.todayAttendance?.monthHours ?: 0.0),
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            color = Slate900
                        )
                        Text(
                            text = "Month Hours",
                            fontSize = 11.sp,
                            color = Slate600
                        )
                    }
                }

                // Leave Balance Card
                Card(
                    modifier = Modifier
                        .weight(1f)
                        .clickable { onNavigateToLeave() },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Icon(
                            imageVector = Icons.Default.DateRange,
                            contentDescription = "Leave",
                            tint = AmberWarm,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = String.format("%.0f Days", state.leaveBalance?.remainingDays ?: 30.0),
                            fontWeight = FontWeight.Bold,
                            fontSize = 20.sp,
                            color = Slate900
                        )
                        Text(
                            text = "Annual Leave Left",
                            fontSize = 11.sp,
                            color = Slate600
                        )
                    }
                }
            }

            // Module Navigation Cards
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = "Enterprise Modules",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = Slate900,
                modifier = Modifier.padding(horizontal = 18.dp)
            )
            Spacer(modifier = Modifier.height(10.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                QuickNavRow(
                    title = "Attendance & Geofence Log",
                    subtitle = "Punch history, worksite compliance & exceptions",
                    icon = Icons.Default.AccessTime,
                    iconTint = TealAccent,
                    onClick = onNavigateToAttendance
                )

                QuickNavRow(
                    title = "Leave Management",
                    subtitle = "Request vacation, sick leave & view approval status",
                    icon = Icons.Default.DateRange,
                    iconTint = AmberWarm,
                    onClick = onNavigateToLeave
                )

                QuickNavRow(
                    title = "Project Timesheets",
                    subtitle = "Log daily work hours against allocated projects",
                    icon = Icons.Default.Assignment,
                    iconTint = NavyPrimary,
                    onClick = onNavigateToTimesheet
                )

                QuickNavRow(
                    title = "Payroll & Digital Payslips",
                    subtitle = "Monthly WPS salaries, allowances & deductions",
                    icon = Icons.Default.Payments,
                    iconTint = EmeraldSuccess,
                    onClick = onNavigateToPayroll
                )

                QuickNavRow(
                    title = "Employee Financial Statement",
                    subtitle = "Real-time ledger with loan recoveries & balance",
                    icon = Icons.Default.AccountBalanceWallet,
                    iconTint = NavyPrimary,
                    onClick = onNavigateToLedger
                )
            }

            Spacer(modifier = Modifier.height(30.dp))
        }

        SnackbarHost(
            hostState = snackbarHostState,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp)
        )
    }
}

@Composable
fun QuickNavRow(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(iconTint.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(imageVector = icon, contentDescription = title, tint = iconTint, modifier = Modifier.size(22.dp))
            }
            Spacer(modifier = Modifier.width(14.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(text = title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Slate900)
                Text(text = subtitle, fontSize = 11.sp, color = Slate600)
            }
        }
    }
}

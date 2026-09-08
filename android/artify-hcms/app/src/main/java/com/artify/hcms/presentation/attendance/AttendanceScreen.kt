package com.artify.hcms.presentation.attendance

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(
    viewModel: AttendanceViewModel,
    onNavigateBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.feedbackMessage) {
        state.feedbackMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearFeedback()
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearFeedback()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mobile Attendance & Geofence", fontWeight = FontWeight.Bold, fontSize = 18.sp) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.syncOfflinePunches() }) {
                        Icon(Icons.Default.Sync, contentDescription = "Sync Pending Punches", tint = Color.White)
                    }
                    IconButton(onClick = { viewModel.loadAttendanceData() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = Color.White)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = NavyPrimary,
                    titleContentColor = Color.White
                )
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = Slate100
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Geofence Evaluation Banner
            item {
                val geofence = state.geofenceStatus
                val isException = geofence?.isException ?: false
                val bannerBg = if (isException) AmberWarm.copy(alpha = 0.12f) else EmeraldSuccess.copy(alpha = 0.12f)
                val bannerTint = if (isException) AmberWarm else EmeraldSuccess

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = bannerBg)
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = if (isException) Icons.Default.Warning else Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = bannerTint,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = if (isException) "Geofence Compliance Notice" else "Designated Site Boundary",
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Slate900
                            )
                            Text(
                                text = if (isException) {
                                    geofence?.exceptionReason ?: "Outside verified perimeter (Attendance will be recorded and flagged for manager review)"
                                } else {
                                    "Verified inside ${geofence?.matchedSite?.name ?: "Artify Muscat Works"}"
                                },
                                fontSize = 12.sp,
                                color = Slate800
                            )
                        }
                    }
                }
            }

            // Punch Action Card
            item {
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
                        Text(
                            text = "Record Daily Work Session",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = Slate900
                        )
                        Text(
                            text = "Non-blocking GPS verification as per Oman Labour regulations",
                            fontSize = 12.sp,
                            color = Slate600,
                            modifier = Modifier.padding(top = 4.dp, bottom = 18.dp)
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            Button(
                                onClick = { viewModel.submitPunch("CHECK_IN") },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp)
                                    .testTag("check_in_button"),
                                shape = RoundedCornerShape(10.dp),
                                enabled = !state.isSubmitting,
                                colors = ButtonDefaults.buttonColors(containerColor = TealAccent)
                            ) {
                                if (state.isSubmitting) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                                } else {
                                    Text("Punch In", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                }
                            }

                            Button(
                                onClick = { viewModel.submitPunch("CHECK_OUT") },
                                modifier = Modifier
                                    .weight(1f)
                                    .height(48.dp)
                                    .testTag("check_out_button"),
                                shape = RoundedCornerShape(10.dp),
                                enabled = !state.isSubmitting,
                                colors = ButtonDefaults.buttonColors(containerColor = RoseDanger)
                            ) {
                                if (state.isSubmitting) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                                } else {
                                    Text("Punch Out", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Slate400, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "Coordinates: ${String.format("%.4f", state.currentLat ?: 0.0)}, ${String.format("%.4f", state.currentLon ?: 0.0)}",
                                fontSize = 11.sp,
                                color = Slate400
                            )
                        }
                    }
                }
            }

            // Punch History Section
            item {
                Text(
                    text = "Punch History Log",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = Slate900,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }

            if (state.history.isEmpty()) {
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
                                text = "No attendance punch records yet for this period.",
                                color = Slate400,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            } else {
                items(state.history) { punch ->
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            val isCheckIn = punch.type == "CHECK_IN"
                            val iconTint = if (isCheckIn) TealAccent else RoseDanger

                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .background(iconTint.copy(alpha = 0.12f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (isCheckIn) "IN" else "OUT",
                                    color = iconTint,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp
                                )
                            }
                            Spacer(modifier = Modifier.width(14.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = if (isCheckIn) "Check-In" else "Check-Out",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp,
                                        color = Slate900
                                    )
                                    Text(
                                        text = DateUtils.formatTime(punch.timestamp),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Slate800
                                    )
                                }
                                Text(
                                    text = DateUtils.formatDate(punch.timestamp),
                                    fontSize = 11.sp,
                                    color = Slate600
                                )
                                if (punch.isGeofenceException) {
                                    Text(
                                        text = "⚠️ Exception: ${punch.exceptionReason ?: "Out of worksite perimeter"}",
                                        fontSize = 11.sp,
                                        color = AmberWarm,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

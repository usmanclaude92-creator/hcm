package com.artify.hcms.presentation.navigation

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.artify.hcms.ArtifyHcmsApp
import com.artify.hcms.presentation.attendance.AttendanceScreen
import com.artify.hcms.presentation.attendance.AttendanceViewModel
import com.artify.hcms.presentation.dashboard.DashboardScreen
import com.artify.hcms.presentation.dashboard.DashboardViewModel
import com.artify.hcms.presentation.leave.LeaveScreen
import com.artify.hcms.presentation.leave.LeaveViewModel
import com.artify.hcms.presentation.login.LoginScreen
import com.artify.hcms.presentation.login.LoginViewModel
import com.artify.hcms.presentation.payroll.LedgerScreen
import com.artify.hcms.presentation.payroll.PayrollScreen
import com.artify.hcms.presentation.payroll.PayrollViewModel
import com.artify.hcms.presentation.profile.ProfileScreen
import com.artify.hcms.presentation.profile.ProfileViewModel
import com.artify.hcms.presentation.theme.NavyPrimary
import com.artify.hcms.presentation.theme.Slate400
import com.artify.hcms.presentation.theme.Slate600
import com.artify.hcms.presentation.theme.Slate900
import com.artify.hcms.presentation.theme.TealAccent

@Composable
fun MainAppNavigation() {
    val context = LocalContext.current
    val app = context.applicationContext as ArtifyHcmsApp

    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val isLoggedIn = remember { app.authRepository.isLoggedIn() }
    val startDestination = if (isLoggedIn) Screen.Dashboard.route else Screen.Login.route

    val showBottomBar = currentRoute in Screen.bottomNavItems.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(
                    containerColor = Color.White,
                    tonalElevation = 8.dp
                ) {
                    Screen.bottomNavItems.forEach { screen ->
                        val selected = currentRoute == screen.route
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                if (currentRoute != screen.route) {
                                    navController.navigate(screen.route) {
                                        popUpTo(navController.graph.findStartDestination().id) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            },
                            icon = {
                                screen.icon?.let {
                                    Icon(
                                        imageVector = it,
                                        contentDescription = screen.title
                                    )
                                }
                            },
                            label = {
                                Text(
                                    text = screen.title,
                                    fontSize = 10.sp
                                )
                            },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = TealAccent,
                                selectedTextColor = NavyPrimary,
                                indicatorColor = TealAccent.copy(alpha = 0.15f),
                                unselectedIconColor = Slate400,
                                unselectedTextColor = Slate600
                            )
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // 1. Login
            composable(Screen.Login.route) {
                val loginViewModel = remember {
                    LoginViewModel(app.authRepository)
                }
                LoginScreen(
                    viewModel = loginViewModel,
                    onLoginSuccess = {
                        navController.navigate(Screen.Dashboard.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    }
                )
            }

            // 2. Dashboard
            composable(Screen.Dashboard.route) {
                val dashboardViewModel = remember {
                    DashboardViewModel(
                        sessionManager = app.sessionManager,
                        employeeRepository = app.employeeRepository,
                        attendanceRepository = app.attendanceRepository,
                        leaveRepository = app.leaveRepository
                    )
                }
                DashboardScreen(
                    viewModel = dashboardViewModel,
                    onNavigateToAttendance = { navController.navigate(Screen.Attendance.route) },
                    onNavigateToLeave = { navController.navigate(Screen.Leave.route) },
                    onNavigateToTimesheet = { navController.navigate(Screen.Timesheet.route) },
                    onNavigateToPayroll = { navController.navigate(Screen.Payroll.route) },
                    onNavigateToLedger = { navController.navigate(Screen.Ledger.route) },
                    onNavigateToProfile = { navController.navigate(Screen.Profile.route) },
                    onLogout = {
                        app.authRepository.logout()
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            // 3. Attendance
            composable(Screen.Attendance.route) {
                val attendanceViewModel = remember {
                    AttendanceViewModel(app.sessionManager, app.attendanceRepository)
                }
                AttendanceScreen(
                    viewModel = attendanceViewModel,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // 4. Leave
            composable(Screen.Leave.route) {
                val leaveViewModel = remember {
                    LeaveViewModel(app.sessionManager, app.leaveRepository)
                }
                LeaveScreen(
                    viewModel = leaveViewModel,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // 5. Timesheet
            composable(Screen.Timesheet.route) {
                val timesheetViewModel = remember {
                    TimesheetViewModel(app.sessionManager, app.timesheetRepository)
                }
                TimesheetScreen(
                    viewModel = timesheetViewModel,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // 6. Payroll
            composable(Screen.Payroll.route) {
                val payrollViewModel = remember {
                    PayrollViewModel(app.sessionManager, app.payrollRepository)
                }
                PayrollScreen(
                    viewModel = payrollViewModel,
                    onNavigateToLedger = { navController.navigate(Screen.Ledger.route) },
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // 7. Ledger
            composable(Screen.Ledger.route) {
                val payrollViewModel = remember {
                    PayrollViewModel(app.sessionManager, app.payrollRepository)
                }
                LedgerScreen(
                    viewModel = payrollViewModel,
                    onNavigateBack = { navController.popBackStack() }
                )
            }

            // 8. Profile
            composable(Screen.Profile.route) {
                val profileViewModel = remember {
                    ProfileViewModel(app.sessionManager, app.employeeRepository)
                }
                ProfileScreen(
                    viewModel = profileViewModel,
                    onLogout = {
                        app.authRepository.logout()
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    },
                    onNavigateBack = { navController.popBackStack() }
                )
            }
        }
    }
}

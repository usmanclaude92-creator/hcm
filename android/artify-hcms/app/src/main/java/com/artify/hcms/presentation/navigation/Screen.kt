package com.artify.hcms.presentation.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Person
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String, val title: String, val icon: ImageVector? = null) {
    data object Login : Screen("login", "Login")
    data object Dashboard : Screen("dashboard", "Dashboard", Icons.Default.Home)
    data object Attendance : Screen("attendance", "Attendance", Icons.Default.AccessTime)
    data object Leave : Screen("leave", "Leave", Icons.Default.DateRange)
    data object Timesheet : Screen("timesheet", "Timesheet", Icons.Default.Assignment)
    data object Payroll : Screen("payroll", "Payroll", Icons.Default.Payments)
    data object Ledger : Screen("ledger", "Ledger", Icons.Default.AccountBalanceWallet)
    data object Profile : Screen("profile", "Profile", Icons.Default.Person)

    companion object {
        val bottomNavItems = listOf(
            Dashboard,
            Attendance,
            Leave,
            Timesheet,
            Payroll
        )
    }
}

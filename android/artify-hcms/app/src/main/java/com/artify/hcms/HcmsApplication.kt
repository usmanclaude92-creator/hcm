package com.artify.hcms

import android.app.Application
import com.artify.hcms.core.network.ApiClient
import com.artify.hcms.core.storage.SessionManager
import com.artify.hcms.data.local.AppDatabase
import com.artify.hcms.data.remote.HcmsApiService
import com.artify.hcms.data.repository.AttendanceRepository
import com.artify.hcms.data.repository.AuthRepository
import com.artify.hcms.data.repository.EmployeeRepository
import com.artify.hcms.data.repository.LeaveRepository
import com.artify.hcms.data.repository.PayrollRepository
import com.artify.hcms.data.repository.TimesheetRepository

class ArtifyHcmsApp : Application() {

    lateinit var sessionManager: SessionManager
        private set
    lateinit var database: AppDatabase
        private set
    lateinit var apiService: HcmsApiService
        private set

    lateinit var authRepository: AuthRepository
        private set
    lateinit var employeeRepository: EmployeeRepository
        private set
    lateinit var attendanceRepository: AttendanceRepository
        private set
    lateinit var leaveRepository: LeaveRepository
        private set
    lateinit var timesheetRepository: TimesheetRepository
        private set
    lateinit var payrollRepository: PayrollRepository
        private set

    override fun onCreate() {
        super.onCreate()
        sessionManager = SessionManager(this)
        database = AppDatabase.getDatabase(this)
        apiService = ApiClient.getApiService(sessionManager)

        authRepository = AuthRepository(apiService, sessionManager)
        employeeRepository = EmployeeRepository(apiService, database)
        attendanceRepository = AttendanceRepository(apiService, database)
        leaveRepository = LeaveRepository(apiService)
        timesheetRepository = TimesheetRepository(apiService)
        payrollRepository = PayrollRepository(apiService)
    }
}

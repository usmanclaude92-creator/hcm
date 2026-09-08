package com.artify.hcms.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "offline_punches")
data class OfflinePunchEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val employeeId: String,
    val type: String, // "CHECK_IN" or "CHECK_OUT"
    val latitude: Double?,
    val longitude: Double?,
    val accuracyMeters: Double?,
    val worksiteId: String?,
    val timestamp: String,
    val isException: Boolean,
    val exceptionReason: String?,
    val syncStatus: String = "PENDING", // PENDING, SYNCING, FAILED
    val retryCount: Int = 0,
    val lastError: String? = null
)

@Entity(tableName = "offline_leaves")
data class OfflineLeaveEntity(
    @PrimaryKey(autoGenerate = true) val localId: Long = 0,
    val employeeId: String,
    val leaveType: String,
    val startDate: String,
    val endDate: String,
    val days: Double,
    val reason: String,
    val createdAt: String,
    val syncStatus: String = "PENDING",
    val retryCount: Int = 0
)

@Entity(tableName = "cached_employees")
data class CachedEmployeeEntity(
    @PrimaryKey val employeeId: String,
    val name: String,
    val company: String?,
    val department: String?,
    val designation: String?,
    val nationality: String?,
    val wageType: String?,
    val basicSalary: Double?,
    val civilId: String?,
    val phone: String?,
    val email: String?,
    val lastUpdated: Long = System.currentTimeMillis()
)

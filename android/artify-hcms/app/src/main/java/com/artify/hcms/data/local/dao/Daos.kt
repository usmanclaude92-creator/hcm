package com.artify.hcms.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.artify.hcms.data.local.entity.CachedEmployeeEntity
import com.artify.hcms.data.local.entity.OfflineLeaveEntity
import com.artify.hcms.data.local.entity.OfflinePunchEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface OfflinePunchDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPunch(punch: OfflinePunchEntity): Long

    @Query("SELECT * FROM offline_punches WHERE syncStatus = 'PENDING' ORDER BY localId ASC")
    suspend fun getPendingPunches(): List<OfflinePunchEntity>

    @Query("SELECT * FROM offline_punches WHERE employeeId = :employeeId ORDER BY localId DESC")
    fun getPunchesForEmployee(employeeId: String): Flow<List<OfflinePunchEntity>>

    @Update
    suspend fun updatePunch(punch: OfflinePunchEntity)

    @Query("DELETE FROM offline_punches WHERE localId = :localId")
    suspend fun deletePunch(localId: Long)

    @Query("DELETE FROM offline_punches WHERE syncStatus = 'CONFIRMED'")
    suspend fun clearSyncedPunches()
}

@Dao
interface OfflineLeaveDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLeave(leave: OfflineLeaveEntity): Long

    @Query("SELECT * FROM offline_leaves WHERE syncStatus = 'PENDING' ORDER BY localId ASC")
    suspend fun getPendingLeaves(): List<OfflineLeaveEntity>

    @Query("DELETE FROM offline_leaves WHERE localId = :localId")
    suspend fun deleteLeave(localId: Long)
}

@Dao
interface CachedEmployeeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEmployee(employee: CachedEmployeeEntity)

    @Query("SELECT * FROM cached_employees WHERE employeeId = :employeeId")
    suspend fun getEmployee(employeeId: String): CachedEmployeeEntity?

    @Query("DELETE FROM cached_employees")
    suspend fun clearCache()
}

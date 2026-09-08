package com.artify.hcms.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.artify.hcms.data.local.dao.CachedEmployeeDao
import com.artify.hcms.data.local.dao.OfflineLeaveDao
import com.artify.hcms.data.local.dao.OfflinePunchDao
import com.artify.hcms.data.local.entity.CachedEmployeeEntity
import com.artify.hcms.data.local.entity.OfflineLeaveEntity
import com.artify.hcms.data.local.entity.OfflinePunchEntity

@Database(
    entities = [
        OfflinePunchEntity::class,
        OfflineLeaveEntity::class,
        CachedEmployeeEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun offlinePunchDao(): OfflinePunchDao
    abstract fun offlineLeaveDao(): OfflineLeaveDao
    abstract fun cachedEmployeeDao(): CachedEmployeeDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "artify_hcms_local.db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}

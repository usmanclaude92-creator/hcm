package com.artify.hcms

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.artify.hcms.presentation.navigation.MainAppNavigation
import com.artify.hcms.presentation.theme.ArtifyHcmsTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ArtifyHcmsTheme {
                MainAppNavigation()
            }
        }
    }
}

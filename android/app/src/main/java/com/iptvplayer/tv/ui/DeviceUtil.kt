package com.iptvplayer.tv.ui

import android.app.Activity
import android.app.UiModeManager
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.ActivityInfo
import android.content.pm.PackageManager
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext

/**
 * Utilitários para detecção inteligente entre TV Android (Controle Remoto / D-pad)
 * e Celular/Tablet Android (Touch Screen / Portátil).
 */
object DeviceUtil {

    fun isTv(context: Context): Boolean {
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) return true
        val pm = context.packageManager
        // Se não possui tela de toque, certamente é TV / TV Box
        if (!pm.hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN)) return true
        return false
    }

    fun findActivity(context: Context): Activity? {
        var current = context
        while (current is ContextWrapper) {
            if (current is Activity) return current
            current = current.baseContext
        }
        return null
    }

    fun setOrientation(context: Context, orientation: Int) {
        findActivity(context)?.requestedOrientation = orientation
    }
}

@Composable
fun rememberIsTv(): Boolean {
    val context = LocalContext.current
    return remember(context) { DeviceUtil.isTv(context) }
}

@Composable
fun rememberIsPortrait(): Boolean {
    val config = LocalConfiguration.current
    return config.orientation == Configuration.ORIENTATION_PORTRAIT
}

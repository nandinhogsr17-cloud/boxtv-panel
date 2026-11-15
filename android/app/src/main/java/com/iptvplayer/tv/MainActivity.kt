package com.iptvplayer.tv

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.iptvplayer.tv.ui.AppRoot
import com.iptvplayer.tv.ui.AppTheme
import com.iptvplayer.tv.ui.DeviceUtil

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // TV → forçar landscape; Celular → orientação livre (retrato/paisagem)
        requestedOrientation = if (DeviceUtil.isTv(this)) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }

        setContent {
            AppTheme {
                AppRoot()
            }
        }
    }
}

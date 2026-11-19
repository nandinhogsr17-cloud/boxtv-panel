package com.iptvplayer.tv

import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.fragment.app.FragmentActivity
import androidx.activity.compose.setContent
import com.iptvplayer.tv.ui.AppRoot
import com.iptvplayer.tv.ui.AppTheme
import com.iptvplayer.tv.ui.DeviceUtil
import com.iptvplayer.tv.ui.ScreenController
import com.iptvplayer.tv.ui.ScreenSettingsHost
import com.iptvplayer.tv.ui.UiMode

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        UiMode.phone = !DeviceUtil.isTv(this)

        // TV → forçar landscape; Celular → orientação livre (retrato/paisagem)
        requestedOrientation = if (DeviceUtil.isTv(this)) {
            ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        } else {
            ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }

        setContent {
            AppTheme {
                ScreenSettingsHost {
                    AppRoot()
                }
            }
        }
    }

    /** Celular: ao apertar Início com um vídeo na tela, continua em janela flutuante (imagem dentro de imagem). */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (ScreenController.fullBleed && !DeviceUtil.isTv(this) && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try {
                enterPictureInPictureMode(
                    android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational(16, 9)).build()
                )
            } catch (_: Exception) {
            }
        }
    }

    /** Tecla MENU do controle remoto abre o ajuste de tela em qualquer lugar do app. */
    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            ScreenController.calibrationOpen = !ScreenController.calibrationOpen
            if (!ScreenController.calibrationOpen) ScreenController.closePanel()
            return true
        }
        return super.onKeyUp(keyCode, event)
    }
}

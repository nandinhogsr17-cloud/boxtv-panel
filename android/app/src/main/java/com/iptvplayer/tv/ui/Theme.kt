package com.iptvplayer.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

// Identidade visual BoxTv: base azul-noite, violeta elétrico e ciano luminoso.
val Bg = Color(0xFF070914)
val Surface1 = Color(0xFF10162A)
val Surface2 = Color(0xFF1B2440)
val Accent = Color(0xFFB34DFF)
val AccentAlt = Color(0xFF13C9FF)
val TextPrimary = Color(0xFFF7F7FF)
val TextSecondary = Color(0xFFA8B2CC)
val Danger = Color(0xFFFF5577)
val Gold = Color(0xFFFFC857)

@Composable
fun AppTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent,
            onPrimary = Color.White,
            background = Bg,
            onBackground = TextPrimary,
            surface = Surface1,
            onSurface = TextPrimary,
        )
    ) {
        Box(Modifier.fillMaxSize().background(Bg)) { content() }
    }
}

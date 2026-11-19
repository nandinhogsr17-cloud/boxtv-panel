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
/** Define qual paleta vale: celular = dourado sobre azul-noite; TV = violeta/ciano. Ajustado no AppRoot. */
object UiMode {
    @Volatile var phone: Boolean = false
    /** Paleta dourada sobre azul-noite: vale para TV e celular (mesmo visual nos dois). */
    @Volatile var gold: Boolean = true
}

val Bg: Color get() = if (UiMode.gold) Color(0xFF070D1C) else Color(0xFF070914)
val Surface1: Color get() = if (UiMode.gold) Color(0xFF0F182C) else Color(0xFF10162A)
val Surface2: Color get() = if (UiMode.gold) Color(0xFF1A2742) else Color(0xFF1B2440)
val Accent: Color get() = if (UiMode.gold) Color(0xFFFFB43B) else Color(0xFFB34DFF)
val AccentAlt: Color get() = if (UiMode.gold) Color(0xFFFFCB6B) else Color(0xFF13C9FF)
/** Texto sobre botões de destaque (escuro no dourado do celular). */
val OnAccent: Color get() = if (UiMode.gold) Color(0xFF1B1204) else Color(0xFF0B1020)
val TextPrimary = Color(0xFFF7F7FF)
val TextSecondary: Color get() = if (UiMode.gold) Color(0xFF9FB0CC) else Color(0xFFA8B2CC)
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

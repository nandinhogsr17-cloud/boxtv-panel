package com.iptvplayer.tv.ui

import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// ─── Casca da TV: barra lateral de ícones + data e hora no topo ─────────────
private val RAIL_TOP = listOf(Tab.HOME, Tab.LIVE, Tab.MOVIES, Tab.SERIES, Tab.GAMES)
private val RAIL_BOTTOM = listOf(Tab.SEARCH, Tab.FAVS, Tab.SETTINGS)

private fun railIcon(t: Tab): PhoneIcon = when (t) {
    Tab.HOME -> PhoneIcon.HOME
    Tab.LIVE -> PhoneIcon.LIVE
    Tab.MOVIES -> PhoneIcon.MOVIES
    Tab.SERIES -> PhoneIcon.SERIES
    Tab.GAMES -> PhoneIcon.SOCCER
    Tab.SEARCH -> PhoneIcon.SEARCH
    Tab.FAVS -> PhoneIcon.STAR
    Tab.SETTINGS -> PhoneIcon.SETTINGS
}

fun tabTitle(t: Tab): String = when (t) {
    Tab.GAMES -> "Futebol"
    Tab.FAVS -> "Favoritos"
    Tab.SETTINGS -> "Configurações"
    Tab.SEARCH -> "Buscar"
    else -> t.label
}

/**
 * Barra lateral. Subir/descer com o controle troca de tela sozinho (depois de um instante);
 * entrar na barra vindo do conteúdo (esquerda) NÃO troca de tela.
 */
@Composable
fun TvRail(selected: Tab, selectedFocus: FocusRequester, onSelect: (Tab) -> Unit, onFocusTab: (Tab) -> Unit) {
    var lastVertical by remember { mutableLongStateOf(0L) }
    Column(
        Modifier
            .width(72.dp)
            .fillMaxHeight()
            .background(Color(0xFF080F20))
            .onPreviewKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown && (ev.key == Key.DirectionUp || ev.key == Key.DirectionDown)) {
                    lastVertical = SystemClock.uptimeMillis()
                }
                false
            }
            .padding(vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(38.dp).clip(RoundedCornerShape(12.dp))
                .background(Brush.linearGradient(listOf(AccentAlt, Accent))),
            contentAlignment = Alignment.Center,
        ) { Text("▶", color = OnAccent, fontSize = 15.sp, fontWeight = FontWeight.Black) }
        Spacer(Modifier.height(18.dp))
        RAIL_TOP.forEach { t ->
            RailItem(t, t == selected, if (t == selected) Modifier.focusRequesterIf(selectedFocus) else Modifier, { onSelect(t) }) {
                if (SystemClock.uptimeMillis() - lastVertical < 400L) onFocusTab(t)
            }
            Spacer(Modifier.height(6.dp))
        }
        Spacer(Modifier.weight(1f))
        RAIL_BOTTOM.forEach { t ->
            RailItem(t, t == selected, if (t == selected) Modifier.focusRequesterIf(selectedFocus) else Modifier, { onSelect(t) }) {
                if (SystemClock.uptimeMillis() - lastVertical < 400L) onFocusTab(t)
            }
            Spacer(Modifier.height(6.dp))
        }
    }
}

private fun Modifier.focusRequesterIf(r: FocusRequester): Modifier = this.then(Modifier.focusRequester(r))

@Composable
private fun RailItem(tab: Tab, selected: Boolean, modifier: Modifier, onClick: () -> Unit, onFocused: () -> Unit) {
    FocusCard(
        onClick,
        modifier.semantics { contentDescription = tabTitle(tab) },
        shape = RoundedCornerShape(14.dp),
        focusedScale = 1.08f,
        onFocused = onFocused,
    ) { focused ->
        Box(
            Modifier
                .size(46.dp)
                .background(
                    when {
                        focused -> Brush.linearGradient(listOf(AccentAlt, Accent))
                        selected -> Brush.linearGradient(listOf(Accent.copy(alpha = 0.2f), Accent.copy(alpha = 0.2f)))
                        else -> Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))
                    }
                ),
            contentAlignment = Alignment.Center,
        ) {
            PhoneIconView(railIcon(tab), if (focused) OnAccent else if (selected) Accent else TextSecondary, size = 26.dp)
        }
    }
}

/** Título da tela à esquerda; data e hora à direita (atualiza a cada 20 s). */
@Composable
fun TvTopBar(title: String?, userInfo: String?) {
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            value = System.currentTimeMillis()
            delay(20_000)
        }
    }
    val locale = Locale("pt", "BR")
    val date = SimpleDateFormat("EEEE, d 'de' MMMM", locale).format(Date(now)).replaceFirstChar { it.uppercase() }
    val time = SimpleDateFormat("HH:mm", locale).format(Date(now))
    Row(
        Modifier.fillMaxWidth().height(40.dp).padding(start = 8.dp, end = 28.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.End,
    ) {
        if (!userInfo.isNullOrBlank()) {
            Text(userInfo, color = TextSecondary, fontSize = 11.sp, modifier = Modifier.weight(1f))
        } else {
            Spacer(Modifier.weight(1f))
        }
        Text(date, color = TextSecondary, fontSize = 12.sp)
        Spacer(Modifier.width(14.dp))
        Text(time, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold)
    }
}

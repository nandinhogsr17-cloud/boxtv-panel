package com.iptvplayer.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Game
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Jogos com filtros inteligentes (Hoje, Ao Vivo, Todos da Semana, Amanhã, Ontem). */
@Composable
fun GamesScreen(onPlay: (PlayRequest) -> Unit) {
    val app = LocalContext.current.applicationContext as IptvApp
    val isTv = rememberIsTv()
    val sidePadding = if (isTv) 48.dp else 18.dp
    var filterMode by remember { mutableStateOf("today") } // today, live, all, tomorrow, yesterday
    var attempt by remember { mutableIntStateOf(0) }
    var notice by remember { mutableStateOf<String?>(null) }

    fun getTodayStr(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    fun getOffsetStr(days: Int): String {
        val d = Date(System.currentTimeMillis() + days.toLong() * 24 * 3600 * 1000)
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(d)
    }

    val state by rememberLoad(filterMode, attempt) {
        val targetDate = when (filterMode) {
            "all", "live" -> "all"
            "tomorrow" -> getOffsetStr(1)
            "yesterday" -> getOffsetStr(-1)
            else -> getTodayStr()
        }
        app.api.games(targetDate)
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = sidePadding, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "⚽ Jogos de Futebol",
                color = TextPrimary,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
            )
        }

        // Barra de filtros de jogos
        LazyRow(
            contentPadding = PaddingValues(horizontal = sidePadding),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 12.dp),
        ) {
            item { Pill("⚽ Hoje", selected = filterMode == "today", onClick = { filterMode = "today" }) }
            item { Pill("🔴 Ao Vivo", selected = filterMode == "live", onClick = { filterMode = "live" }) }
            item { Pill("🏆 Todos da Semana", selected = filterMode == "all", onClick = { filterMode = "all" }) }
            item { Pill("📅 Amanhã", selected = filterMode == "tomorrow", onClick = { filterMode = "tomorrow" }) }
            item { Pill("⏮ Ontem", selected = filterMode == "yesterday", onClick = { filterMode = "yesterday" }) }
        }

        when (val s = state) {
            is Load.Loading -> CenterBox { Spinner() }
            is Load.Err -> ErrorBox(s.message) { attempt++ }
            is Load.Ok -> {
                var games = s.value.games
                if (filterMode == "live") {
                    games = games.filter { it.isLive }
                }

                if (games.isEmpty()) {
                    CenterBox {
                        val emptyText = if (filterMode == "live") {
                            "Nenhum jogo ao vivo no momento.\nSelecione '⚽ Hoje' ou '🏆 Todos da Semana' para ver os próximos jogos!"
                        } else {
                            "Nenhum jogo encontrado para esta data."
                        }
                        Text(emptyText, color = TextSecondary, fontSize = 16.sp)
                    }
                } else {
                    Box(Modifier.fillMaxSize()) {
                        LazyColumn(
                            Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(horizontal = sidePadding, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(games) { game ->
                                GameRow(game, showDate = filterMode == "all" || filterMode == "live") {
                                    if (game.channels.isEmpty()) {
                                        notice = "Este jogo não está na sua lista de canais" +
                                            (if (game.channelHint.isNotBlank()) " (passa em: ${game.channelHint})" else "") + "."
                                    } else {
                                        notice = null
                                        onPlay(PlayRequest(game.channels, 0))
                                    }
                                }
                            }
                        }
                        notice?.let { msg ->
                            Text(
                                msg,
                                color = TextPrimary,
                                fontSize = 14.sp,
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(bottom = 24.dp)
                                    .background(Surface2, RoundedCornerShape(10.dp))
                                    .padding(horizontal = 18.dp, vertical = 10.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GameRow(game: Game, showDate: Boolean = false, onClick: () -> Unit) {
    FocusCard(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), focusedScale = 1.02f) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Surface2 else Surface1)
                .padding(horizontal = 18.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.width(if (rememberIsTv()) 115.dp else 82.dp)) {
                Text(
                    if (game.isLive) (game.statusLabel.ifBlank { "AO VIVO" }) else game.time,
                    color = if (game.isLive) Danger else Accent,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                )
                game.score?.let { Text(it, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.Bold) }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    "${game.home} × ${game.away}",
                    color = TextPrimary,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val compTitle = if (showDate && game.date.isNotBlank()) {
                    val parts = game.date.split("-")
                    val dateFmt = if (parts.size == 3) "${parts[2]}/${parts[1]} · " else ""
                    dateFmt + game.competition
                } else {
                    game.competition
                }
                Text(compTitle, color = TextSecondary, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(4.dp))
                Text(
                    if (game.channels.isNotEmpty()) "📺 " + game.channels.joinToString("  ·  ") { it.title }
                    else "Sem canal na sua lista",
                    color = if (game.channels.isNotEmpty()) TextPrimary else TextSecondary,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

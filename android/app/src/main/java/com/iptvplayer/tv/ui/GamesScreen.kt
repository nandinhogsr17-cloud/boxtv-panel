package com.iptvplayer.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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
        // ─── Cabeçalho ───────────────────────────────────────────────────────
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = sidePadding, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Futebol",
                color = TextPrimary,
                fontSize = if (isTv) 26.sp else 22.sp,
                fontWeight = FontWeight.ExtraBold,
            )
        }

        // ─── Filtros ─────────────────────────────────────────────────────────
        LazyRow(
            contentPadding = PaddingValues(horizontal = sidePadding),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 12.dp),
        ) {
            item { Pill("🔴 Ao vivo agora", selected = filterMode == "live", onClick = { filterMode = "live" }) }
            item { Pill("⚽ Hoje", selected = filterMode == "today", onClick = { filterMode = "today" }) }
            item { Pill("📅 Amanhã", selected = filterMode == "tomorrow", onClick = { filterMode = "tomorrow" }) }
            item { Pill("🏆 Todos", selected = filterMode == "all", onClick = { filterMode = "all" }) }
        }

        // ─── Conteúdo ─────────────────────────────────────────────────────────
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
                            "Nenhum jogo ao vivo no momento.\nSelecione '⚽ Hoje' ou '🏆 Todos' para ver os próximos jogos!"
                        } else {
                            "Nenhum jogo encontrado para esta data."
                        }
                        Text(emptyText, color = TextSecondary, fontSize = 16.sp)
                    }
                } else if (isTv) {
                    // ─── Layout TV: painel destaque esquerda + lista direita ──
                    TvGamesLayout(games, sidePadding, notice, onPlay) { notice = it }
                } else {
                    // ─── Layout celular: lista simples ───────────────────────
                    Box(Modifier.fillMaxSize()) {
                        LazyColumn(
                            Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(horizontal = sidePadding, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(games) { game ->
                                GameRow(game, showDate = filterMode == "all" || filterMode == "live") {
                                    if (game.channels.isEmpty()) {
                                        notice = "Este jogo não está disponível nos seus canais" +
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

/** Layout split para TV: card de destaque à esquerda, lista de jogos à direita. */
@Composable
private fun TvGamesLayout(
    games: List<Game>,
    sidePadding: androidx.compose.ui.unit.Dp,
    notice: String?,
    onPlay: (PlayRequest) -> Unit,
    onNotice: (String?) -> Unit,
) {
    var featured by remember(games) { mutableStateOf(games.first()) }
    val liveGames = games.filter { it.isLive }
    val upcomingGames = games.filter { !it.isLive }

    fun playGame(game: Game) {
        if (game.channels.isEmpty()) {
            onNotice(
                "Este jogo não está disponível nos seus canais" +
                    (if (game.channelHint.isNotBlank()) " (passa em: ${game.channelHint})" else "") + ".",
            )
        } else {
            onNotice(null)
            onPlay(PlayRequest(game.channels, 0))
        }
    }

    Row(
        Modifier
            .fillMaxSize()
            .padding(start = sidePadding, end = sidePadding, bottom = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        // ─── Painel de destaque (esquerda) ───────────────────────────────────
        FeaturedGameCard(
            game = featured,
            modifier = Modifier
                .width(380.dp)
                .fillMaxHeight(),
            onWatch = { playGame(featured) },
        )

        // ─── Lista de jogos (direita) ─────────────────────────────────────────
        Box(Modifier.weight(1f).fillMaxHeight()) {
            LazyColumn(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
                contentPadding = PaddingValues(bottom = 8.dp),
            ) {
                if (liveGames.isNotEmpty()) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(8.dp).clip(CircleShape).background(Danger),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "AO VIVO AGORA  ${liveGames.size} jogos",
                                color = Danger,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                    items(liveGames, key = { it.id }) { game ->
                        SideGameRow(game, onFocused = { featured = game }) {
                            playGame(game)
                        }
                    }
                }
                if (upcomingGames.isNotEmpty()) {
                    item {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "MAIS TARDE  ${upcomingGames.size} jogos",
                            color = TextSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(6.dp))
                    }
                    items(upcomingGames, key = { it.id }) { game ->
                        SideGameRow(game, onFocused = { featured = game }) {
                            playGame(game)
                        }
                    }
                }
            }
            notice?.let { msg ->
                Text(
                    msg,
                    color = TextPrimary,
                    fontSize = 13.sp,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 12.dp)
                        .background(Surface2, RoundedCornerShape(10.dp))
                        .padding(horizontal = 18.dp, vertical = 10.dp),
                )
            }
        }
    }
}

/** Card de jogo em destaque (lado esquerdo na TV). */
@Composable
private fun FeaturedGameCard(game: Game, modifier: Modifier = Modifier, onWatch: () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    val liveGradient = Brush.verticalGradient(listOf(Color(0xFF8B1A6B), Color(0xFF3D1070)))
    val upcomingGradient = Brush.verticalGradient(listOf(Color(0xFF1A2A6C), Color(0xFF0F1535)))

    Column(
        modifier
            .clip(shape)
            .background(if (game.isLive) liveGradient else upcomingGradient)
            .border(1.dp, Color.White.copy(alpha = 0.12f), shape)
            .padding(24.dp),
    ) {
        // Campeonato e horário
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (game.isLive) {
                Box(
                    Modifier
                        .background(Danger, RoundedCornerShape(6.dp))
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                ) {
                    Text("● AO VIVO", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(8.dp))
                Text(game.statusLabel.ifBlank { "" }, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp)
            } else {
                Text(
                    "⏰ ${game.time}",
                    color = Color.White.copy(alpha = 0.8f),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
            Spacer(Modifier.weight(1f))
        }
        Spacer(Modifier.height(6.dp))
        Text(
            game.competition.ifBlank { "Futebol" },
            color = Color.White.copy(alpha = 0.65f),
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Spacer(Modifier.height(16.dp))

        // Times em destaque
        Column(
            Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            TeamCrest(game.home)
            if (game.score != null) {
                Text(
                    game.score,
                    color = Color.White,
                    fontSize = 36.sp,
                    fontWeight = FontWeight.ExtraBold,
                )
            } else {
                Text("×", color = Color.White.copy(alpha = 0.6f), fontSize = 28.sp, fontWeight = FontWeight.Light)
            }
            TeamCrest(game.away)
        }

        Spacer(Modifier.height(16.dp))

        // Canais disponíveis
        if (game.channelHint.isNotBlank() || game.channels.isNotEmpty()) {
            val channelText = if (game.channels.isNotEmpty()) {
                "Passa em " + game.channels.take(2).joinToString(" e mais ${(game.channels.size - 2).coerceAtLeast(0)}") { it.title }
            } else {
                "Passa em ${game.channelHint}"
            }
            Text(
                channelText,
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 11.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(10.dp))
        }

        Spacer(Modifier.weight(1f))

        // Botões
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (game.channels.isNotEmpty()) {
                ActionButton(
                    "▶ Ver canal",
                    onClick = onWatch,
                    primary = true,
                )
            }
        }
    }
}

/** Exibe o nome do time com iniciais em um círculo colorido. */
@Composable
private fun TeamCrest(name: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.15f))
                .border(1.dp, Color.White.copy(alpha = 0.3f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                name.trim().take(2).uppercase(),
                color = Color.White,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        Text(
            name,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}

/** Linha de jogo compacta para o painel lateral da TV. */
@Composable
private fun SideGameRow(game: Game, onFocused: () -> Unit, onClick: () -> Unit) {
    FocusCard(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp), focusedScale = 1.015f, onFocused = onFocused) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Surface2 else Color.Transparent)
                .border(if (focused) 0.dp else 0.dp, Color.Transparent)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Status / horário
            Column(Modifier.width(60.dp)) {
                if (game.isLive) {
                    Box(Modifier.size(8.dp).clip(CircleShape).background(Danger))
                    game.score?.let {
                        Text(it, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.ExtraBold)
                    }
                } else {
                    Text(game.time, color = Accent, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    "${game.home} × ${game.away}",
                    color = TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    game.competition,
                    color = TextSecondary,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (game.channels.isNotEmpty()) {
                    Text(
                        game.channels.first().title,
                        color = TextSecondary,
                        fontSize = 10.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                } else if (game.channelHint.isNotBlank()) {
                    Text(
                        "sem canal na sua lista",
                        color = TextSecondary.copy(alpha = 0.6f),
                        fontSize = 10.sp,
                        maxLines = 1,
                    )
                }
            }
            // Ícone de sino (lembrete) para jogos futuros
            if (!game.isLive) {
                Box(
                    Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.White.copy(alpha = 0.06f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("🔔", fontSize = 14.sp)
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
                    else "Sem canal disponível",
                    color = if (game.channels.isNotEmpty()) TextPrimary else TextSecondary,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

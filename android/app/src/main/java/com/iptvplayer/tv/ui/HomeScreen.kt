package com.iptvplayer.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.iptvplayer.tv.data.AppPreferences
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Game
import com.iptvplayer.tv.data.Item
import kotlinx.coroutines.CancellationException

@Composable
fun HomeScreen(
    refreshKey: Int,
    onOpen: (Item) -> Unit,
    onPlay: (PlayRequest) -> Unit,
    onGames: () -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as IptvApp
    val resumeEnabled = AppPreferences.read(context).resumePlayback
    val compact = !rememberIsTv()
    var games by remember(refreshKey) { mutableStateOf<List<Game>>(emptyList()) }
    var gamesLoading by remember(refreshKey) { mutableStateOf(true) }
    var attempt by remember { mutableIntStateOf(0) }
    val state by rememberLoad(refreshKey, attempt) { app.api.home() }

    LaunchedEffect(refreshKey) {
        games = try {
            app.api.games().games
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            emptyList()
        } finally {
            gamesLoading = false
        }
    }

    when (val s = state) {
        is Load.Loading -> CenterBox { Spinner() }
        is Load.Err -> ErrorBox(s.message) { attempt++ }
        is Load.Ok -> {
            val home = s.value
            if (home.hero == null && home.rows.isEmpty() && games.isEmpty() && !gamesLoading) {
                CenterBox { Text("Sua lista ainda está vazia.", color = TextSecondary, fontSize = 16.sp) }
            } else {
                val continueRows = if (resumeEnabled) home.rows.filter { it.kind == "continue" } else emptyList()
                val otherRows = home.rows.filterNot { it.kind == "continue" }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp)) {
                    home.hero?.let { hero ->
                        item(key = "hero") { Hero(hero, onOpen, onPlay, compact) }
                    }
                    if (!compact && continueRows.isNotEmpty()) {
                        itemsIndexed(continueRows, key = { index, it -> "continue:${it.title}:$index" }) { _, row ->
                            if (row.items.isNotEmpty()) {
                                ContinueWatchingSection(row.items, onOpen)
                            }
                        }
                    }
                    if (games.isNotEmpty()) {
                        item(key = "games") { GamesStrip(games, onPlay, onGames, compact) }
                    }
                    itemsIndexed(if (compact && resumeEnabled) home.rows else otherRows, key = { index, it -> "${it.kind}:${it.title}:$index" }) { _, row ->
                        ItemRow(
                            title = row.title,
                            items = row.items,
                            wide = row.kind == "continue",
                            onClick = { item ->
                                if (item.isLive) {
                                    val liveList = row.items.filter { it.isLive }
                                    onPlay(PlayRequest(liveList, liveList.indexOf(item).coerceAtLeast(0)))
                                } else {
                                    onOpen(item)
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Hero(item: Item, onOpen: (Item) -> Unit, onPlay: (PlayRequest) -> Unit, compact: Boolean) {
    val resuming = item.positionMs > 0
    Box(
        Modifier
            .fillMaxWidth()
            .height(if (compact) 340.dp else 330.dp)
            .then(if (compact) Modifier else Modifier.clip(RoundedCornerShape(22.dp)))
            .then(if (compact) Modifier else Modifier.border(1.dp, Brush.horizontalGradient(listOf(AccentAlt, Accent, Color.Transparent)), RoundedCornerShape(22.dp)))
    ) {
        item.posterUrl?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alpha = if (compact) 0.38f else 0.78f,
                modifier = if (compact) Modifier.fillMaxSize() else Modifier
                    .align(Alignment.CenterEnd)
                    .fillMaxHeight()
                    .fillMaxWidth(0.72f),
            )
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    if (compact) Brush.verticalGradient(0f to Color.Transparent, 0.22f to Bg.copy(alpha = 0.35f), 1f to Bg)
                    else Brush.horizontalGradient(0f to Bg, 0.25f to Bg, 0.58f to Bg.copy(alpha = 0.55f), 1f to Color.Transparent)
                )
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(0.6f to Color.Transparent, 1f to Bg))
        )
        Column(
            Modifier
                .align(Alignment.CenterStart)
                .padding(start = if (compact) 20.dp else 54.dp, end = if (compact) 20.dp else 0.dp)
                .fillMaxWidth(if (compact) 1f else 0.53f)
        ) {
            if (compact) {
                Text(if (resuming) "CONTINUAR ASSISTINDO" else "EM DESTAQUE", color = Accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            } else {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    Box(Modifier.width(7.dp).height(7.dp).background(Accent, CircleShape))
                    Text(if (resuming) "RETOME AGORA" else "DESTAQUE DA SUA LISTA", color = Accent, fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.5.sp)
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                item.title,
                color = TextPrimary,
                fontSize = if (compact) 27.sp else 36.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                listOfNotNull(item.year?.toString(), item.group.takeIf { it.isNotBlank() }).joinToString("  ·  "),
                color = TextSecondary,
                fontSize = if (compact) 12.sp else 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ActionButton(
                    if (resuming) "▶ Continuar" else if (item.type == "series") "Ver episódios" else "▶ Assistir",
                    onClick = {
                        if (item.type == "series") onOpen(item) else onPlay(PlayRequest(listOf(item), 0))
                    },
                    primary = true,
                )
                if (item.type == "movie" || item.type == "series") {
                    ActionButton("Detalhes", onClick = { onOpen(item) })
                }
            }
        }
    }
}

@Composable
private fun GamesStrip(games: List<Game>, onPlay: (PlayRequest) -> Unit, onGames: () -> Unit, compact: Boolean) {
    val sidePadding = if (compact) 18.dp else 48.dp
    Column(Modifier.padding(vertical = 8.dp)) {
        if (compact) {
            Text("Jogos de hoje", fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary, modifier = Modifier.padding(start = sidePadding, bottom = 8.dp))
        } else {
            Row(Modifier.fillMaxWidth().padding(start = sidePadding, end = sidePadding, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("FUTEBOL", fontSize = 12.sp, fontWeight = FontWeight.ExtraBold, color = Accent, letterSpacing = 2.sp)
                    Text("Partidas e canais da sua lista", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                }
                Spacer(Modifier.weight(1f))
                Box(Modifier.clip(RoundedCornerShape(50)).background(Color(0x1A22D3C5)).border(1.dp, Accent.copy(alpha = 0.35f), RoundedCornerShape(50)).padding(horizontal = 13.dp, vertical = 7.dp)) {
                    Text("${games.size} ${if (games.size == 1) "PARTIDA" else "PARTIDAS"}", color = Accent, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 0.8.sp)
                }
            }
        }
        LazyRow(
            contentPadding = PaddingValues(horizontal = sidePadding, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(games, key = { index, game -> "${game.id}_$index" }) { _, game ->
                val onClick = {
                    if (game.channels.isNotEmpty()) onPlay(PlayRequest(game.channels, 0)) else onGames()
                }
                if (compact) {
                    GameCard(game, onClick, Modifier.width(250.dp))
                } else {
                    FootballGameCard(game, onClick)
                }
            }
        }
    }
}

@Composable
private fun ContinueWatchingSection(items: List<Item>, onOpen: (Item) -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 10.dp)
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF191C32), Surface1, Color(0xFF10242A))))
            .border(1.dp, Brush.horizontalGradient(listOf(AccentAlt.copy(alpha = 0.65f), Accent.copy(alpha = 0.24f), Color.Transparent)), shape)
            .padding(vertical = 15.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("SUA SESSÃO", color = AccentAlt, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.8.sp)
                Text("Continuar assistindo", color = TextPrimary, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.weight(1f))
            Text("${items.size} ${if (items.size == 1) "TÍTULO" else "TÍTULOS"}", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp)
        }
        Spacer(Modifier.height(7.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 5.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            itemsIndexed(items, key = { index, item -> "${item.id}_$index" }) { _, item ->
                MediaCard(item, onClick = { onOpen(item) }, wide = true, cardWidth = 264.dp)
            }
        }
    }
}

@Composable
private fun FootballGameCard(game: Game, onClick: () -> Unit) {
    val isLive = game.isLive
    FocusCard(
        onClick = onClick,
        modifier = Modifier.width(356.dp).height(142.dp),
        shape = RoundedCornerShape(18.dp),
        focusedScale = 1.04f,
    ) { focused ->
        Box(Modifier.fillMaxSize().background(
            Brush.linearGradient(
                listOf(
                    if (isLive) Color(0xFF183A35) else Color(0xFF19243A),
                    if (focused) Color(0xFF253554) else Surface1,
                    Color(0xFF111827),
                )
            )
        )) {
            Canvas(Modifier.fillMaxSize()) {
                val line = Color.White.copy(alpha = 0.06f)
                drawCircle(line, radius = 42.dp.toPx(), center = androidx.compose.ui.geometry.Offset(size.width * .78f, size.height * .56f), style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.dp.toPx()))
                drawLine(line, start = androidx.compose.ui.geometry.Offset(size.width * .78f, 0f), end = androidx.compose.ui.geometry.Offset(size.width * .78f, size.height), strokeWidth = 1.dp.toPx())
            }
            Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.width(7.dp).height(7.dp).background(if (isLive) Danger else Accent, CircleShape))
                    Text(game.competition.ifBlank { "FUTEBOL" }.uppercase(), color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(if (isLive) "AO VIVO" else game.time.ifBlank { game.statusLabel }, color = if (isLive) Color(0xFFFF777C) else Accent, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TeamBadge(game.home, Accent)
                    Text(game.home, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text(game.score ?: "×", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    Text(game.away, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    TeamBadge(game.away, AccentAlt)
                }
                Spacer(Modifier.height(11.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (game.channels.isNotEmpty()) "▶  ASSISTIR NA SUA LISTA" else "VER CANAIS DISPONÍVEIS", color = if (game.channels.isNotEmpty()) Color.White else TextSecondary, fontSize = 9.sp, fontWeight = FontWeight.ExtraBold)
                    if (game.channels.isNotEmpty()) Text("• ${game.channels.size} canal(is)", color = Accent, fontSize = 9.sp)
                }
            }
        }
    }
}

@Composable
private fun TeamBadge(name: String, color: Color) {
    Box(Modifier.size(28.dp).background(color.copy(alpha = 0.22f), CircleShape).border(1.dp, color.copy(alpha = 0.72f), CircleShape), contentAlignment = Alignment.Center) {
        Text(name.trim().firstOrNull()?.uppercase() ?: "?", color = color, fontSize = 12.sp, fontWeight = FontWeight.Black)
    }
}

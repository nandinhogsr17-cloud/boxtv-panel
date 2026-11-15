package com.iptvplayer.tv.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Item
import com.iptvplayer.tv.data.MetaResponse
import com.iptvplayer.tv.data.SeriesDetail
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Detalhe de filme ou série: sinopse, assistir/continuar, favoritar e lista de episódios. */
@Composable
fun DetailScreen(item: Item, enabled: Boolean, onBack: () -> Unit, onPlay: (PlayRequest) -> Unit) {
    BackHandler(enabled = enabled, onBack = onBack)
    val app = LocalContext.current.applicationContext as IptvApp
    val scope = rememberCoroutineScope()
    val isTv = rememberIsTv()
    val sidePadding = if (isTv) 48.dp else 18.dp
    val isSeries = item.type == "series"

    // Recarrega em silêncio quando o player fecha (para atualizar o "continuar de onde parou").
    val fresh by produceState<Item?>(null, item.id, enabled) {
        if (!isSeries && enabled) {
            value = try {
                app.api.item(item.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                value
            }
        }
    }
    val detail by produceState<SeriesDetail?>(null, item.id, enabled) {
        if (isSeries && enabled) {
            value = try {
                app.api.series(item.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                value
            }
        }
    }
    val meta by produceState<MetaResponse?>(null, item.id) {
        value = try {
            app.api.meta(item.id)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    var fav by remember(item.id) { mutableStateOf(item.favorite) }
    var seasonIdx by remember(item.id) { mutableIntStateOf(0) }
    val flat = detail?.seasons?.flatMap { it.episodes }.orEmpty()
    val resumeAt = if (isSeries && flat.isNotEmpty()) resumeIndex(flat) else -1

    // Abre já na temporada por onde o usuário parou.
    LaunchedEffect(detail?.seasons?.size) {
        val d = detail ?: return@LaunchedEffect
        if (resumeAt >= 0) {
            val ep = flat[resumeAt]
            val i = d.seasons.indexOfFirst { it.season == ep.season }
            if (i >= 0) seasonIdx = i
        }
    }

    // Foco inicial no botão "Assistir" (e de novo quando o player fecha e devolve o controle a esta tela).
    val playFocus = remember { FocusRequester() }
    LaunchedEffect(enabled) {
        if (!enabled) return@LaunchedEffect
        delay(80)
        try {
            playFocus.requestFocus()
        } catch (e: Exception) {
            // o botão ainda não estava na tela; o usuário foca com as setas
        }
    }

    val current = fresh ?: item
    val backdrop = meta?.backdrop ?: item.posterUrl
    val posterW = when {
        isTv && isSeries -> 110
        isTv -> 150
        isSeries -> 86
        else -> 104
    }
    val posterH = when {
        isTv && isSeries -> 165
        isTv -> 225
        isSeries -> 129
        else -> 156
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Bg)
            .focusProperties { canFocus = enabled }
    ) {
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alpha = 0.22f,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(0f to Color.Transparent, 0.8f to Bg, 1f to Bg))
        )
        Column(
            Modifier
                .fillMaxSize()
                .padding(horizontal = sidePadding, vertical = if (isTv) 24.dp else 14.dp)
        ) {
            Row {
                Box(
                    Modifier
                        .size(posterW.dp, posterH.dp)
                        .clip(RoundedCornerShape(10.dp))
                ) { PosterBackground(item, fit = false) }
                Spacer(Modifier.width(if (isTv) 24.dp else 14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        item.title,
                        color = TextPrimary,
                        fontSize = if (isTv) 26.sp else 20.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(Modifier.height(4.dp))
                    val info = listOfNotNull(
                        (meta?.year ?: item.year)?.toString(),
                        meta?.rating?.let { "★ $it" },
                        meta?.genres,
                        item.group.takeIf { it.isNotBlank() },
                        if (isSeries) detail?.seasons?.size?.let { "$it temporada(s)" } else null,
                    ).joinToString("  ·  ")
                    if (info.isNotBlank()) Text(info, color = TextSecondary, fontSize = if (isTv) 13.sp else 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.height(8.dp))
                    val overview = meta?.overview.orEmpty()
                    if (overview.isNotBlank()) {
                        Text(
                            overview,
                            color = TextPrimary,
                            fontSize = if (isTv) 13.sp else 12.sp,
                            maxLines = if (isTv) if (isSeries) 3 else 5 else 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(10.dp))
                    }
                    val playLabel: String
                    val playAction: () -> Unit
                    if (isSeries) {
                        val target = flat.getOrNull(resumeAt)
                        playLabel = when {
                            target == null -> "▶ Assistir"
                            target.positionMs > 0 -> "▶ Continuar T${target.season} E${target.episode}"
                            else -> "▶ Assistir"
                        }
                        playAction = {
                            if (target != null) onPlay(PlayRequest(flat, resumeAt, detail?.title ?: item.title))
                        }
                    } else {
                        val resume = current.positionMs > 30_000 && current.progress < 0.95f
                        playLabel = if (resume) "▶ Continuar (${fmtTime(current.positionMs)})" else "▶ Assistir"
                        playAction = { onPlay(PlayRequest(listOf(current), 0)) }
                    }

                    fun toggleFavorite() {
                        val newFav = !fav
                        fav = newFav
                        scope.launch {
                            try {
                                if (newFav) app.api.addFavorite(item.id) else app.api.removeFavorite(item.id)
                            } catch (e: CancellationException) {
                                throw e
                            } catch (_: Exception) {
                                fav = !newFav
                            }
                        }
                    }

                    val favoriteLabel = when {
                        fav && isTv -> "★ Na minha lista"
                        fav -> "✓ Na lista"
                        isTv -> "☆ Minha lista"
                        else -> "☆ Favoritar"
                    }
                    if (isTv) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            ActionButton(playLabel, playAction, Modifier.focusRequester(playFocus), primary = true)
                            ActionButton(favoriteLabel, onClick = { toggleFavorite() })
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            ActionButton(playLabel, playAction, Modifier.fillMaxWidth().focusRequester(playFocus), primary = true)
                            ActionButton(favoriteLabel, onClick = { toggleFavorite() }, modifier = Modifier.fillMaxWidth())
                        }
                    }
                }
            }

            if (isSeries) {
                Spacer(Modifier.height(14.dp))
                val d = detail
                if (d == null) {
                    CenterBox { Spinner() }
                } else if (d.seasons.isEmpty()) {
                    Text("Nenhum episódio encontrado.", color = TextSecondary, fontSize = 14.sp)
                } else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(d.seasons.size) { i ->
                            Pill("Temporada ${d.seasons[i].season}", selected = i == seasonIdx, onClick = { seasonIdx = i })
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    val season = d.seasons[seasonIdx.coerceIn(0, d.seasons.size - 1)]
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        contentPadding = PaddingValues(bottom = 16.dp),
                    ) {
                        items(season.episodes) { ep ->
                            EpisodeRow(ep) {
                                val idx = flat.indexOfFirst { it.id == ep.id }
                                if (idx >= 0) onPlay(PlayRequest(flat, idx, d.title))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EpisodeRow(ep: Item, onClick: () -> Unit) {
    FocusCard(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp), focusedScale = 1.02f) { focused ->
        Column(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Surface2 else Surface1)
                .padding(horizontal = 14.dp, vertical = 8.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "E${ep.episode}",
                    color = Accent,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.width(48.dp),
                )
                Text(
                    ep.title,
                    color = TextPrimary,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                if (ep.progress >= 0.95f) {
                    Text("✓ assistido", color = TextSecondary, fontSize = 12.sp)
                } else if (ep.positionMs > 0) {
                    Text("parou em ${fmtTime(ep.positionMs)}", color = TextSecondary, fontSize = 12.sp)
                }
            }
            if (ep.progress in 0.01f..0.949f) {
                Spacer(Modifier.height(5.dp))
                ProgressBar(ep.progress)
            }
        }
    }
}

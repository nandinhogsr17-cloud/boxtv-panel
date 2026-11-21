package com.iptvplayer.tv.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.iptvplayer.tv.data.Game
import com.iptvplayer.tv.data.Item

/**
 * Base de tudo que recebe foco do controle remoto: destaca com borda e cresce um pouco.
 * (Feito só com o foundation do Compose para não depender de APIs específicas de TV.)
 */
private val FocusBorderBrush = Brush.linearGradient(listOf(AccentAlt, Accent, Gold))
private val NoBorderBrush = Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))

@Composable
fun FocusCard(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(14.dp),
    focusedScale: Float = 1.055f,
    onFocused: (() -> Unit)? = null,
    content: @Composable BoxScope.(focused: Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    Box(
        modifier
            .zIndex(if (focused) 1f else 0f)
            .graphicsLayer {
                if (focused && focusedScale != 1f) {
                    scaleX = focusedScale
                    scaleY = focusedScale
                }
            }
            .onFocusChanged { state ->
                focused = state.isFocused
                if (state.isFocused) onFocused?.invoke()
            }
            .border(if (focused) 2.5.dp else 0.dp, if (focused) FocusBorderBrush else NoBorderBrush, shape)
            .clip(shape)
            .onKeyEvent { ev ->
                if ((ev.key == Key.DirectionCenter || ev.key == Key.Enter || ev.key == Key.NumPadEnter) && ev.type == KeyEventType.KeyUp) {
                    onClick()
                    true
                } else false
            }
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
    ) {
        content(focused)
    }
}

@Composable
fun Spinner(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "boxtv-loader")
    val pulse by transition.animateFloat(
        initialValue = 0.88f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(760), repeatMode = RepeatMode.Reverse),
        label = "loader-pulse",
    )
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(42.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(
                modifier = Modifier.fillMaxSize().scale(pulse),
                color = Accent,
                strokeWidth = 3.dp,
            )
            Text("\u25B6", color = Accent, fontSize = 13.sp, fontWeight = FontWeight.Black)
        }
        Spacer(Modifier.height(8.dp))
        Text("BoxTv", color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun CenterBox(content: @Composable BoxScope.() -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center, content = content)
}

@Composable
fun ErrorBox(message: String, onRetry: () -> Unit) {
    CenterBox {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                message,
                color = TextPrimary,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(0.6f),
            )
            Spacer(Modifier.height(16.dp))
            ActionButton("Tentar de novo", onRetry, primary = true)
        }
    }
}

@Composable
fun ActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    fillWidth: Boolean = false,
) {
    FocusCard(onClick, modifier, shape = RoundedCornerShape(13.dp), focusedScale = 1.045f) { focused ->
        Box(
            Modifier
                .then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
                .background(
                    if (focused || primary) Brush.linearGradient(listOf(AccentAlt, Accent, if (UiMode.gold) Accent else Color(0xFF713BFF)))
                    else Brush.linearGradient(listOf(Surface2, Surface1))
                )
                .border(1.dp, if (focused || primary) Color.White.copy(alpha = 0.22f) else Color.White.copy(alpha = 0.07f), RoundedCornerShape(13.dp))
                .padding(horizontal = 20.dp, vertical = 11.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(text, color = if (focused || primary) OnAccent else Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }
}

@Composable
fun Pill(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onFocused: (() -> Unit)? = null,
) {
    FocusCard(
        onClick,
        modifier,
        shape = RoundedCornerShape(50),
        focusedScale = 1.04f,
        onFocused = onFocused,
    ) { focused ->
        Box(
            Modifier
                .background(
                    when {
                        focused -> Brush.linearGradient(listOf(AccentAlt, Accent))
                        selected -> Brush.linearGradient(listOf(Surface2, if (UiMode.gold) Surface2 else Color(0xFF252044)))
                        else -> Brush.linearGradient(listOf(Surface1, Surface1))
                    }
                )
                .border(1.dp, if (focused || selected) Accent.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.06f), RoundedCornerShape(50))
                .padding(horizontal = 16.dp, vertical = 9.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text,
                color = if (focused) OnAccent else if (selected) Color.White else TextSecondary,
                fontSize = 14.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
            )
        }
    }
}

/** Fundo do cartão: capa/logo por cima de um degradê com as iniciais (que aparece se a imagem falhar). */
@Composable
fun PosterBackground(item: Item, fit: Boolean, modifier: Modifier = Modifier) {
    val url = item.posterUrl
    val context = LocalContext.current
    val imageRequest = remember(url) {
        // Tamanho limitado: decodifica menos pixels (TV box com pouca memória rola mais liso).
        url?.let { ImageRequest.Builder(context).data(it).size(if (fit) 320 else 360, if (fit) 192 else 540).crossfade(120).build() }
    }
    var loaded by remember(url) { mutableStateOf(false) }
    Box(
        modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(Surface2, Surface1))),
        contentAlignment = Alignment.Center,
    ) {
        if (!loaded) {
            Text(
                item.title.trim().take(2).uppercase(),
                color = TextSecondary,
                fontSize = if (fit) 12.sp else 24.sp,
                fontWeight = FontWeight.Bold,
            )
        }
        if (imageRequest != null) {
            AsyncImage(
                model = imageRequest,
                contentDescription = null,
                contentScale = if (fit) ContentScale.Fit else ContentScale.Crop,
                onSuccess = { loaded = true },
                modifier = Modifier
                    .fillMaxSize()
                    .padding(if (fit) 4.dp else 0.dp),
            )
        }
    }
}

/** Cartão de filme/série/canal/episódio. */
@Composable
fun MediaCard(
    item: Item,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    wide: Boolean = false,
    cardWidth: androidx.compose.ui.unit.Dp? = null,
    fillWidth: Boolean = false,
    onFocused: (() -> Unit)? = null,
) {
    val defaultWidth = when {
        item.isLive -> 150.dp
        wide -> 230.dp
        else -> 125.dp
    }
    val w = cardWidth ?: defaultWidth
    val h = when {
        item.isLive -> 90.dp
        wide -> 130.dp
        else -> 187.dp
    }
    Column(if (fillWidth) modifier.fillMaxWidth() else modifier.width(w)) {
        FocusCard(onClick, if (fillWidth) Modifier.fillMaxWidth().aspectRatio(2f / 3f) else Modifier.size(w, h), onFocused = onFocused) {
            PosterBackground(item, fit = item.isLive)
            val thisYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR)
            if (UiMode.phone && !item.isLive && (item.year ?: 0) >= thisYear) {
                Text(
                    "NOVO",
                    color = OnAccent,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(8.dp)
                        .background(Accent, RoundedCornerShape(8.dp))
                        .padding(horizontal = 9.dp, vertical = 4.dp),
                )
            }
            if (item.progress > 0f) {
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(Color(0x66FFFFFF))
                )
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth(item.progress)
                        .height(4.dp)
                        .background(Accent)
                )
            }
            if (item.favorite) {
                Text(
                    "★",
                    color = Gold,
                    fontSize = 16.sp,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp),
                )
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            item.title,
            color = TextPrimary,
            fontSize = 12.sp,
            maxLines = if (item.isLive) 1 else 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun ItemRow(
    title: String,
    items: List<Item>,
    onClick: (Item) -> Unit,
    modifier: Modifier = Modifier,
    wide: Boolean = false,
) {
    val compact = !rememberIsTv()
    val sidePadding = if (compact) 18.dp else 48.dp
    Column(modifier.padding(vertical = 8.dp)) {
        Text(
            title,
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            color = TextPrimary,
            modifier = Modifier.padding(start = sidePadding, bottom = 8.dp),
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = sidePadding, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            itemsIndexed(items, key = { index, item -> "${item.id}_$index" }) { _, item ->
                MediaCard(item, onClick = { onClick(item) }, wide = wide)
            }
        }
    }
}

@Composable
fun GameCard(game: Game, onClick: () -> Unit, modifier: Modifier = Modifier) {
    FocusCard(onClick, modifier.widthIn(min = 240.dp), shape = RoundedCornerShape(12.dp)) { focused ->
        Column(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Surface2 else Surface1)
                .padding(14.dp)
        ) {
            Text(
                game.competition.ifBlank { "Futebol" },
                fontSize = 11.sp,
                color = TextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "${game.home} x ${game.away}",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                buildString {
                    append(game.statusLabel)
                    game.score?.let { append("   ").append(it) }
                },
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = if (game.isLive) Danger else Accent,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                if (game.channels.isNotEmpty()) "📺 " + game.channels.first().title
                else "Sem canal disponível",
                fontSize = 12.sp,
                color = TextSecondary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** Barra de progresso simples (0..1). */
@Composable
fun ProgressBar(fraction: Float, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(5.dp).clip(RoundedCornerShape(3.dp)).background(Color(0x55FFFFFF))) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(fraction.coerceIn(0f, 1f))
                .background(Accent)
        )
    }
}


/** Pincel de brilho que corre pelos blocos de carregamento. */
@Composable
fun shimmerBrush(): Brush {
    val t = rememberInfiniteTransition(label = "shimmer")
    val x by t.animateFloat(
        initialValue = -400f, targetValue = 1400f,
        animationSpec = infiniteRepeatable(tween(1300, easing = androidx.compose.animation.core.LinearEasing), RepeatMode.Restart),
        label = "shimmerX",
    )
    return Brush.linearGradient(
        listOf(Color(0xFF16213A), Color(0xFF25365E), Color(0xFF16213A)),
        start = androidx.compose.ui.geometry.Offset(x, 0f),
        end = androidx.compose.ui.geometry.Offset(x + 400f, 200f),
    )
}

/** Esqueleto de capas enquanto o catálogo carrega: dá sensação de rapidez no lugar de um círculo girando. */
@Composable
fun PosterSkeleton(modifier: Modifier = Modifier, rows: Int = 2) {
    val brush = shimmerBrush()
    val perRow = if (UiMode.phone) 3 else 6
    Column(modifier.fillMaxWidth().padding(8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(rows) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                repeat(perRow) {
                    Box(
                        Modifier
                            .weight(1f)
                            .aspectRatio(2f / 3f)
                            .clip(RoundedCornerShape(14.dp))
                            .background(brush),
                    )
                }
            }
        }
    }
}

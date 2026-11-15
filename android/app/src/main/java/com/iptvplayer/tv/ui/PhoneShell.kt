package com.iptvplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Item
import com.iptvplayer.tv.data.StatusResponse

// ─── Tabs disponíveis no modo phone (5 principais) ─────────────────────────
private val PHONE_TABS = listOf(
    Tab.HOME,
    Tab.LIVE,
    Tab.MOVIES,
    Tab.SERIES,
    Tab.SEARCH,
)

// Ícones unicode para cada tab
private fun tabIcon(tab: Tab, selected: Boolean): String = when (tab) {
    Tab.HOME    -> if (selected) "🏠" else "🏡"
    Tab.LIVE    -> if (selected) "📺" else "📡"
    Tab.MOVIES  -> if (selected) "🎬" else "🎞"
    Tab.SERIES  -> if (selected) "🍿" else "🎭"
    Tab.SEARCH  -> if (selected) "🔍" else "🔎"
    else        -> "●"
}

// ─── Shell principal do celular ─────────────────────────────────────────────
@Composable
fun MainShellPhone(onLogout: () -> Unit = {}) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var detail by remember { mutableStateOf<Item?>(null) }
    var play by remember { mutableStateOf<PlayRequest?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    val app = LocalContext.current.applicationContext as IptvApp

    val status by produceState<StatusResponse?>(null, refresh) {
        value = try { app.api.status() } catch (_: Exception) { null }
    }

    val userInfo = status?.name?.let { name ->
        "$name" + (status?.expiresAt?.let { exp -> " · até " + fmtDate(exp) } ?: "")
    }

    val startPlay: (PlayRequest) -> Unit = { req -> if (req.items.isNotEmpty()) play = req }
    val openItem: (Item) -> Unit = { item ->
        when (item.type) {
            "movie", "series" -> detail = item
            else -> startPlay(PlayRequest(listOf(item), 0))
        }
    }

    BackHandler(enabled = tab != Tab.HOME && detail == null && play == null) { tab = Tab.HOME }

    val overlayActive = detail != null || play != null

    Box(Modifier.fillMaxSize().background(Bg)) {

        // ── Conteúdo principal ──────────────────────────────────────────────
        Column(
            Modifier
                .fillMaxSize()
                .alpha(if (overlayActive) 0f else 1f)
        ) {

            // Cabeçalho elegante com gradiente
            PhoneHeader(
                userInfo = userInfo,
                onFavorites = { tab = Tab.FAVS },
                onGames = { tab = Tab.GAMES },
                onSettings = { tab = Tab.SETTINGS },
            )

            // Área de conteúdo – ocupa todo o espaço restante
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                AnimatedContent(
                    targetState = tab,
                    transitionSpec = {
                        fadeIn(tween(220)) togetherWith fadeOut(tween(180))
                    },
                    label = "phone_tab_content"
                ) { currentTab ->
                    when (currentTab) {
                        Tab.HOME    -> HomeScreen(refresh, openItem, startPlay) { tab = Tab.LIVE }
                        Tab.LIVE    -> BrowseScreen("live", openItem, startPlay)
                        Tab.MOVIES  -> BrowseScreen("movie", openItem, startPlay)
                        Tab.SERIES  -> BrowseScreen("series", openItem, startPlay)
                        Tab.FAVS    -> FavoritesScreen(refresh, openItem, startPlay)
                        Tab.GAMES   -> GamesScreen(startPlay)
                        Tab.SEARCH  -> SearchScreen(openItem, startPlay)
                        Tab.SETTINGS -> SettingsScreen(onLogout)
                    }
                }
            }

            // ── Barra de navegação inferior bonita ──────────────────────────
            PhoneNavBar(
                selected = tab,
                onSelect = { tab = it },
                visible = !overlayActive,
            )
        }

        // ── Overlay de detalhe ──────────────────────────────────────────────
        AnimatedVisibility(
            visible = detail != null && play == null,
            enter = slideInVertically(initialOffsetY = { it / 3 }) + fadeIn(tween(300)),
            exit = slideOutVertically(targetOffsetY = { it / 3 }) + fadeOut(tween(200)),
        ) {
            detail?.let { d ->
                DetailScreen(
                    item = d,
                    enabled = play == null,
                    onBack = { detail = null; refresh++ },
                    onPlay = startPlay,
                )
            }
        }

        // ── Overlay do player ───────────────────────────────────────────────
        AnimatedVisibility(
            visible = play != null,
            enter = scaleIn(initialScale = 0.92f) + fadeIn(tween(250)),
            exit = scaleOut(targetScale = 0.92f) + fadeOut(tween(200)),
        ) {
            play?.let { p ->
                PlayerScreen(p, onClose = { play = null; refresh++ })
            }
        }
    }
}

// ─── Cabeçalho do Phone ─────────────────────────────────────────────────────
@Composable
private fun PhoneHeader(
    userInfo: String?,
    onFavorites: () -> Unit,
    onGames: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(colors = listOf(Color(0xFF111827), Bg)))
            .statusBarsPadding()
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(Brush.horizontalGradient(listOf(Color(0xFF151D2D), Surface1, Color(0xFF11232B))))
                .border(1.dp, Brush.horizontalGradient(listOf(AccentAlt.copy(alpha = 0.5f), Color.White.copy(alpha = 0.08f), Accent.copy(alpha = 0.42f))), RoundedCornerShape(18.dp))
                .padding(horizontal = 7.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(32.dp).clip(RoundedCornerShape(11.dp))
                    .background(Brush.linearGradient(listOf(AccentAlt, Accent))),
                contentAlignment = Alignment.Center,
            ) { Text("▶", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black) }
            Column(Modifier.width(58.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("Box", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
                    Text("Tv", color = Accent, fontSize = 19.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
                }
                Text("CINEMA  •  AO VIVO", color = TextSecondary, fontSize = 7.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, maxLines = 1)
            }
            Spacer(Modifier.weight(1f))
            CastRouteButton()
            PhoneHeaderAction("★", "Favoritos", onFavorites)
            PhoneHeaderAction("⚽", "Jogos", onGames)
            PhoneHeaderAction("⚙", userInfo?.let { "Conta de $it" } ?: "Conta", onSettings)
        }
    }
}

@Composable
private fun PhoneHeaderAction(icon: String, description: String, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Surface1)
            .semantics { contentDescription = description }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(icon, color = Accent, fontSize = 17.sp, fontWeight = FontWeight.Bold)
    }
}

// ─── Barra de navegação inferior ────────────────────────────────────────────
@Composable
private fun PhoneNavBar(
    selected: Tab,
    onSelect: (Tab) -> Unit,
    visible: Boolean,
) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(initialOffsetY = { it }) + fadeIn(tween(300)),
        exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(tween(200)),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0x00000000), Color(0xFF0D0D16)),
                    )
                )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        color = Color(0xFF0D0D16),
                        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                    )
                    .border(
                        width = 1.dp,
                        brush = Brush.horizontalGradient(
                            listOf(
                                Accent.copy(alpha = 0.42f),
                                AccentAlt.copy(alpha = 0.28f),
                                Accent.copy(alpha = 0.42f),
                            )
                        ),
                        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                    )
                    .navigationBarsPadding()
                    .padding(horizontal = 8.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
            ) {
                PHONE_TABS.forEach { tabItem ->
                    PhoneNavItem(
                        tab = tabItem,
                        selected = tabItem == selected,
                        onClick = { onSelect(tabItem) },
                    )
                }
            }
        }
    }
}

// ─── Item individual da barra inferior ──────────────────────────────────────
@Composable
private fun PhoneNavItem(
    tab: Tab,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val iconScale by animateFloatAsState(
        targetValue = if (selected) 1.18f else 1f,
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "icon_scale",
    )
    val labelAlpha by animateFloatAsState(
        targetValue = if (selected) 1f else 0.5f,
        animationSpec = tween(220),
        label = "label_alpha",
    )
    val dotSize by animateDpAsState(
        targetValue = if (selected) 5.dp else 0.dp,
        animationSpec = tween(220, easing = FastOutSlowInEasing),
        label = "dot_size",
    )

    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(14.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // Ícone com glow quando selecionado
            Box(contentAlignment = Alignment.Center) {
                if (selected) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .background(
                                Brush.radialGradient(
                                    listOf(
                                        Accent.copy(alpha = 0.25f),
                                        Color.Transparent,
                                    )
                                ),
                                shape = CircleShape,
                            )
                    )
                }
                Text(
                    text = tabIcon(tab, selected),
                    fontSize = 22.sp,
                    modifier = Modifier.scale(iconScale),
                )
            }

            Spacer(Modifier.height(3.dp))

            // Label
            Text(
                text = tab.label,
                color = if (selected) Accent else TextSecondary,
                fontSize = 10.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                textAlign = TextAlign.Center,
                modifier = Modifier.alpha(labelAlpha),
            )

            // Ponto indicador
            Spacer(Modifier.height(3.dp))
            Box(
                modifier = Modifier
                    .size(dotSize)
                    .background(
                        Brush.radialGradient(listOf(Accent, AccentAlt)),
                        shape = CircleShape,
                    )
            )
        }
    }
}

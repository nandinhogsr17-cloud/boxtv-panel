package com.iptvplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Item
import com.iptvplayer.tv.data.StatusResponse

// ─── Abas do celular: Início · Ao vivo · Filmes · Séries · Futebol ──────────
private val PHONE_TABS = listOf(Tab.HOME, Tab.LIVE, Tab.MOVIES, Tab.SERIES, Tab.GAMES)

private fun phoneLabel(tab: Tab): String = if (tab == Tab.GAMES) "Futebol" else tab.label

private fun phoneIcon(tab: Tab): PhoneIcon = when (tab) {
    Tab.HOME -> PhoneIcon.HOME
    Tab.LIVE -> PhoneIcon.LIVE
    Tab.MOVIES -> PhoneIcon.MOVIES
    Tab.SERIES -> PhoneIcon.SERIES
    Tab.GAMES -> PhoneIcon.SOCCER
    Tab.SEARCH -> PhoneIcon.SEARCH
    Tab.FAVS -> PhoneIcon.STAR
    Tab.SETTINGS -> PhoneIcon.HOME
}

private fun phoneTitle(tab: Tab): String = when (tab) {
    Tab.FAVS -> "Favoritos"
    Tab.SETTINGS -> "Conta"
    Tab.SEARCH -> "Buscar"
    Tab.GAMES -> "Futebol"
    else -> tab.label
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

    val startPlay: (PlayRequest) -> Unit = { req -> if (req.items.isNotEmpty()) play = req }
    val openItem: (Item) -> Unit = { item ->
        when (item.type) {
            "movie", "series" -> detail = item
            else -> startPlay(PlayRequest(listOf(item), 0))
        }
    }

    BackHandler(enabled = tab != Tab.HOME && detail == null && play == null) { tab = Tab.HOME }

    val overlayActive = detail != null || play != null

    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.verticalGradient(listOf(Bg, Color(0xFF0B1B3C))))
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .alpha(if (overlayActive) 0f else 1f)
        ) {
            PhoneHeader(
                title = if (tab == Tab.HOME) null else phoneTitle(tab),
                userName = status?.name,
                onSearch = { tab = Tab.SEARCH },
                onFavorites = { tab = Tab.FAVS },
                onAccount = { tab = Tab.SETTINGS },
            )

            Box(Modifier.weight(1f).fillMaxWidth()) {
                AnimatedContent(
                    targetState = tab,
                    transitionSpec = { fadeIn(tween(220)) togetherWith fadeOut(tween(180)) },
                    label = "phone_tab_content",
                ) { currentTab ->
                    when (currentTab) {
                        Tab.HOME -> HomeScreen(refresh, openItem, startPlay, { tab = Tab.GAMES }, onSearch = { tab = Tab.SEARCH })
                        Tab.LIVE -> BrowseScreen("live", openItem, startPlay)
                        Tab.MOVIES -> BrowseScreen("movie", openItem, startPlay)
                        Tab.SERIES -> BrowseScreen("series", openItem, startPlay)
                        Tab.FAVS -> FavoritesScreen(refresh, openItem, startPlay)
                        Tab.GAMES -> GamesScreen(startPlay)
                        Tab.SEARCH -> SearchScreen(openItem, startPlay)
                        Tab.SETTINGS -> SettingsScreen(onLogout)
                    }
                }
            }

            PhoneNavBar(selected = tab, onSelect = { tab = it }, visible = !overlayActive)
        }

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

// ─── Cabeçalho: marca/título à esquerda; busca, favoritos e conta à direita ─
@Composable
private fun PhoneHeader(
    title: String?,
    userName: String?,
    onSearch: () -> Unit,
    onFavorites: () -> Unit,
    onAccount: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (title == null) {
            Box(
                Modifier.size(34.dp).clip(RoundedCornerShape(11.dp))
                    .background(Brush.linearGradient(listOf(AccentAlt, Accent))),
                contentAlignment = Alignment.Center,
            ) { Text("▶", color = OnAccent, fontSize = 14.sp, fontWeight = FontWeight.Black) }
            Spacer(Modifier.width(10.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text("Box", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
                Text("Tv", color = Accent, fontSize = 22.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp)
            }
        } else {
            Text(title, color = TextPrimary, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.weight(1f))
        HeaderIcon(PhoneIcon.SEARCH, "Buscar", onSearch)
        Spacer(Modifier.width(6.dp))
        HeaderIcon(PhoneIcon.STAR, "Favoritos", onFavorites)
        Spacer(Modifier.width(8.dp))
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(Brush.linearGradient(listOf(Surface2, Surface1)))
                .border(2.dp, Accent.copy(alpha = 0.7f), CircleShape)
                .semantics { contentDescription = userName?.let { "Conta de $it" } ?: "Conta" }
                .clickable(onClick = onAccount),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                (userName?.trim()?.firstOrNull()?.uppercase() ?: "B"),
                color = Accent,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun HeaderIcon(icon: PhoneIcon, description: String, onClick: () -> Unit) {
    Box(
        Modifier
            .size(44.dp)
            .clip(CircleShape)
            .semantics { contentDescription = description }
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { PhoneIconView(icon, Color.White, size = 26.dp) }
}

// ─── Barra inferior ─────────────────────────────────────────────────────────
@Composable
private fun PhoneNavBar(selected: Tab, onSelect: (Tab) -> Unit, visible: Boolean) {
    AnimatedVisibility(
        visible = visible,
        enter = slideInVertically(initialOffsetY = { it }) + fadeIn(tween(300)),
        exit = slideOutVertically(targetOffsetY = { it }) + fadeOut(tween(200)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF080F20))
                .border(1.dp, Color.White.copy(alpha = 0.06f))
                .navigationBarsPadding()
                .padding(horizontal = 6.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PHONE_TABS.forEach { t ->
                PhoneNavItem(t, selected = t == selected, onClick = { onSelect(t) })
            }
        }
    }
}

@Composable
private fun PhoneNavItem(tab: Tab, selected: Boolean, onClick: () -> Unit) {
    val tint = if (selected) Accent else TextSecondary
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(22.dp))
            .then(if (selected) Modifier.background(Accent.copy(alpha = 0.16f)) else Modifier)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = if (selected) 18.dp else 12.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        PhoneIconView(phoneIcon(tab), tint, size = 28.dp)
        Spacer(Modifier.height(3.dp))
        Text(
            text = phoneLabel(tab),
            color = tint,
            fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
        )
    }
}

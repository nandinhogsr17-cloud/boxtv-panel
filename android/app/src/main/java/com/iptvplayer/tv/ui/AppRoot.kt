package com.iptvplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.BuildConfig
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.DeviceIdentity
import com.iptvplayer.tv.data.Item
import com.iptvplayer.tv.data.StatusResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

enum class Tab(val label: String) {
    HOME("Início"),
    LIVE("Ao Vivo"),
    MOVIES("Filmes"),
    SERIES("Séries"),
    FAVS("Favoritos"),
    GAMES("Jogos"),
    SEARCH("Buscar"),
    SETTINGS("Conta"),
}

data class PlayRequest(
    val items: List<Item>,
    val index: Int = 0,
    val heading: String? = null,
)

sealed interface Gate {
    data object Loading : Gate
    data class NotActive(val status: String, val expiresAt: Long?) : Gate
    data object Ready : Gate
}

@Composable
fun AppRoot() {
    val isTv = rememberIsTv()
    var gate by remember { mutableStateOf<Gate>(Gate.Loading) }
    val loadingStatus = "Conectando ao BoxTv..."

    val context = LocalContext.current
    val rootApp = context.applicationContext as IptvApp

    LaunchedEffect(Unit) {
        // Sem código de ativação: a autenticação é a conta Xtream. Se já há login salvo, entra sozinho.
        val started = System.currentTimeMillis()
        val (user, pass) = withContext(Dispatchers.IO) { DeviceIdentity.getAuth(context) }
        var ok = false
        if (!user.isNullOrBlank() && !pass.isNullOrBlank()) {
            ok = try {
                rootApp.api.login(user, pass, serverHost = DeviceIdentity.getXtreamHost(context, BuildConfig.XTREAM_URL))
                true
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                false
            }
        }
        val left = 900 - (System.currentTimeMillis() - started)
        if (left > 0) delay(left)
        gate = if (ok) Gate.Ready else Gate.NotActive("login", null)
    }

    val logout: () -> Unit = {
        DeviceIdentity.clearAuth(context)
        gate = Gate.NotActive("login", null)
    }

    when (val g = gate) {
        is Gate.Loading -> SplashScreen(statusText = loadingStatus)
        is Gate.NotActive -> {
            // Vai direto para LoginScreen — sistema Xtream puro sem código de ativação
            LoginScreen(
                status = g.status,
                expiresAt = g.expiresAt,
                onSuccess = { gate = Gate.Ready },
            )
        }
        is Gate.Ready -> if (isTv) MainShell(onLogout = logout) else MainShellPhone(onLogout = logout)
    }
}

@Composable
fun MainShell(onLogout: () -> Unit = {}) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var detail by remember { mutableStateOf<Item?>(null) }
    var play by remember { mutableStateOf<PlayRequest?>(null) }
    var refresh by remember { mutableIntStateOf(0) }
    val app = LocalContext.current.applicationContext as IptvApp

    val status by produceState<StatusResponse?>(null, refresh) {
        value = try {
            app.api.status()
        } catch (_: Exception) {
            null
        }
    }

    val userInfo = status?.name?.let { name ->
        "👤 $name" + (status?.expiresAt?.let { exp -> " · até " + fmtDate(exp) } ?: "")
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

    val tabFocus = remember { FocusRequester() }
    LaunchedEffect(overlayActive) {
        if (overlayActive) return@LaunchedEffect
        delay(80)
        try {
            tabFocus.requestFocus()
        } catch (_: Exception) {}
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier
                .fillMaxSize()
                .alpha(if (overlayActive) 0f else 1f)
                .focusProperties { canFocus = !overlayActive }
        ) {
            TopTabs(tab, tabFocus, userInfo = userInfo) { tab = it }
            Box(Modifier.weight(1f)) {
                when (tab) {
                    Tab.HOME -> HomeScreen(refresh, openItem, startPlay) { tab = Tab.GAMES }
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

        detail?.let { d ->
            DetailScreen(
                item = d,
                enabled = play == null,
                onBack = { detail = null; refresh++ },
                onPlay = startPlay,
            )
        }
        play?.let { p ->
            PlayerScreen(p, onClose = { play = null; refresh++ })
        }
    }
}

@Composable
fun TopTabs(
    selected: Tab,
    selectedFocus: FocusRequester,
    userInfo: String?,
    onSelect: (Tab) -> Unit,
) {
    var pending by remember { mutableStateOf(selected) }
    LaunchedEffect(selected) { pending = selected }
    LaunchedEffect(pending) {
        if (pending != selected) {
            delay(250)
            onSelect(pending)
        }
    }
    Column(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(Color(0xFF101625), Bg, Color(0xFF101B22))))) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 48.dp, vertical = 11.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(end = 10.dp)) {
                Box(
                    Modifier.size(38.dp).clip(RoundedCornerShape(12.dp))
                        .background(Brush.linearGradient(listOf(AccentAlt, Accent)))
                        .border(1.dp, Color.White.copy(alpha = 0.22f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("▶", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Black)
                }
                Column {
                    Text("BoxTv", color = TextPrimary, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 19.sp)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Box(Modifier.size(5.dp).background(Accent, CircleShape))
                        Text("TV  •  ESPORTES", color = TextSecondary, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
                    }
                }
            }
            Box(Modifier.width(1.dp).height(30.dp).background(Brush.verticalGradient(listOf(Color.Transparent, Accent.copy(alpha = 0.7f), Color.Transparent))))
            Spacer(Modifier.width(4.dp))
            Tab.values().forEach { t ->
                Pill(
                    text = t.label,
                    selected = t == selected,
                    onClick = { onSelect(t) },
                    modifier = if (t == selected) Modifier.focusRequester(selectedFocus) else Modifier,
                    onFocused = { pending = t },
                )
            }
            if (!userInfo.isNullOrBlank()) {
                Spacer(Modifier.weight(1f))
                Row(
                    Modifier.clip(RoundedCornerShape(50)).background(Color(0x66111A28)).padding(horizontal = 13.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(7.dp).background(Accent, CircleShape))
                    Spacer(Modifier.width(8.dp))
                    Text(userInfo, color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, AccentAlt.copy(alpha = 0.55f), Accent.copy(alpha = 0.45f), Color.Transparent))))
    }
}

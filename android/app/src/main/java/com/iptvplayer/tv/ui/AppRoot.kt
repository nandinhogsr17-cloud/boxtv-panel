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
import androidx.compose.foundation.layout.fillMaxHeight
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
    UiMode.phone = !isTv // layout de celular; a paleta dourada vale para os dois
    var gate by remember { mutableStateOf<Gate>(Gate.Loading) }
    val loadingStatus = "Conectando ao BoxTv..."

    val context = LocalContext.current
    val rootApp = context.applicationContext as IptvApp

    LaunchedEffect(Unit) {
        // Sem código de ativação: a autenticação é a conta Xtream. Se já há login salvo, entra sozinho.
        rootApp.api.setHideAdult(com.iptvplayer.tv.data.AdultLock.hidden(context))
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
        com.iptvplayer.tv.data.AdultLock.unlocked = false
        rootApp.api.setHideAdult(com.iptvplayer.tv.data.AdultLock.hidden(context))
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

/** Diagnóstico da TV: estado do carregamento do Início, mostrado em texto pequeno no canto. */
object TvDiag {
    var home by mutableStateOf("-")
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

    val ctx = LocalContext.current

    // Servidor único: confere a cada 10 min se o servidor foi trocado no painel e, se foi, passa a usar o novo.
    LaunchedEffect(Unit) {
        delay(3000)
        while (true) {
            try {
                val novo = app.api.syncServer(ctx)
                if (novo != null) {
                    refresh++
                    android.widget.Toast.makeText(ctx, "Servidor atualizado", android.widget.Toast.LENGTH_LONG).show()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
            delay(10 * 60_000L)
        }
    }

    // Opção "Abrir no último canal": ao entrar, retoma o canal ao vivo anterior com a lista da categoria para trocar com ▲ ▼
    LaunchedEffect(Unit) {
        try {
            if (!com.iptvplayer.tv.data.AppPreferences.read(ctx).reopenLastChannel) return@LaunchedEffect
            val id = com.iptvplayer.tv.data.LastChannel.id(ctx) ?: return@LaunchedEffect
            val group = com.iptvplayer.tv.data.LastChannel.group(ctx)
            val list = app.api.browse("live", group, null, 0, 3000).items
            val idx = list.indexOfFirst { it.id == id }
            if (idx >= 0 && play == null) play = PlayRequest(list, idx, group)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
    }

    val overlayActive = detail != null || play != null

    val tabFocus = remember { FocusRequester() }
    LaunchedEffect(overlayActive) {
        if (overlayActive) return@LaunchedEffect
        delay(80)
        try {
            tabFocus.requestFocus()
        } catch (_: Exception) {}
    }

    var pendingTab by remember { mutableStateOf(tab) }
    LaunchedEffect(tab) { pendingTab = tab }
    LaunchedEffect(pendingTab) {
        if (pendingTab != tab) {
            delay(250)
            tab = pendingTab
        }
    }

    Box(Modifier.fillMaxSize()) {
        Row(
            Modifier
                .fillMaxSize()
                .alpha(if (overlayActive) 0f else 1f)
                .focusProperties { canFocus = !overlayActive }
        ) {
            TvRail(tab, tabFocus, onSelect = { tab = it }, onFocusTab = { pendingTab = it })
            Column(Modifier.weight(1f).fillMaxHeight()) {
                TvTopBar(title = null, userInfo = userInfo)
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    when (tab) {
                        Tab.HOME -> HomeScreen(refresh, openItem, startPlay, onGames = { tab = Tab.GAMES })
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


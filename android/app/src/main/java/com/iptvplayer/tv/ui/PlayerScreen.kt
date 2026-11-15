@file:OptIn(androidx.media3.common.util.UnstableApi::class)

package com.iptvplayer.tv.ui

import android.content.Context
import android.view.ViewGroup
import java.util.Locale
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.iptvplayer.tv.BuildConfig
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.CastMedia
import com.iptvplayer.tv.data.AppPreferences
import com.iptvplayer.tv.data.AppSettings
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private fun buildPlayer(context: Context, settings: AppSettings): ExoPlayer {
    val http = DefaultHttpDataSource.Factory()
        .setUserAgent(BuildConfig.STREAM_UA)
        .setAllowCrossProtocolRedirects(true)
        .setConnectTimeoutMs(15_000)
        .setReadTimeoutMs(20_000)
    // IPTV costuma entregar MPEG-TS "cru": estas opções deixam o TS mais tolerante.
    val extractors = DefaultExtractorsFactory()
        .setTsExtractorFlags(
            DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES or
                DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS
        )
        .setConstantBitrateSeekingEnabled(true)
    val sources = DefaultMediaSourceFactory(http, extractors)
    val renderers = DefaultRenderersFactory(context).setEnableDecoderFallback(settings.decoderFallback)
    val trackSelector = DefaultTrackSelector(context)
    val trackParameters = trackSelector.buildUponParameters()
    when (settings.videoQuality) {
        "1080" -> trackParameters.setMaxVideoSize(1920, 1080)
        "720" -> trackParameters.setMaxVideoSize(1280, 720)
        "480" -> trackParameters.setMaxVideoSize(854, 480)
    }
    if (settings.audioLanguage != "auto") {
        trackParameters.setPreferredAudioLanguage(settings.audioLanguage)
    }
    if (settings.subtitleLanguage == "off") {
        trackParameters.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
    } else {
        trackParameters.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
        trackParameters.setPreferredTextLanguage(
            if (settings.subtitleLanguage == "auto") Locale.getDefault().toLanguageTag() else settings.subtitleLanguage
        )
    }
    trackSelector.parameters = trackParameters.build()
    val bufferDurations = when (settings.bufferMode) {
        "fast" -> intArrayOf(10_000, 30_000, 1_500, 3_000)
        "stable" -> intArrayOf(30_000, 75_000, 3_000, 7_000)
        else -> intArrayOf(20_000, 60_000, 2_500, 5_000)
    }
    val load = DefaultLoadControl.Builder()
        .setBufferDurationsMs(bufferDurations[0], bufferDurations[1], bufferDurations[2], bufferDurations[3])
        .build()
    return ExoPlayer.Builder(context, renderers)
        .setMediaSourceFactory(sources)
        .setTrackSelector(trackSelector)
        .setLoadControl(load)
        .build()
}

/**
 * Player em tela cheia, com controles próprios para o controle remoto:
 *  - Canais: ▲/▼ (ou CH+/CH-) trocam de canal; MENU favorita.
 *  - Filmes/episódios: OK pausa/continua, ◀/▶ voltam/avançam 10 s; o progresso é salvo no painel
 *    a cada 15 s e ao sair; no fim de um episódio, toca o próximo.
 */
@Composable
fun PlayerScreen(request: PlayRequest, onClose: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as IptvApp
    val settings = remember { AppPreferences.read(context) }
    val castContext = remember(context) { runCatching { CastContext.getSharedInstance(context) }.getOrNull() }
    BackHandler(onBack = onClose)

    var queue by remember { mutableStateOf(request.items) }
    var heading by remember { mutableStateOf(request.heading) }
    var index by remember { mutableIntStateOf(request.index.coerceIn(0, (request.items.size - 1).coerceAtLeast(0))) }
    val current = queue[index]
    val currentState = rememberUpdatedState(current)

    val exo = remember { buildPlayer(context, settings) }
    val bgScope = remember { CoroutineScope(SupervisorJob() + Dispatchers.IO) }

    var errorMsg by remember { mutableStateOf<String?>(null) }
    var errorTick by remember { mutableIntStateOf(0) }
    var endedTick by remember { mutableIntStateOf(0) }
    var retries by remember { mutableIntStateOf(0) }
    var buffering by remember { mutableStateOf(true) }
    var playing by remember { mutableStateOf(false) }
    var casting by remember { mutableStateOf(false) }
    var castPlaying by remember { mutableStateOf(false) }
    var castDeviceName by remember { mutableStateOf<String?>(null) }
    var castError by remember { mutableStateOf<String?>(null) }
    var posMs by remember { mutableLongStateOf(0L) }
    var durMs by remember { mutableLongStateOf(0L) }
    var uiTick by remember { mutableIntStateOf(0) }
    var showUi by remember { mutableStateOf(true) }
    var fav by remember(current.id) { mutableStateOf(current.favorite) }
    var epgData by remember(current.id) { mutableStateOf<com.iptvplayer.tv.data.EpgData?>(null) }
    val focus = remember { FocusRequester() }

    DisposableEffect(exo) {
        val listener = object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                playing = isPlaying
                if (isPlaying) {
                    errorMsg = null
                    retries = 0
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING
                if (playbackState == Player.STATE_ENDED) endedTick++
            }

            override fun onPlayerError(error: PlaybackException) {
                errorTick++
            }
        }
        exo.addListener(listener)
        onDispose {
            exo.removeListener(listener)
            // Salva onde parou antes de fechar.
            val c = currentState.value
            val remote = castContext?.sessionManager?.currentCastSession?.remoteMediaClient
            val d = if (casting && remote != null) remote.streamDuration else exo.duration
            val p = if (casting && remote != null) remote.approximateStreamPosition else exo.currentPosition
            if (settings.resumePlayback && !c.isLive && d > 0 && d != C.TIME_UNSET) {
                bgScope.launch { runCatching { app.api.saveProgress(c.id, p, d) } }
            }
            exo.release()
        }
    }

    fun sendCurrentToCast(session: CastSession) {
        castError = null
        val accepted = CastMedia.send(session, current, posMs) { success, statusCode ->
            if (success) {
                castDeviceName = session.castDevice?.friendlyName ?: "Sua TV"
                casting = true
                exo.pause()
            } else {
                casting = false
                castError = "A TV não conseguiu abrir este formato de transmissão (código $statusCode)."
            }
        }
        if (!accepted) {
            casting = false
            castError = "Este vídeo não possui um endereço válido para transmitir."
        }
    }

    DisposableEffect(castContext, current.id) {
        val manager = castContext?.sessionManager
        if (manager == null) {
            onDispose { }
        } else {
            fun finishCast(session: CastSession) {
                if (casting) {
                    val remotePosition = session.remoteMediaClient?.approximateStreamPosition ?: 0L
                    castDeviceName = null
                    casting = false
                    if (!current.isLive && remotePosition > 0L) exo.seekTo(remotePosition)
                    exo.playWhenReady = true
                }
            }

            val listener = object : SessionManagerListener<CastSession> {
                override fun onSessionStarting(session: CastSession) = Unit
                override fun onSessionStarted(session: CastSession, sessionId: String) { sendCurrentToCast(session) }
                override fun onSessionStartFailed(session: CastSession, error: Int) {
                    casting = false
                    castError = "Não foi possível iniciar a transmissão (código $error)."
                }
                override fun onSessionEnding(session: CastSession) = Unit
                override fun onSessionEnded(session: CastSession, error: Int) { finishCast(session) }
                override fun onSessionResuming(session: CastSession, sessionId: String) = Unit
                override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) { sendCurrentToCast(session) }
                override fun onSessionResumeFailed(session: CastSession, error: Int) {
                    finishCast(session)
                    castError = "A conexão com a TV foi interrompida. O vídeo continua no celular."
                }
                override fun onSessionSuspended(session: CastSession, reason: Int) = Unit
            }
            manager.addSessionManagerListener(listener, CastSession::class.java)
            manager.currentCastSession?.let { sendCurrentToCast(it) }
            onDispose { manager.removeSessionManagerListener(listener, CastSession::class.java) }
        }
    }
    // Troca o que está tocando sempre que o item atual muda (canal novo, próximo episódio...).
    LaunchedEffect(current.id) {
        errorMsg = null
        retries = 0
        buffering = true
        epgData = null
        val url = current.url
        if (url.isNullOrBlank()) {
            errorMsg = "Endereço de vídeo indisponível."
            return@LaunchedEffect
        }
        val mediaItem = MediaItem.Builder()
            .setUri(url)
            .apply { if (url.contains(".m3u8", ignoreCase = true)) setMimeType(MimeTypes.APPLICATION_M3U8) }
            .build()
        val resumeAt = if (
            settings.resumePlayback &&
            !current.isLive && current.durationMs > 0 &&
            current.positionMs > 30_000 && current.positionMs < current.durationMs * 0.95
        ) current.positionMs else 0L
        exo.setMediaItem(mediaItem, resumeAt)
        exo.prepare()
        exo.playWhenReady = true

        if (current.isLive) {
            bgScope.launch {
                runCatching {
                    val resp = app.api.epg(current.id)
                    epgData = resp.epg
                }
            }
        }
    }

    // Erro: canais tentam reconectar até 5 vezes.
    LaunchedEffect(errorTick) {
        if (errorTick == 0) return@LaunchedEffect
        if (current.isLive && retries < 5) {
            retries++
            errorMsg = "Reconectando… ($retries/5)"
            delay(3000)
            exo.prepare()
        } else {
            errorMsg = if (current.isLive) "Canal indisponível. Use ▲ ▼ para trocar de canal."
            else "Não foi possível reproduzir este vídeo."
        }
    }

    // Fim do vídeo: próximo da fila, ou próximo episódio da série, ou fecha.
    LaunchedEffect(endedTick) {
        if (endedTick == 0) return@LaunchedEffect
        val c = current
        if (c.isLive) return@LaunchedEffect
        val dur = exo.duration.coerceAtLeast(0)
        if (settings.resumePlayback) runCatching { app.api.saveProgress(c.id, dur, dur) }
        if (c.type == "episode" && !settings.autoNextEpisode) {
            onClose()
            return@LaunchedEffect
        }
        if (index + 1 < queue.size) {
            index += 1
            return@LaunchedEffect
        }
        val sid = c.seriesId
        if (c.type == "episode" && sid != null) {
            val s = runCatching { app.api.series(sid) }.getOrNull()
            val flat = s?.seasons?.flatMap { it.episodes }.orEmpty()
            val i = flat.indexOfFirst { it.id == c.id }
            if (s != null && i >= 0 && i + 1 < flat.size) {
                queue = flat
                heading = s.title
                index = i + 1
                return@LaunchedEffect
            }
        }
        onClose()
    }

    // Relógio da barra de progresso.
    LaunchedEffect(Unit) {
        while (true) {
            val remote = castContext?.sessionManager?.currentCastSession?.remoteMediaClient
            val isRemote = casting && remote != null
            if (isRemote) castPlaying = remote!!.isPlaying
            posMs = (if (isRemote) remote!!.approximateStreamPosition else exo.currentPosition).coerceAtLeast(0L)
            val d = if (isRemote) remote!!.streamDuration else exo.duration
            durMs = if (d == C.TIME_UNSET || d < 0) 0L else d
            delay(500)
        }
    }

    // Salva o progresso a cada 15 s (filmes e episódios).
    LaunchedEffect(current.id) {
        if (current.isLive || !settings.resumePlayback) return@LaunchedEffect
        while (true) {
            delay(15_000)
            val remote = castContext?.sessionManager?.currentCastSession?.remoteMediaClient
            val isRemote = casting && remote != null
            val d = if (isRemote) remote!!.streamDuration else exo.duration
            val p = if (isRemote) remote!!.approximateStreamPosition else exo.currentPosition
            if ((if (isRemote) remote!!.isPlaying else exo.isPlaying) && d > 0) {
                runCatching { app.api.saveProgress(current.id, p, d) }
            }
        }
    }

    // Esconde os controles depois de 4 s sem apertar nada.
    LaunchedEffect(uiTick) {
        showUi = true
        delay(4000)
        if (playing) showUi = false
    }

    LaunchedEffect(Unit) {
        try {
            focus.requestFocus()
        } catch (e: Exception) {
            // ignorado: a tela ainda estava montando
        }
    }

    fun step(delta: Int) {
        if (queue.size < 2) return
        index = if (current.isLive) (index + delta + queue.size) % queue.size
        else (index + delta).coerceIn(0, queue.size - 1)
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(focus)
            .focusable()
            .onPreviewKeyEvent { ev ->
                if (ev.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                uiTick++
                when (ev.key) {
                    Key.DirectionCenter, Key.Enter, Key.NumPadEnter, Key.MediaPlayPause -> {
                        if (casting) castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.togglePlayback()
                        else if (exo.isPlaying) exo.pause() else exo.play()
                        true
                    }
                    Key.MediaPlay -> {
                        if (casting) castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.play() else exo.play()
                        true
                    }
                    Key.MediaPause -> {
                        if (casting) castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.pause() else exo.pause()
                        true
                    }
                    Key.DirectionLeft, Key.MediaRewind -> {
                        if (!current.isLive) {
                            if (casting) {
                                castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.let { remote ->
                                    remote.seek((remote.approximateStreamPosition - settings.skipSeconds * 1_000L).coerceAtLeast(0))
                                }
                            } else exo.seekTo((exo.currentPosition - settings.skipSeconds * 1_000L).coerceAtLeast(0))
                        }
                        true
                    }
                    Key.DirectionRight, Key.MediaFastForward -> {
                        if (!current.isLive) {
                            if (casting) {
                                castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.let { remote ->
                                    val target = remote.approximateStreamPosition + settings.skipSeconds * 1_000L
                                    val duration = remote.streamDuration
                                    remote.seek(if (duration > 0) target.coerceAtMost(duration) else target)
                                }
                            } else {
                                val d = exo.duration
                                val target = exo.currentPosition + settings.skipSeconds * 1_000L
                                exo.seekTo(if (d > 0 && d != C.TIME_UNSET) target.coerceAtMost(d) else target)
                            }
                        }
                        true
                    }
                    Key.DirectionUp, Key.ChannelUp -> {
                        if (current.isLive) step(-1)
                        true
                    }
                    Key.DirectionDown, Key.ChannelDown -> {
                        if (current.isLive) step(1)
                        true
                    }
                    Key.MediaPrevious -> {
                        step(-1)
                        true
                    }
                    Key.MediaNext -> {
                        step(1)
                        true
                    }
                    Key.Menu -> {
                        if (current.type == "live" || current.type == "movie") {
                            val newFav = !fav
                            fav = newFav
                            val id = current.id
                            bgScope.launch {
                                runCatching { if (newFav) app.api.addFavorite(id) else app.api.removeFavorite(id) }
                            }
                        }
                        true
                    }
                    else -> false
                }
            }
    ) {
        if (casting) {
            Column(
                Modifier.fillMaxSize().background(Color(0xE6080D16)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Box(Modifier.size(84.dp).background(Brush.linearGradient(listOf(AccentAlt, Accent)), RoundedCornerShape(26.dp)), contentAlignment = Alignment.Center) {
                    Text("TV", color = Color.White, fontSize = 27.sp, fontWeight = FontWeight.Black)
                }
                Spacer(Modifier.height(22.dp))
                Text("TRANSMITINDO PARA", color = Accent, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
                Spacer(Modifier.height(7.dp))
                Text(castDeviceName ?: "Sua TV", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                Text(current.title, color = TextSecondary, fontSize = 16.sp, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 28.dp))
                Spacer(Modifier.height(24.dp))
                if (!current.isLive) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp)) {
                        ProgressBar(if (durMs > 0) posMs.toFloat() / durMs else 0f)
                        Spacer(Modifier.height(7.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(fmtTime(posMs), color = Color.White, fontSize = 12.sp)
                            Text(if (durMs > 0) fmtTime(durMs) else "--:--", color = TextSecondary, fontSize = 12.sp)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (!current.isLive) {
                        ActionButton(
                            text = "−${settings.skipSeconds}s",
                            onClick = { castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.let { remote ->
                                remote.seek((remote.approximateStreamPosition - settings.skipSeconds * 1_000L).coerceAtLeast(0L))
                            } },
                        )
                    }
                    ActionButton(
                        text = if (castPlaying) "⏸ Pausar na TV" else "▶ Continuar na TV",
                        onClick = { castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.togglePlayback() },
                        primary = true,
                    )
                    if (!current.isLive) {
                        ActionButton(
                            text = "+${settings.skipSeconds}s",
                            onClick = { castContext?.sessionManager?.currentCastSession?.remoteMediaClient?.let { remote ->
                                val target = remote.approximateStreamPosition + settings.skipSeconds * 1_000L
                                val duration = remote.streamDuration
                                remote.seek(if (duration > 0) target.coerceAtMost(duration) else target)
                            } },
                        )
                    }
                    ActionButton(
                        text = "Voltar ao celular",
                        onClick = { castContext?.sessionManager?.endCurrentSession(true) },
                    )
                }
            }
        }

        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    resizeMode = when (settings.aspectRatio) {
                        "fill" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                        "zoom" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                        else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                    }
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    keepScreenOn = true
                    isFocusable = false
                    isFocusableInTouchMode = false
                    descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
                    player = exo
                }
            },
            modifier = Modifier.fillMaxSize().alpha(if (casting) 0f else 1f),
        )

        if (buffering && errorMsg == null && !casting) {
            CircularProgressIndicator(Modifier.align(Alignment.Center), color = Accent)
        }
        if (!playing && !buffering && errorMsg == null && !current.isLive && !casting) {
            Text("❚❚", color = Color.White, fontSize = 48.sp, modifier = Modifier.align(Alignment.Center))
        }
        errorMsg?.let { msg ->
            Text(
                msg,
                color = Color.White,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(Alignment.Center)
                    .background(Color(0xCC000000), RoundedCornerShape(10.dp))
                    .padding(horizontal = 20.dp, vertical = 14.dp),
            )
        }

        if (showUi && !casting) {
            Column(
                Modifier
                    .align(Alignment.TopStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(0f to Color(0xCC000000), 1f to Color.Transparent))
                    .padding(horizontal = 36.dp, vertical = 22.dp)
            ) {
                val title = current.displayTitle(heading)
                Text(
                    if (current.isLive && queue.size > 1) "${index + 1}/${queue.size}   $title" else title,
                    color = Color.White,
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                val sub = listOfNotNull(
                    current.group.takeIf { current.isLive && it.isNotBlank() },
                    if (fav) "★ nos favoritos" else null,
                ).joinToString("   ")
                if (sub.isNotBlank()) Text(sub, color = Color(0xFFCCCCCC), fontSize = 13.sp)

                // Informações de EPG (programação no ar e a seguir)
                epgData?.current?.let { nowProg ->
                    Spacer(Modifier.height(6.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            "🔴 NO AR",
                            color = Color(0xFFEF4444),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                        )
                        val period = if (nowProg.startMs > 0 && nowProg.stopMs > 0)
                            " (${fmtHour(nowProg.startMs)} - ${fmtHour(nowProg.stopMs)})" else ""
                        Text(
                            "${nowProg.title}$period",
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (nowProg.progress > 0f) {
                        Spacer(Modifier.height(4.dp))
                        Box(Modifier.width(220.dp)) {
                            ProgressBar(nowProg.progress)
                        }
                    }
                    if (nowProg.desc.isNotBlank()) {
                        Spacer(Modifier.height(3.dp))
                        Text(
                            nowProg.desc,
                            color = Color(0xFFBBBBBB),
                            fontSize = 12.sp,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    epgData?.next?.let { nextProg ->
                        if (nextProg.title.isNotBlank()) {
                            Spacer(Modifier.height(4.dp))
                            val nextTime = if (nextProg.startMs > 0) " (${fmtHour(nextProg.startMs)})" else ""
                            Text(
                                "A SEGUIR: ${nextProg.title}$nextTime",
                                color = Color(0xFF999999),
                                fontSize = 12.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(0f to Color.Transparent, 1f to Color(0xCC000000)))
                    .padding(horizontal = 36.dp, vertical = 24.dp)
            ) {
                if (current.isLive) {
                    Text(
                        "▲ ▼ trocar canal     MENU favoritar     VOLTAR sair",
                        color = Color(0xFFCCCCCC),
                        fontSize = 13.sp,
                    )
                } else {
                    ProgressBar(if (durMs > 0) posMs.toFloat() / durMs else 0f)
                    Spacer(Modifier.height(6.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(fmtTime(posMs), color = Color.White, fontSize = 13.sp)
                        Text("◀ ▶ ±${settings.skipSeconds} s     OK pausa", color = Color(0xFFCCCCCC), fontSize = 13.sp)
                        Text(if (durMs > 0) fmtTime(durMs) else "--:--", color = Color.White, fontSize = 13.sp)
                    }
                }
            }
        }

        if (!casting) {
            CastRouteButton(Modifier.align(Alignment.TopEnd).padding(22.dp))
        }
        castError?.let { message ->
            Text(
                message,
                color = Color.White,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 96.dp)
                    .background(Color(0xDD431D2B), RoundedCornerShape(12.dp))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            )
        }
    }
}

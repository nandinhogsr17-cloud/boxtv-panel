package com.iptvplayer.tv.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.focusGroup
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.mutableIntStateOf
import com.iptvplayer.tv.data.AdultLock
import com.iptvplayer.tv.data.DeviceIdentity
import com.iptvplayer.tv.data.CrashLog
import com.iptvplayer.tv.data.AccountResponse
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.BuildConfig
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.AppPreferences
import com.iptvplayer.tv.data.AppSettings
import com.iptvplayer.tv.data.StatusResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

private data class PreferenceChoice(val value: String, val label: String)

@Composable
fun SettingsScreen(onLogout: () -> Unit = {}) {
    val context = LocalContext.current
    val app = context.applicationContext as IptvApp
    val isTv = rememberIsTv()
    val sidePadding = if (isTv) 52.dp else 20.dp
    val scope = rememberCoroutineScope()
    var settings by remember { mutableStateOf(AppPreferences.read(context)) }
    var notice by remember { mutableStateOf<String?>(null) }
    var settingsNotice by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var adultTick by remember { mutableIntStateOf(0) }
    val account by produceState<AccountResponse?>(null) {
        value = try {
            app.api.account()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }
    val status by produceState<StatusResponse?>(null) {
        value = try {
            app.api.status()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    fun save(next: AppSettings) {
        settings = next
        AppPreferences.save(context, next)
        notice = null
        settingsNotice = "Preferências salvas neste aparelho."
    }

    var sheet by remember { mutableStateOf<String?>(null) }
    val closeFocus = remember { FocusRequester() }
    BackHandler(enabled = sheet != null) { sheet = null }
    val listFocus = remember { FocusRequester() }
    var sheetWasOpen by remember { mutableStateOf(false) }
    LaunchedEffect(sheet) {
        if (sheet != null) {
            sheetWasOpen = true
            delay(80)
            try { closeFocus.requestFocus() } catch (_: Exception) {}
        } else if (sheetWasOpen) {
            // Fechou a janela: devolve o foco do controle para a lista (senão o D-pad "some")
            delay(80)
            try { listFocus.requestFocus() } catch (_: Exception) {}
        }
    }

    fun refreshCatalog() {
        if (refreshing) return
        scope.launch {
            refreshing = true
            notice = try {
                app.api.refresh()
                "Lista atualizada. O conteúdo será renovado ao abrir as telas."
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                friendlyError(e)
            } finally {
                refreshing = false
            }
        }
    }

    val bufferLabel = when (settings.bufferMode) { "fast" -> "Início rápido"; "stable" -> "Mais estável"; else -> "Equilibrado" }
    val screenInfo = LocalScreenInfo.current

    Box(Modifier.fillMaxSize().background(Bg)) {
        Column(
            Modifier
                .fillMaxSize()
                .focusProperties { canFocus = sheet == null }
                .verticalScroll(rememberScrollState())
                .padding(horizontal = sidePadding, vertical = if (isTv) 8.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text("Configurações", color = TextPrimary, fontSize = if (isTv) 28.sp else 26.sp, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.width(10.dp))
                Text("Principal", color = TextSecondary, fontSize = 13.sp, modifier = Modifier.padding(bottom = 4.dp))
            }
            val subscription: @Composable () -> Unit = { SubscriptionCard(status, screenInfo.deviceLabel, account) }
            val list: @Composable ColumnScope.() -> Unit = {
                SettingsRow(PhoneIcon.REFRESH, if (refreshing) "Atualizando…" else "Atualizar lista", "Baixa de novo canais, filmes e séries") { refreshCatalog() }
                SettingsRow(PhoneIcon.EXIT, "Sair desta conta", status?.name ?: "Entrar com outra conta", danger = true) { onLogout() }
                notice?.let { Text(it, color = if (it.startsWith("Lista")) Accent else Danger, fontSize = 12.sp) }
                SectionLabel("PERFIL")
                SettingsRow(
                    PhoneIcon.LIST, "Lista extra (link M3U)",
                    app.api.direct?.extraUrl()?.takeIf { it.isNotBlank() }?.let { "Ligada · " + it.take(38) } ?: "Filmes e séries por fora do Xtream",
                ) { sheet = "extra" }
                SettingsRow(PhoneIcon.LIST, "Quem está assistindo", "Perfil: " + (app.api.direct?.profile() ?: "Principal") + " · favoritos e histórico separados") { sheet = "profiles" }
                SettingsRow(PhoneIcon.TRASH, "Limpar histórico", "Remove o \"Continuar assistindo\"") { sheet = "history" }
                val adultState = run {
                    adultTick.let { }
                    when {
                        !AdultLock.hasPin(context) -> "Desligada"
                        AdultLock.unlocked -> "Liberado até fechar o app"
                        else -> "Ativa · conteúdo adulto oculto"
                    }
                }
                SettingsRow(PhoneIcon.LOCK, "Senha do conteúdo adulto", adultState) { sheet = "adult" }
                SectionLabel("REPRODUÇÃO")
                SettingsRow(PhoneIcon.PLAY, "Player e buffer", "Buffer: $bufferLabel · Imagem: " + when (settings.aspectRatio) { "fill" -> "Preencher"; "zoom" -> "Ampliar"; else -> "Ajustar" }) { sheet = "player" }
                SettingsRow(PhoneIcon.SPEAKER, "Áudio e legendas", "Áudio: ${settings.audioLanguage} · Legendas: ${settings.subtitleLanguage}") { sheet = "audio" }
                SectionLabel("APARELHO")
                SettingsRow(PhoneIcon.REFRESH, "Servidor IPTV", DeviceIdentity.getXtreamHost(context, BuildConfig.XTREAM_URL).ifBlank { "Não definido" } + " · editar para todos (senha)") { sheet = "server" }
                SettingsRow(PhoneIcon.REFRESH, "Rede e DNS", "DNS: " + com.iptvplayer.tv.data.DnsPrefs.label(com.iptvplayer.tv.data.DnsPrefs.mode) + " · ajuda quando canais e filmes não abrem") { sheet = "dns" }
                SettingsRow(PhoneIcon.SCREEN, "Tela", "Ajustada automaticamente · ${screenInfo.deviceLabel}") { sheet = "screen" }
                SettingsRow(PhoneIcon.LIST, "Atalhos", "Controles de navegação e reprodução") { sheet = "help" }
                SettingsRow(PhoneIcon.SCREEN, "Ajuda e diagnóstico", if (CrashLog.last(context) != null) "O app fechou sozinho: toque para ver" else "Versão, aparelho e último erro") { sheet = "diag" }
            }
            if (isTv) {
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    Box(Modifier.width(300.dp)) { subscription() }
                    Column(Modifier.weight(1f).focusRequester(listFocus).focusGroup(), verticalArrangement = Arrangement.spacedBy(8.dp), content = list)
                }
            } else {
                subscription()
                Column(Modifier.focusRequester(listFocus).focusGroup(), verticalArrangement = Arrangement.spacedBy(8.dp), content = list)
            }
            Spacer(Modifier.height(24.dp))
        }

        sheet?.let { which ->
            val close = { sheet = null }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color(0xCC000000))
                    .pointerInput(Unit) { detectTapGestures { close() } },
                contentAlignment = if (isTv) Alignment.Center else Alignment.BottomCenter,
            ) {
                Column(
                    Modifier
                        .then(if (isTv) Modifier.fillMaxWidth(0.62f).heightIn(max = 470.dp) else Modifier.fillMaxWidth())
                        .clip(RoundedCornerShape(if (isTv) 24.dp else 28.dp))
                        .background(Color(0xFF131B30))
                        .pointerInput(Unit) { detectTapGestures { } }
                        .verticalScroll(rememberScrollState())
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    when (which) {
                        "player" -> {
                            SheetHeader("REPRODUÇÃO", "Player e buffer", closeFocus, close)
                            ChoiceSetting(
                                title = "Buffer",
                                description = "O equilíbrio entre abrir rápido e não travar. Padrão: Equilibrado.",
                                selected = settings.bufferMode,
                                options = listOf(PreferenceChoice("fast", "Início rápido"), PreferenceChoice("balanced", "Equilibrado"), PreferenceChoice("stable", "Mais estável")),
                                onSelect = { save(settings.copy(bufferMode = it)) },
                            )
                            ChoiceSetting(
                                title = "Zoom da imagem",
                                description = "Como o vídeo ocupa a tela.",
                                selected = settings.aspectRatio,
                                options = listOf(PreferenceChoice("fit", "Ajustar"), PreferenceChoice("fill", "Preencher"), PreferenceChoice("zoom", "Ampliar")),
                                onSelect = { save(settings.copy(aspectRatio = it)) },
                            )
                            ChoiceSetting(
                                title = "Qualidade máxima",
                                description = "Em transmissões adaptativas, o player ajusta a qualidade à conexão.",
                                selected = settings.videoQuality,
                                options = listOf(PreferenceChoice("auto", "Automática"), PreferenceChoice("1080", "1080p"), PreferenceChoice("720", "720p"), PreferenceChoice("480", "480p")),
                                onSelect = { save(settings.copy(videoQuality = it)) },
                            )
                            ChoiceSetting(
                                title = "Avanço e retrocesso",
                                description = "Tempo ao usar esquerda e direita em filmes e episódios.",
                                selected = settings.skipSeconds.toString(),
                                options = listOf(PreferenceChoice("5", "5 s"), PreferenceChoice("10", "10 s"), PreferenceChoice("15", "15 s"), PreferenceChoice("30", "30 s")),
                                onSelect = { save(settings.copy(skipSeconds = it.toIntOrNull() ?: 10)) },
                            )
                            ToggleSetting("Retomar do ponto salvo", "Continua filmes e episódios de onde você parou.", settings.resumePlayback) { save(settings.copy(resumePlayback = !settings.resumePlayback)) }
                            ToggleSetting("Abrir no último canal", "Ao abrir o app, volta direto para o canal ao vivo que você estava assistindo.", settings.reopenLastChannel) { save(settings.copy(reopenLastChannel = !settings.reopenLastChannel)) }
                            ToggleSetting("Próximo episódio automático", "Inicia o episódio seguinte quando o atual termina.", settings.autoNextEpisode) { save(settings.copy(autoNextEpisode = !settings.autoNextEpisode)) }
                            ToggleSetting("Compatibilidade do decodificador", "Tenta outro decodificador se o principal falhar.", settings.decoderFallback) { save(settings.copy(decoderFallback = !settings.decoderFallback)) }
                            ActionButton("Restaurar padrões", onClick = { save(AppSettings()) })
                            settingsNotice?.let { Text(it, color = Accent, fontSize = 11.sp) }
                        }
                        "audio" -> {
                            SheetHeader("REPRODUÇÃO", "Áudio e legendas", closeFocus, close)
                            ChoiceSetting(
                                title = "Idioma do áudio",
                                description = "Automático respeita a faixa padrão do vídeo.",
                                selected = settings.audioLanguage,
                                options = listOf(PreferenceChoice("auto", "Automático"), PreferenceChoice("pt", "Português"), PreferenceChoice("en", "English"), PreferenceChoice("es", "Español")),
                                onSelect = { save(settings.copy(audioLanguage = it)) },
                            )
                            ChoiceSetting(
                                title = "Legendas",
                                description = "Desativadas deixa as legendas desligadas; Automáticas prioriza o idioma do aparelho.",
                                selected = settings.subtitleLanguage,
                                options = listOf(PreferenceChoice("off", "Desativadas"), PreferenceChoice("auto", "Automáticas"), PreferenceChoice("pt", "Português"), PreferenceChoice("en", "English"), PreferenceChoice("es", "Español")),
                                onSelect = { save(settings.copy(subtitleLanguage = it)) },
                            )
                        }
                        "extra" -> {
                            SheetHeader("PERFIL", "Lista extra (link M3U)", closeFocus, close)
                            Text("Cole o link público de uma lista .m3u sua (GitHub, Gist, nuvem). Os filmes, séries e canais dela aparecem junto do Xtream, na categoria que você definir em group-title. Use só conteúdo que você tem direito de distribuir.", color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
                            var link by remember { mutableStateOf(app.api.direct?.extraUrl().orEmpty()) }
                            androidx.compose.material3.OutlinedTextField(
                                value = link,
                                onValueChange = { link = it },
                                label = { Text("Link da lista (http/https)") },
                                singleLine = true,
                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Uri),
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                ActionButton("Salvar e atualizar", onClick = {
                                    val v = link.trim()
                                    if (v.isNotEmpty() && !v.startsWith("http", ignoreCase = true)) {
                                        notice = "O link precisa começar com http ou https."
                                    } else {
                                        app.api.direct?.setExtraUrl(v)
                                        sheet = null
                                        refreshCatalog()
                                    }
                                }, primary = true)
                                if (link.isNotBlank()) ActionButton("Remover", onClick = {
                                    app.api.direct?.setExtraUrl("")
                                    sheet = null
                                    refreshCatalog()
                                })
                            }
                        }
                        "history" -> {
                            SheetHeader("PERFIL", "Limpar histórico", closeFocus, close)
                            Text("Isso apaga o \"Continuar assistindo\" (pontos salvos de filmes e episódios) deste aparelho. Favoritos não são apagados.", color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
                            ActionButton("Limpar agora", onClick = {
                                scope.launch {
                                    notice = try {
                                        app.api.clearHistory()
                                        "Lista atualizada. Histórico limpo."
                                    } catch (e: CancellationException) {
                                        throw e
                                    } catch (e: Exception) {
                                        friendlyError(e)
                                    }
                                    sheet = null
                                }
                            }, primary = true)
                        }
                        "profiles" -> {
                            SheetHeader("PERFIL", "Quem está assistindo", closeFocus, close)
                            val d = app.api.direct
                            var newName by remember { mutableStateOf("") }
                            if (d == null) {
                                Text("Perfis só existem no modo sem painel.", color = TextSecondary, fontSize = 12.sp)
                            } else {
                                d.profiles().forEach { name ->
                                    ActionButton(if (name == d.profile()) "✓ $name" else name, onClick = { d.setProfile(name); sheet = null; notice = "Perfil: $name" }, primary = name == d.profile())
                                }
                                androidx.compose.material3.OutlinedTextField(
                                    value = newName, onValueChange = { newName = it }, label = { Text("Novo perfil (nome)") },
                                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                                )
                                ActionButton("Criar perfil", onClick = {
                                    if (newName.isNotBlank()) { d.addProfile(newName); sheet = null; notice = "Perfil: " + d.profile() }
                                })
                            }
                        }
                        "adult" -> {
                            SheetHeader("PERFIL", "Senha do conteúdo adulto", closeFocus, close)
                            AdultLockPanel(onChanged = { adultTick++ })
                        }
                        "server" -> {
                            SheetHeader("APARELHO", "Servidor IPTV", closeFocus, close)
                            var host by remember { mutableStateOf(DeviceIdentity.getXtreamHost(context, BuildConfig.XTREAM_URL)) }
                            var pw by remember { mutableStateOf("") }
                            var msg by remember { mutableStateOf<String?>(null) }
                            var confirmForce by remember { mutableStateOf(false) }
                            var busy by remember { mutableStateOf(false) }
                            Text("Trocar o servidor aqui muda para todos os aparelhos, aplicativos e o site. Senha mestra: box54321. Cada aparelho confere se a sua conta funciona no servidor novo antes de passar a usá-lo.", color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
                            androidx.compose.material3.OutlinedTextField(
                                value = host, onValueChange = { host = it; confirmForce = false }, label = { Text("Servidor (ex.: http://servidor.com:80)") },
                                singleLine = true, modifier = Modifier.fillMaxWidth(),
                            )
                            androidx.compose.material3.OutlinedTextField(
                                value = pw, onValueChange = { pw = it }, label = { Text("Senha mestra para alterar (box54321)") },
                                placeholder = { Text("box54321") },
                                singleLine = true, modifier = Modifier.fillMaxWidth(),
                                visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                            )
                            fun save(force: Boolean) {
                                if (busy) return
                                busy = true
                                msg = "Salvando…"
                                scope.launch {
                                    val r = app.api.setServer(pw, host.trim(), force)
                                    if (r.ok) {
                                        pw = ""
                                        confirmForce = false
                                        val novo = try { app.api.syncServer(context) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (_: Exception) { null }
                                        msg = "Pronto! Servidor trocado para todos (${r.migrated} aparelho(s) no painel)." +
                                            if (novo == null) " Este aparelho ainda vai conferir a conta no servidor novo." else ""
                                        host = DeviceIdentity.getXtreamHost(context, BuildConfig.XTREAM_URL)
                                    } else {
                                        confirmForce = r.needsConfirm
                                        msg = r.message
                                    }
                                    busy = false
                                }
                            }
                            ActionButton(if (busy) "Salvando…" else "Salvar para todos", onClick = { save(false) })
                            if (confirmForce) ActionButton("Salvar mesmo assim", onClick = { save(true) })
                            msg?.let { Text(it, color = if (it.startsWith("Pronto")) Accent else TextSecondary, fontSize = 12.sp) }
                        }
                        "dns" -> {
                            SheetHeader("APARELHO", "Rede e DNS", closeFocus, close)
                            var dnsMode by remember { mutableStateOf(com.iptvplayer.tv.data.DnsPrefs.mode) }
                            var dnsResult by remember { mutableStateOf<String?>(null) }
                            var dnsTesting by remember { mutableStateOf(false) }
                            Text("Algumas operadoras bloqueiam o endereço do provedor de IPTV: canais não abrem, ficam carregando ou dão tela preta. Trocar o DNS costuma resolver. A consulta é protegida (DNS sobre HTTPS), então a operadora não consegue adulterar.", color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
                            com.iptvplayer.tv.data.DnsPrefs.options.forEach { (id, label) ->
                                ActionButton(if (id == dnsMode) "✓ $label" else label, onClick = {
                                    com.iptvplayer.tv.data.DnsPrefs.save(context, id)
                                    dnsMode = id
                                    dnsResult = null
                                }, primary = id == dnsMode)
                            }
                            ActionButton(if (dnsTesting) "Testando…" else "Testar com o meu provedor", onClick = {
                                if (dnsTesting) return@ActionButton
                                val host = DeviceIdentity.getXtreamHost(context, BuildConfig.XTREAM_URL)
                                    .removePrefix("http://").removePrefix("https://").substringBefore('/').substringBefore(':')
                                if (host.isBlank()) { dnsResult = "Entre com a sua conta primeiro."; return@ActionButton }
                                dnsTesting = true
                                scope.launch {
                                    dnsResult = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { com.iptvplayer.tv.data.FallbackDns.test(host) }
                                    dnsTesting = false
                                }
                            })
                            dnsResult?.let { Text(it, color = if (it.startsWith("OK")) Accent else Danger, fontSize = 12.sp) }
                            Text("Depois de trocar, feche e abra o canal de novo. Se ainda não abrir, use \"Atualizar lista\".", color = TextSecondary, fontSize = 11.sp, lineHeight = 15.sp)
                        }
                        "screen" -> {
                            SheetHeader("APARELHO", "Tela", closeFocus, close)
                            val screenSettings = ScreenController.current
                            InfoLine("Aparelho", screenInfo.summary)
                            InfoLine(
                                "Ajuste atual",
                                "Automático" + if (screenSettings != ScreenMath.recommended(isTv)) " (com ajuste fino)" else "",
                            )
                            Text("O tamanho e as margens são calculados sozinhos para este aparelho. Use o ajuste fino só se algo ainda estiver cortado.", color = TextSecondary, fontSize = 11.sp, lineHeight = 15.sp)
                            ActionButton("Ajuste fino (opcional)", onClick = { sheet = null; ScreenController.calibrationOpen = true })
                        }
                        "diag" -> {
                            SheetHeader("APARELHO", "Ajuda e diagnóstico", closeFocus, close)
                            val clipboard = androidx.compose.ui.platform.LocalClipboardManager.current
                            val crash = remember { CrashLog.last(context) }
                            val info = remember {
                                "BoxTv ${com.iptvplayer.tv.BuildConfig.VERSION_NAME} · ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} · Android ${android.os.Build.VERSION.RELEASE}\n" +
                                    "Tela: ${screenInfo.deviceLabel}\nServidor: ${DeviceIdentity.getXtreamHost(context, com.iptvplayer.tv.BuildConfig.XTREAM_URL).ifBlank { "(não definido)" }}" +
                                    (app.api.direct?.warning?.let { "\nAviso: $it" } ?: "")
                            }
                            Text(info, color = TextPrimary, fontSize = 12.sp, lineHeight = 17.sp)
                            if (crash != null) {
                                Text("Último erro que fechou o app:", color = Danger, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                Text(crash, color = TextSecondary, fontSize = 10.sp, lineHeight = 14.sp, maxLines = 12, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                            } else {
                                Text("Nenhum erro registrado.", color = TextSecondary, fontSize = 12.sp)
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                ActionButton("Copiar", onClick = {
                                    clipboard.setText(androidx.compose.ui.text.AnnotatedString(info + (crash?.let { "\n\n" + it } ?: "")))
                                    notice = "Copiado. Cole na conversa com o suporte."
                                }, primary = true)
                                if (crash != null) ActionButton("Limpar erro", onClick = { CrashLog.clear(context); sheet = null })
                            }
                        }
                        else -> {
                            SheetHeader("APARELHO", "Atalhos", closeFocus, close)
                            HelpLine("TV", "OK pausa ou continua. Cima e baixo trocam canais ao vivo. MENU adiciona ou remove dos favoritos.")
                            HelpLine("Filmes", "Esquerda e direita avançam ou voltam ${settings.skipSeconds} segundos. Voltar fecha o player e salva o progresso.")
                            HelpLine("Celular", "Use a barra inferior para alternar entre início, ao vivo, filmes, séries e futebol.")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = Accent, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.6.sp, modifier = Modifier.padding(top = 8.dp, start = 2.dp))
}

@Composable
private fun SettingsRow(icon: PhoneIcon, title: String, subtitle: String, danger: Boolean = false, onClick: () -> Unit) {
    FocusCard(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(13.dp), focusedScale = 1.015f) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Surface2 else Surface1)
                .padding(horizontal = 14.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)).background((if (danger) Danger else Accent).copy(alpha = 0.16f)),
                contentAlignment = Alignment.Center,
            ) { PhoneIconView(icon, if (danger) Danger else Accent, size = 22.dp) }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = TextSecondary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            PhoneIconView(PhoneIcon.CHEVRON_RIGHT, TextSecondary, size = 20.dp)
        }
    }
}

@Composable
private fun SheetHeader(label: String, title: String, closeFocus: FocusRequester, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, color = TextSecondary, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.4.sp)
            Text(title, color = TextPrimary, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
        }
        ActionButton("Fechar", onClose, Modifier.focusRequester(closeFocus))
    }
}

@Composable
private fun SubscriptionCard(status: StatusResponse?, deviceLabel: String, account: AccountResponse? = null) {
    val shape = RoundedCornerShape(18.dp)
    val exp = status?.expiresAt
    val daysLeft = exp?.let { ((it - System.currentTimeMillis()) / 86_400_000L).coerceAtLeast(0) }
    val active = status?.status == "active"
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Surface2, Surface1)))
            .border(1.dp, Color.White.copy(alpha = 0.07f), shape)
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("ASSINATURA", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.6.sp)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(9.dp).background(if (active) Color(0xFF3DDC84) else if (status == null) TextSecondary else Danger, CircleShape))
            Spacer(Modifier.width(8.dp))
            Text(
                when {
                    status == null -> "Sem conexão"
                    active -> "Ativo"
                    else -> status.status
                },
                color = TextPrimary, fontSize = 26.sp, fontWeight = FontWeight.ExtraBold,
            )
        }
        if (exp != null) {
            Text("Válido até ${fmtDate(exp)} · Faltam ${daysLeft ?: 0} dias", color = TextPrimary, fontSize = 12.sp)
            Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f))) {
                Box(Modifier.fillMaxWidth(((daysLeft ?: 0) / 365f).coerceIn(0.03f, 1f)).height(4.dp).background(Accent))
            }
            Text("Acompanha a validade da sua conta", color = TextSecondary, fontSize = 11.sp)
        } else if (status != null) {
            Text("Sem data de validade", color = TextSecondary, fontSize = 12.sp)
        }
        Spacer(Modifier.height(4.dp))
        InfoLine("Conta", status?.name ?: "—")
        InfoLine("Aparelho", deviceLabel)
        account?.maxConnections?.let { max -> InfoLine("Telas simultâneas", "${account.activeConnections ?: 0} de $max em uso") }
        InfoLine("Versão do app", BuildConfig.VERSION_NAME)
    }
}

@Composable
private fun ChoiceSetting(
    title: String,
    description: String,
    selected: String,
    options: List<PreferenceChoice>,
    onSelect: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(title, color = TextPrimary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        Text(description, color = TextSecondary, fontSize = 11.sp, lineHeight = 16.sp)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(options, key = { it.value }) { option ->
                Pill(option.label, selected == option.value, onClick = { onSelect(option.value) })
            }
        }
    }
}

@Composable
private fun ToggleSetting(title: String, description: String, checked: Boolean, onToggle: () -> Unit) {
    FocusCard(
        onClick = onToggle,
        modifier = Modifier.fillMaxWidth().semantics(mergeDescendants = true) {
            role = Role.Switch
            stateDescription = if (checked) "Ativado" else "Desativado"
        },
        shape = RoundedCornerShape(13.dp),
        focusedScale = 1.01f,
    ) { focused ->
        Row(
            Modifier.fillMaxWidth().background(if (focused) Surface2 else Color(0x66111A28)).padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(description, color = TextSecondary, fontSize = 11.sp, lineHeight = 15.sp)
            }
            Spacer(Modifier.width(14.dp))
            Box(
                Modifier.size(width = 46.dp, height = 26.dp).clip(CircleShape).background(if (checked) Accent else Surface2).padding(3.dp),
                contentAlignment = if (checked) Alignment.CenterEnd else Alignment.CenterStart,
            ) {
                Box(Modifier.size(20.dp).clip(CircleShape).background(Color.White))
            }
        }
    }
}

@Composable
private fun InfoLine(label: String, value: String, mono: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Text(label, color = TextSecondary, fontSize = 12.sp, modifier = Modifier.width(if (rememberIsTv()) 180.dp else 130.dp))
        Text(
            value,
            color = TextPrimary,
            fontSize = 12.sp,
            fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun HelpLine(title: String, text: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 5.dp).size(7.dp).background(Accent, CircleShape))
        Spacer(Modifier.width(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text(text, color = TextSecondary, fontSize = 11.sp, lineHeight = 16.sp)
        }
    }
}

@Composable
private fun AdultLockPanel(onChanged: () -> Unit) {
    val context = LocalContext.current
    val app = context.applicationContext as IptvApp
    var hasPin by remember { mutableStateOf(AdultLock.hasPin(context)) }
    var unlocked by remember { mutableStateOf(AdultLock.unlocked) }
    var pin by remember { mutableStateOf("") }
    var pin2 by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    fun sync(text: String?) {
        hasPin = AdultLock.hasPin(context)
        unlocked = AdultLock.unlocked
        app.api.setHideAdult(AdultLock.hidden(context))
        pin = ""
        pin2 = ""
        message = text
        onChanged()
    }

    @Composable
    fun PinField(value: String, label: String, onChange: (String) -> Unit) {
        androidx.compose.material3.OutlinedTextField(
            value = value,
            onValueChange = { if (it.length <= 6 && it.all { c -> c.isDigit() }) onChange(it) },
            label = { Text(label) },
            singleLine = true,
            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth(),
        )
    }

    if (!hasPin) {
        Text("Crie uma senha de 4 a 6 números. Com ela ativa, categorias, buscas e destaques adultos ficam ocultos. A senha fica só neste aparelho.", color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp)
        PinField(pin, "Nova senha") { pin = it }
        PinField(pin2, "Repetir a senha") { pin2 = it }
        ActionButton("Ativar senha", onClick = {
            when {
                pin.length < 4 -> message = "Use de 4 a 6 números."
                pin != pin2 -> message = "As senhas não são iguais."
                else -> { AdultLock.setPin(context, pin); sync("Senha ativada. Conteúdo adulto oculto.") }
            }
        }, primary = true)
    } else {
        Text(
            if (unlocked) "Conteúdo adulto liberado até você fechar o app." else "Conteúdo adulto oculto. Digite a senha para liberar ou remover.",
            color = TextSecondary, fontSize = 12.sp, lineHeight = 17.sp,
        )
        if (unlocked) {
            ActionButton("Bloquear de novo", onClick = { AdultLock.unlocked = false; sync("Conteúdo adulto oculto de novo.") }, primary = true)
        }
        PinField(pin, "Senha atual") { pin = it }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (!unlocked) {
                ActionButton("Liberar", onClick = {
                    if (AdultLock.verify(context, pin)) { AdultLock.unlocked = true; sync("Liberado até fechar o app.") } else message = "Senha incorreta."
                }, primary = true)
            }
            ActionButton("Remover senha", onClick = {
                if (AdultLock.verify(context, pin)) { AdultLock.clearPin(context); sync("Senha removida.") } else message = "Senha incorreta."
            })
        }
    }
    message?.let { Text(it, color = if (it.startsWith("Senha incorreta") || it.startsWith("As senhas") || it.startsWith("Use de")) Danger else Accent, fontSize = 12.sp) }
}

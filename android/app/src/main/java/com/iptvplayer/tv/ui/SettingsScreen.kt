package com.iptvplayer.tv.ui

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

    Column(
        Modifier
            .fillMaxSize()
            .background(Bg)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = sidePadding, vertical = if (isTv) 28.dp else 18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column {
            Text("CENTRAL DE CONTROLE", color = Accent, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 2.sp)
            Spacer(Modifier.height(6.dp))
            Text("Configurações", color = TextPrimary, fontSize = if (isTv) 30.sp else 26.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(4.dp))
            Text("Ajuste reprodução, áudio, legendas e sua conta.", color = TextSecondary, fontSize = 14.sp)
            settingsNotice?.let { Text(it, color = Accent, fontSize = 11.sp, modifier = Modifier.padding(top = 7.dp)) }
        }

        SettingsPanel("Reprodução", "Qualidade e comportamento do player") {
            ChoiceSetting(
                title = "Qualidade máxima",
                description = "Em transmissões adaptativas, o player ajusta a qualidade à conexão.",
                selected = settings.videoQuality,
                options = listOf(PreferenceChoice("auto", "Automática"), PreferenceChoice("1080", "1080p"), PreferenceChoice("720", "720p"), PreferenceChoice("480", "480p")),
                onSelect = { save(settings.copy(videoQuality = it)) },
            )
            ChoiceSetting(
                title = "Enquadramento da imagem",
                description = "Define como o vídeo ocupa a tela da TV ou do celular.",
                selected = settings.aspectRatio,
                options = listOf(PreferenceChoice("fit", "Ajustar"), PreferenceChoice("fill", "Preencher"), PreferenceChoice("zoom", "Ampliar")),
                onSelect = { save(settings.copy(aspectRatio = it)) },
            )
            ChoiceSetting(
                title = "Avanço e retrocesso",
                description = "Tempo aplicado ao usar os botões esquerda e direita durante filmes e episódios.",
                selected = settings.skipSeconds.toString(),
                options = listOf(PreferenceChoice("5", "5 s"), PreferenceChoice("10", "10 s"), PreferenceChoice("15", "15 s"), PreferenceChoice("30", "30 s")),
                onSelect = { save(settings.copy(skipSeconds = it.toIntOrNull() ?: 10)) },
            )
            ChoiceSetting(
                title = "Estabilidade da transmissão",
                description = "Mais estabilidade usa um buffer maior antes de iniciar ou retomar o vídeo.",
                selected = settings.bufferMode,
                options = listOf(PreferenceChoice("fast", "Início rápido"), PreferenceChoice("balanced", "Equilibrado"), PreferenceChoice("stable", "Mais estável")),
                onSelect = { save(settings.copy(bufferMode = it)) },
            )
            ToggleSetting(
                title = "Retomar do ponto salvo",
                description = "Salva o progresso e continua filmes e episódios de onde você parou.",
                checked = settings.resumePlayback,
                onToggle = { save(settings.copy(resumePlayback = !settings.resumePlayback)) },
            )
            ToggleSetting(
                title = "Próximo episódio automático",
                description = "Inicia o episódio seguinte quando o atual termina.",
                checked = settings.autoNextEpisode,
                onToggle = { save(settings.copy(autoNextEpisode = !settings.autoNextEpisode)) },
            )
            ToggleSetting(
                title = "Compatibilidade do decodificador",
                description = "Tenta outro decodificador do aparelho se o principal falhar.",
                checked = settings.decoderFallback,
                onToggle = { save(settings.copy(decoderFallback = !settings.decoderFallback)) },
            )
            ActionButton("Restaurar padrões", onClick = { save(AppSettings()) })
        }

        SettingsPanel("Áudio e legendas", "Preferências aplicadas quando a transmissão oferece essas faixas") {
            ChoiceSetting(
                title = "Idioma do áudio",
                description = "Seleciona a faixa preferida; Automático respeita a faixa padrão do vídeo.",
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

        SettingsPanel("Minha conta", "Status do acesso e manutenção da lista") {
            InfoLine("Situação", status?.let { if (it.status == "active") "Ativa" else it.status } ?: "Sem conexão")
            InfoLine("Validade", status?.expiresAt?.let { fmtDateTime(it) } ?: if (status != null) "Sem validade" else "—")
            InfoLine("MAC do aparelho", app.identity.mac, mono = true)
            InfoLine("Chave do aparelho", app.identity.key, mono = true)
            InfoLine("Painel", BuildConfig.PANEL_URL)
            InfoLine("Versão", BuildConfig.VERSION_NAME)
            Spacer(Modifier.height(5.dp))
            ActionButton(
                text = if (refreshing) "Atualizando lista…" else "Atualizar minha lista",
                onClick = {
                    if (!refreshing) scope.launch {
                        refreshing = true
                        notice = try {
                            app.api.refresh()
                            "Solicitação concluída. A lista será renovada ao abrir as telas de conteúdo."
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            friendlyError(e)
                        } finally {
                            refreshing = false
                        }
                    }
                },
                primary = true,
            )
            ActionButton(text = "Sair da conta", onClick = onLogout)
            notice?.let { Text(it, color = if (it.startsWith("Solicitação")) Accent else Danger, fontSize = 13.sp) }
        }

        SettingsPanel("Atalhos", "Controles para navegação e reprodução") {
            HelpLine("TV", "OK pausa ou continua. Cima e baixo trocam canais ao vivo. MENU adiciona ou remove dos favoritos.")
            HelpLine("Filmes", "Esquerda e direita avançam ou voltam ${settings.skipSeconds} segundos. Voltar fecha o player e salva o progresso quando essa opção está ativa.")
            HelpLine("Celular", "Use a barra inferior para alternar entre início, canais, filmes, séries e busca.")
        }
    }
}

@Composable
private fun SettingsPanel(title: String, subtitle: String, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF151D2D), Surface1, Color(0xFF111C25))))
            .border(1.dp, Brush.horizontalGradient(listOf(AccentAlt.copy(alpha = 0.38f), Color.White.copy(alpha = 0.08f), Accent.copy(alpha = 0.2f))), shape)
            .padding(if (rememberIsTv()) 22.dp else 16.dp),
        verticalArrangement = Arrangement.spacedBy(17.dp),
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, color = TextPrimary, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = TextSecondary, fontSize = 12.sp)
            }
            content()
        },
    )
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

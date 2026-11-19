package com.iptvplayer.tv.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.BuildConfig
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.DeviceIdentity
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    status: String,
    expiresAt: Long?,
    onSuccess: () -> Unit,
) {
    val context = LocalContext.current
    val app = context.applicationContext as IptvApp
    val scope = rememberCoroutineScope()
    val savedAuth = remember { DeviceIdentity.getAuth(context) }
    var username by remember { mutableStateOf(savedAuth.first.orEmpty()) }
    var password by remember { mutableStateOf(savedAuth.second.orEmpty()) }
    var serverHost by remember { mutableStateOf(DeviceIdentity.getXtreamHost(context, BuildConfig.XTREAM_URL)) }
    var showServerConfig by remember { mutableStateOf(serverHost.isBlank()) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    fun submit() {
        if (loading) return
        val user = username.trim()
        val pass = password
        if (user.isBlank() || pass.isBlank()) {
            message = "Informe o usuário e a senha da sua conta Xtream."
            return
        }
        loading = true
        message = "Validando sua conta no servidor…"
        scope.launch {
            try {
                val host = normalizeXtreamHost(serverHost)
                    ?: throw IllegalArgumentException("Informe um endereço HTTP ou HTTPS válido.")
                app.api.login(user, pass, serverHost = host)
                withContext(Dispatchers.IO) {
                    DeviceIdentity.saveAuth(context, user, pass)
                    DeviceIdentity.saveXtreamHost(context, host)
                }
                message = null
                onSuccess()
            } catch (e: Exception) {
                val err = e as? com.iptvplayer.tv.data.ApiException
                message = when (err?.error) {
                    "no_default_server" -> "Configure o endereço do servidor Xtream e tente novamente."
                    "auth_failed", "xtream_auth_failed" -> "Usuário ou senha não conferem. Confira os dados com seu provedor."
                    "account_expired" -> "Esta conta venceu. Fale com seu provedor para renovar."
                    "account_disabled" -> "Esta conta está desativada. Fale com seu provedor."
                    "provider_unavailable", "unreachable", "upstream_unavailable" -> "Não foi possível conectar ao servidor Xtream. Tente novamente."
                    else -> friendlyError(e)
                }
            } finally {
                loading = false
            }
        }
    }

    androidx.compose.foundation.layout.BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(if (UiMode.gold) Color(0xFF0A1226) else Color(0xFF10101A), Bg, if (UiMode.gold) Color(0xFF0B1B3C) else Color(0xFF171329))))
            .padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        val compact = maxWidth < 600.dp
        val usernameFocus = remember { FocusRequester() }
        if (!compact) {
            LaunchedEffect(Unit) {
                delay(120)
                try { usernameFocus.requestFocus() } catch (_: Exception) {}
            }
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = if (compact) 480.dp else 620.dp)
                .fillMaxHeight()
                .verticalScroll(rememberScrollState())
                .clip(RoundedCornerShape(if (compact) 24.dp else 30.dp))
                .background(Color(0xF2111927))
                .border(1.dp, AccentAlt.copy(alpha = 0.32f), RoundedCornerShape(if (compact) 24.dp else 30.dp))
                .padding(if (compact) 24.dp else 42.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(if (compact) 64.dp else 82.dp)
                    .clip(CircleShape)
                    .background(Brush.linearGradient(listOf(AccentAlt, Accent))),
                contentAlignment = Alignment.Center,
            ) {
                Text("▶", color = Color.White, fontSize = if (compact) 26.sp else 34.sp, fontWeight = FontWeight.Black)
            }
            Spacer(Modifier.height(18.dp))
            Text("BoxTv", color = TextPrimary, fontSize = if (compact) 32.sp else 40.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(6.dp))
            Text("O MELHOR DO ENTRETENIMENTO", color = TextSecondary, fontSize = if (compact) 10.sp else 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.2.sp)
            Spacer(Modifier.height(28.dp))
            Text("Entre com Xtream", color = TextPrimary, fontSize = if (compact) 22.sp else 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text("Use o usuário e a senha fornecidos pelo seu serviço de TV.", color = TextSecondary, fontSize = if (compact) 14.sp else 16.sp, textAlign = TextAlign.Center, lineHeight = 22.sp)
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = username,
                onValueChange = { username = it; message = null },
                label = { Text("Usuário") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().focusRequester(usernameFocus),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Next),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Accent, unfocusedBorderColor = Surface2, focusedTextColor = TextPrimary, unfocusedTextColor = TextPrimary),
            )
            Spacer(Modifier.height(14.dp))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it; message = null },
                label = { Text("Senha") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Accent, unfocusedBorderColor = Surface2, focusedTextColor = TextPrimary, unfocusedTextColor = TextPrimary),
            )
            Spacer(Modifier.height(20.dp))
            ActionButton(
                text = if (loading) "Conectando…" else "Entrar",
                onClick = { submit() },
                primary = true,
                modifier = Modifier.fillMaxWidth().height(if (compact) 52.dp else 60.dp),
            )
            message?.let {
                Spacer(Modifier.height(14.dp))
                Text(it, color = if (it.startsWith("Validando")) Color(0xFF8E7AFF) else Danger, fontSize = if (compact) 13.sp else 15.sp, textAlign = TextAlign.Center, lineHeight = 20.sp)
            }
            Spacer(Modifier.height(18.dp))

            // Configurar Servidor Xtream
            ActionButton(
                text = if (showServerConfig) "▲ Ocultar Servidor" else "⚙️ Configurar Servidor Xtream",
                onClick = { showServerConfig = !showServerConfig },
                primary = false,
                modifier = Modifier.fillMaxWidth().height(if (compact) 40.dp else 46.dp),
            )
            if (showServerConfig) {
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    value = serverHost,
                    onValueChange = { serverHost = it },
                    label = { Text("Servidor Xtream (URL + porta)") },
                    placeholder = { Text("Ex.: http://servidor.com:80") },
                    supportingText = { Text("Peça ao seu provedor. Começa com http:// ou https://") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Accent, unfocusedBorderColor = Surface2, focusedTextColor = TextPrimary, unfocusedTextColor = TextPrimary),
                )
                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (BuildConfig.XTREAM_URL.isNotBlank()) ActionButton(
                        text = "Restaurar Padrão",
                        onClick = {
                            serverHost = BuildConfig.XTREAM_URL
                            DeviceIdentity.saveXtreamHost(context, BuildConfig.XTREAM_URL)
                            showServerConfig = false
                        },
                        primary = false,
                        modifier = Modifier.weight(1f).height(40.dp),
                    )
                    ActionButton(
                        text = "Salvar",
                        onClick = {
                            val normalized = normalizeXtreamHost(serverHost)
                            if (normalized != null) {
                                serverHost = normalized
                                DeviceIdentity.saveXtreamHost(context, normalized)
                                message = "Servidor salvo neste aparelho."
                                showServerConfig = false
                            } else {
                                message = "Informe uma URL válida, começando com http:// ou https://."
                            }
                        },
                        primary = true,
                        modifier = Modifier.weight(1f).height(40.dp),
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Text("BoxTv ${BuildConfig.VERSION_NAME}", color = TextSecondary, fontSize = 11.sp)
        }
    }
}


private fun normalizeXtreamHost(raw: String): String? {
    val value = raw.trim().trimEnd('/')
    return runCatching {
        val uri = java.net.URI(value)
        if ((uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null) {
            uri.toASCIIString().trimEnd('/')
        } else null
    }.getOrNull()
}

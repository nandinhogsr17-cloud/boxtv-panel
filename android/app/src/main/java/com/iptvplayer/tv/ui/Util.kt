package com.iptvplayer.tv.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import com.iptvplayer.tv.data.ApiException
import com.iptvplayer.tv.data.Item
import kotlinx.coroutines.CancellationException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val message: String) : Load<Nothing>
}

fun friendlyError(e: Throwable): String = when {
    e is ApiException && e.error == "invalid_panel_url" ->
        "Endereço do painel inválido. Confira panelUrl no gradle.properties."
    e is java.net.UnknownHostException -> "Não encontrei o servidor. Confira o endereço e a internet."
    e is java.net.SocketTimeoutException -> "O servidor demorou demais para responder. Tente de novo."
    e is java.net.ConnectException -> "Não consegui conectar ao servidor (fora do ar ou porta errada)."
    e is javax.net.ssl.SSLException -> "Falha de conexão segura. Tente o endereço com http:// ou confira o certificado."
    e is java.io.IOException -> "Falha de rede. Verifique a internet e tente de novo."
    e is IllegalArgumentException -> e.message ?: "Dados inválidos."
    e is ApiException && e.error == "xtream_auth_failed" -> "Usuário ou senha não conferem. Confira com seu provedor."
    e is ApiException && e.error == "no_default_server" -> "Digite o endereço do servidor Xtream (ex.: http://servidor.com:80)."
    e is ApiException && e.httpCode == 0 -> "Sem conexão com o servidor. Verifique a internet."
    e is ApiException && e.httpCode == 401 -> "Reconectando sua conta... Toque em Tentar de novo."
    e is ApiException && e.httpCode == 403 -> "Acesso não liberado para este dispositivo."
    e is ApiException && e.httpCode == 429 -> "Muitas tentativas. Aguarde um minuto."
    e is ApiException && e.httpCode == 502 ->
        "O conteúdo está sendo carregado. Toque em Tentar de novo em instantes."
    else -> e.message ?: "Erro inesperado"
}

/** Executa [block] e devolve Carregando / Ok / Erro. Recarrega quando alguma das [keys] muda. */
@Composable
fun <T> rememberLoad(vararg keys: Any?, block: suspend () -> T): State<Load<T>> =
    produceState<Load<T>>(Load.Loading, *keys) {
        value = Load.Loading
        value = try {
            Load.Ok(block())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Load.Err(friendlyError(e))
        }
    }

fun fmtTime(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s)
    else String.format(Locale.US, "%02d:%02d", m, s)
}

fun fmtDateTime(ms: Long): String =
    SimpleDateFormat("dd/MM/yyyy HH:mm", Locale("pt", "BR")).format(Date(ms))

fun fmtDate(ms: Long): String =
    SimpleDateFormat("dd/MM/yyyy", Locale("pt", "BR")).format(Date(ms))

fun fmtHour(ms: Long): String =
    if (ms <= 0) "--:--" else SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(Date(ms))

/** Título para mostrar (episódio ganha "Série · T1E2 · Nome" quando sabemos o nome da série). */
fun Item.displayTitle(heading: String?): String =
    if (type == "episode" && heading != null) "$heading · T$season E$episode · $title" else title

/** Índice do episódio por onde continuar: o último iniciado (ou o seguinte, se já terminou). */
fun resumeIndex(flat: List<Item>): Int {
    val last = flat.indexOfLast { it.positionMs > 0 }
    if (last < 0) return 0
    return if (flat[last].progress >= 0.95f && last + 1 < flat.size) last + 1 else last
}

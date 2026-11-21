package com.iptvplayer.tv.ui

import android.content.Context
import android.os.SystemClock
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** Informações da tela já com o ajuste aplicado (em dp efetivos). Disponível via [LocalScreenInfo]. */
data class ScreenInfo(
    val widthPx: Int = 0,
    val heightPx: Int = 0,
    val densityDpi: Int = 0,
    val widthDp: Float = 360f,
    val heightDp: Float = 640f,
    val factor: Float = 1f,
    val fontScale: Float = 1f,
    val isTv: Boolean = false,
    val sizeClass: SizeClass = SizeClass.COMPACT,
) {
    val deviceLabel: String get() = ScreenMath.deviceClass(isTv, widthPx, heightPx, densityDpi)
    val summary: String
        get() = "${widthPx}×${heightPx} px · ${densityDpi} dpi · ${widthDp.toInt()}×${heightDp.toInt()} dp · " +
            deviceLabel + " · fator " + String.format(java.util.Locale.US, "%.2f", factor)
}

val LocalScreenInfo = compositionLocalOf { ScreenInfo() }

/**
 * Guarda o ajuste de tela. Regras de segurança:
 *  - qualquer mudança entra como TESTE de 15 s e volta sozinha se o usuário não confirmar;
 *  - só o que foi confirmado é gravado (reiniciar o app durante um teste volta ao anterior);
 *  - se o app fechar 3 vezes seguidas logo ao abrir, o ajuste volta ao recomendado.
 */
object ScreenController {
    private const val PREFS = "boxtv_screen"
    const val TRIAL_MS = 15_000L

    var current by mutableStateOf(ScreenSettings())
        private set
    var trialEndsAt by mutableLongStateOf(0L)
        private set
    var calibrationOpen by mutableStateOf(false)

    private var saved = ScreenSettings()
    /** Ligado pelo player: vídeo ocupa a tela toda, sem a margem segura da TV. */
    var fullBleed by mutableStateOf(false)
    private var initialized = false
    private var signature = ""

    fun init(context: Context, isTv: Boolean) {
        if (initialized) return
        initialized = true
        try {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val boots = p.getInt("boot", 0) + 1
            val rec = ScreenMath.recommended(isTv)
            saved = rec
            val dm = context.resources.displayMetrics
            val sig = ScreenMath.signature(dm.widthPixels, dm.heightPixels, dm.densityDpi)
            signature = sig
            if (p.getString("sig", sig) != sig) {
                p.edit().clear().putString("sig", sig).apply() // outra tela/resolução: volta ao automático
            } else if (boots >= 3) {
                p.edit().clear().apply() // abertura falhando em sequência: volta ao recomendado
            } else {
                saved = ScreenMath.sanitize(
                    ScreenSettings(p.getInt("pct", rec.scalePct), p.getInt("ovh", rec.overscanHPct), p.getInt("ovv", rec.overscanVPct))
                )
                p.edit().putInt("boot", boots).apply()
            }
        } catch (_: Exception) {
            saved = ScreenMath.recommended(isTv)
        }
        current = saved
    }

    /** Chamado depois que o app ficou aberto alguns segundos: zera o contador de falhas. */
    fun markStable(context: Context) {
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("boot", 0).apply()
        } catch (_: Exception) {}
    }

    fun startTrial(next: ScreenSettings) {
        val s = ScreenMath.sanitize(next)
        if (s == current) return
        current = s
        trialEndsAt = SystemClock.elapsedRealtime() + TRIAL_MS
    }

    fun confirm(context: Context) {
        saved = current
        trialEndsAt = 0L
        try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("sig", signature).putInt("pct", saved.scalePct).putInt("ovh", saved.overscanHPct).putInt("ovv", saved.overscanVPct)
                .apply()
        } catch (_: Exception) {}
    }

    fun revert() {
        current = saved
        trialEndsAt = 0L
    }

    fun closePanel() {
        if (trialEndsAt != 0L) revert()
        calibrationOpen = false
    }

    val hasTrial: Boolean get() = trialEndsAt != 0L
}

/**
 * Envolve o app inteiro: aplica a densidade ajustada (tamanho) e as margens da TV, publica [LocalScreenInfo]
 * e mostra o painel de ajuste por cima (sempre na escala normal, para ficar legível mesmo com ajuste ruim).
 */
@Composable
fun ScreenSettingsHost(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val isTv = rememberIsTv()
    val base = LocalDensity.current
    remember { ScreenController.init(context, isTv); true }
    LaunchedEffect(Unit) {
        delay(6_000)
        ScreenController.markStable(context)
    }
    val s = ScreenController.current
    val trialEnds = ScreenController.trialEndsAt
    LaunchedEffect(trialEnds) {
        if (trialEnds == 0L) return@LaunchedEffect
        while (true) {
            if (SystemClock.elapsedRealtime() >= trialEnds) {
                ScreenController.revert()
                break
            }
            delay(250)
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wPx = constraints.maxWidth
        val hPx = constraints.maxHeight
        val factor = ScreenMath.factor(s.scalePct, isTv, wPx, hPx, base.density)
        val fs = ScreenMath.fontScale(base.fontScale, factor, isTv)
        val scaled = Density(base.density * factor, fs)
        val info = ScreenInfo(
            widthPx = wPx,
            heightPx = hPx,
            densityDpi = (base.density * 160f).toInt(),
            widthDp = wPx / scaled.density,
            heightDp = hPx / scaled.density,
            factor = factor,
            fontScale = fs,
            isTv = isTv,
            sizeClass = ScreenMath.sizeClass(wPx / scaled.density),
        )
        val open = ScreenController.calibrationOpen

        CompositionLocalProvider(LocalDensity provides scaled, LocalScreenInfo provides info) {
            val safe = isTv && !ScreenController.fullBleed
            val padH = with(scaled) { ScreenMath.overscanPx(if (safe) s.overscanHPct else 0, wPx).toDp() }
            val padV = with(scaled) { ScreenMath.overscanPx(if (safe) s.overscanVPct else 0, hPx).toDp() }
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(horizontal = padH, vertical = padV)
            ) { content() }
        }
    }
}

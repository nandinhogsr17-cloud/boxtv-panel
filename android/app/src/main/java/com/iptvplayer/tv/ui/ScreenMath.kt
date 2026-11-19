package com.iptvplayer.tv.ui

import kotlin.math.abs
import kotlin.math.min

/** Ajuste escolhido pelo usuário. 100% = tamanho recomendado calculado para a tela. */
data class ScreenSettings(
    val scalePct: Int = 100,
    val overscanHPct: Int = 0,
    val overscanVPct: Int = 0,
)

enum class SizeClass { COMPACT, MEDIUM, EXPANDED }

/**
 * Matemática pura do ajuste de tela (sem Android), para ser testada em JVM.
 *
 * Ideia: a interface é desenhada para uma "tela de projeto" (TV: 960×540 dp). Em cada aparelho calculamos
 * um fator que faz a tela real ficar com esse tamanho em dp, e o usuário pode refinar em ±% por cima.
 * Todo valor passa por limites e por verificação de NaN/infinito, então nunca sai um número inválido.
 */
object ScreenMath {
    const val TV_BASE_WIDTH_DP = 960f
    const val TV_BASE_HEIGHT_DP = 540f
    const val TABLET_BASE_WIDTH_DP = 600f
    const val PHONE_MIN_WIDTH_DP = 320f
    /** Margem segura padrão da TV (muitas TVs cortam ~2–3% das bordas). Não vale dentro do player. */
    const val TV_SAFE_OVERSCAN_PCT = 3
    const val MIN_PCT = 60
    const val MAX_PCT = 160
    const val PCT_STEP = 5
    const val MAX_OVERSCAN = 12
    const val MIN_FACTOR = 0.6f
    const val MAX_FACTOR = 2.4f
    const val MAX_TEXT_MULTIPLIER = 2.6f

    /** Ajuste recomendado (automático) para o tipo de aparelho. */
    fun recommended(isTv: Boolean): ScreenSettings =
        ScreenSettings(100, if (isTv) TV_SAFE_OVERSCAN_PCT else 0, if (isTv) TV_SAFE_OVERSCAN_PCT else 0)

    /** Assinatura da tela física: se mudar (outra TV, outra resolução), o ajuste salvo é descartado. */
    fun signature(widthPx: Int, heightPx: Int, densityDpi: Int): String =
        "${maxOf(widthPx, heightPx)}x${minOf(widthPx, heightPx)}@$densityDpi"

    /** Classificação automática do aparelho, só para exibição e diagnóstico. */
    fun deviceClass(isTv: Boolean, widthPx: Int, heightPx: Int, densityDpi: Int): String {
        val long = maxOf(widthPx, heightPx)
        if (isTv) return when {
            long <= 1280 -> "TV HD"
            long <= 1920 -> "TV Full HD"
            else -> "TV 4K"
        }
        val d = if (densityDpi > 0) densityDpi / 160f else 1f
        val swDp = minOf(widthPx, heightPx) / d
        return when {
            swDp < PHONE_MIN_WIDTH_DP -> "Celular pequeno"
            swDp < TABLET_BASE_WIDTH_DP -> "Celular"
            else -> "Tablet"
        }
    }

    fun finiteOr(v: Float, fallback: Float): Float = if (v.isNaN() || v.isInfinite()) fallback else v

    fun sanitize(s: ScreenSettings): ScreenSettings = ScreenSettings(
        scalePct = s.scalePct.coerceIn(MIN_PCT, MAX_PCT),
        overscanHPct = s.overscanHPct.coerceIn(0, MAX_OVERSCAN),
        overscanVPct = s.overscanVPct.coerceIn(0, MAX_OVERSCAN),
    )

    /** Fator recomendado para o aparelho (antes do ajuste manual). */
    fun autoFactor(isTv: Boolean, widthPx: Int, heightPx: Int, baseDensity: Float): Float {
        val d = finiteOr(baseDensity, 1f).let { if (it <= 0f) 1f else it }
        if (widthPx <= 0 || heightPx <= 0) return 1f
        val wDp = widthPx / d
        val hDp = heightPx / d
        val raw = if (isTv) {
            // Usa o lado mais limitante: a interface sempre cabe, mesmo em telas 4:3 ou ultralargas.
            min(wDp / TV_BASE_WIDTH_DP, hDp / TV_BASE_HEIGHT_DP)
        } else {
            // Celular mantém o tamanho do sistema (respeita "Tamanho da tela" do usuário); só tablets crescem um pouco.
            val sw = min(wDp, hDp)
            when {
                sw >= TABLET_BASE_WIDTH_DP -> (sw / TABLET_BASE_WIDTH_DP).coerceIn(1f, 1.2f)
                // "Tamanho da tela" do sistema muito grande: encolhe o suficiente para o layout nunca estourar.
                sw < PHONE_MIN_WIDTH_DP -> sw / PHONE_MIN_WIDTH_DP
                else -> 1f
            }
        }
        val f = raw.coerceIn(MIN_FACTOR, MAX_FACTOR)
        return if (abs(f - 1f) < 0.04f) 1f else f
    }

    /** Fator final aplicado à densidade da interface. */
    fun factor(scalePct: Int, isTv: Boolean, widthPx: Int, heightPx: Int, baseDensity: Float): Float {
        val pct = scalePct.coerceIn(MIN_PCT, MAX_PCT)
        return (autoFactor(isTv, widthPx, heightPx, baseDensity) * pct / 100f).coerceIn(MIN_FACTOR, MAX_FACTOR)
    }

    /** Escala de fonte: respeita o sistema, mas com limites para não quebrar o layout. */
    fun fontScale(systemFontScale: Float, factor: Float, isTv: Boolean): Float {
        val sys = finiteOr(systemFontScale, 1f)
        var fs = if (isTv) sys.coerceIn(0.85f, 1.15f) else sys.coerceIn(0.85f, 1.3f)
        if (factor > 0f && factor * fs > MAX_TEXT_MULTIPLIER) fs = MAX_TEXT_MULTIPLIER / factor
        return fs.coerceIn(0.5f, 1.3f)
    }

    fun overscanPx(pct: Int, sizePx: Int): Float = sizePx * pct.coerceIn(0, MAX_OVERSCAN) / 100f

    fun sizeClass(widthDp: Float): SizeClass = when {
        widthDp < 600f -> SizeClass.COMPACT
        widthDp < 840f -> SizeClass.MEDIUM
        else -> SizeClass.EXPANDED
    }

    /** Colunas da grade de pôsteres conforme a largura útil (celular, tablet, dobrável). */
    fun gridColumns(widthDp: Float, minCellDp: Float = 124f, min: Int = 3, max: Int = 8): Int =
        (finiteOr(widthDp, 360f) / minCellDp).toInt().coerceIn(min, max)
}

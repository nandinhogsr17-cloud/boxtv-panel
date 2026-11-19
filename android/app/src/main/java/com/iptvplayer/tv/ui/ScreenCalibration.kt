package com.iptvplayer.tv.ui

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * Painel "Ajuste de tela": tamanho da interface e (na TV) margens contra corte de bordas.
 * Funciona com controle remoto (setas + OK) e com toque. Todo ajuste é um TESTE de 15 s com volta automática.
 */
@Composable
fun ScreenCalibrationOverlay(info: ScreenInfo, isTv: Boolean, s: ScreenSettings) {
    val context = LocalContext.current
    val trialEnds = ScreenController.trialEndsAt
    val trial = trialEnds != 0L
    val secondsLeft by produceState(0, trialEnds) {
        while (trialEnds != 0L) {
            val left = ((trialEnds - SystemClock.elapsedRealtime() + 999) / 1000).toInt().coerceAtLeast(0)
            value = left
            if (left <= 0) break
            delay(250)
        }
    }

    BackHandler { ScreenController.closePanel() }

    val firstFocus = remember { FocusRequester() }
    val keepFocus = remember { FocusRequester() }
    LaunchedEffect(trial) {
        delay(120)
        try {
            (if (trial) keepFocus else firstFocus).requestFocus()
        } catch (_: Exception) {}
    }

    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(Unit) { detectTapGestures { } } // não deixa o toque "vazar" para o app atrás
    ) {
        // Guias: borda externa (se não aparecer inteira, a TV está cortando) e área segura escolhida.
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 3.dp.toPx()
            drawRect(Color(0xFF13C9FF), Offset(stroke / 2, stroke / 2), Size(size.width - stroke, size.height - stroke), style = Stroke(stroke))
            val l = ScreenMath.overscanPx(if (isTv) s.overscanHPct else 0, size.width.toInt())
            val t = ScreenMath.overscanPx(if (isTv) s.overscanVPct else 0, size.height.toInt())
            drawRect(
                Color(0xFFFFB43B),
                Offset(l + stroke, t + stroke),
                Size((size.width - 2 * l - 2 * stroke).coerceAtLeast(1f), (size.height - 2 * t - 2 * stroke).coerceAtLeast(1f)),
                style = Stroke(stroke, pathEffect = PathEffect.dashPathEffect(floatArrayOf(28f, 18f))),
            )
        }

        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(16.dp)
                .widthIn(max = 760.dp)
                .fillMaxWidth()
                .background(Color(0xF2101828), RoundedCornerShape(22.dp))
                .border(1.dp, Color(0x66FFB43B), RoundedCornerShape(22.dp))
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Ajuste de tela", color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
            Text(info.summary, color = Color(0xFF9FB0CC), fontSize = 12.sp)
            Text(
                if (isTv) "Linha azul = borda da tela (se não aparecer inteira, aumente a margem). Linha dourada = área usada pelo app."
                else "Aumente ou diminua o tamanho da interface até ficar confortável.",
                color = Color(0xFF9FB0CC),
                fontSize = 12.sp,
            )

            StepRow(
                "Tamanho da interface", "${s.scalePct}%",
                onMinus = { ScreenController.startTrial(s.copy(scalePct = s.scalePct - ScreenMath.PCT_STEP)) },
                onPlus = { ScreenController.startTrial(s.copy(scalePct = s.scalePct + ScreenMath.PCT_STEP)) },
                minusModifier = Modifier.focusRequester(firstFocus),
            )
            if (isTv) {
                StepRow(
                    "Margem lateral", "${s.overscanHPct}%",
                    onMinus = { ScreenController.startTrial(s.copy(overscanHPct = s.overscanHPct - 1)) },
                    onPlus = { ScreenController.startTrial(s.copy(overscanHPct = s.overscanHPct + 1)) },
                )
                StepRow(
                    "Margem superior/inferior", "${s.overscanVPct}%",
                    onMinus = { ScreenController.startTrial(s.copy(overscanVPct = s.overscanVPct - 1)) },
                    onPlus = { ScreenController.startTrial(s.copy(overscanVPct = s.overscanVPct + 1)) },
                )
            }

            Spacer(Modifier.height(2.dp))
            if (trial) {
                Text(
                    "Manter este ajuste? Volta sozinho em ${secondsLeft}s.",
                    color = Color(0xFFFFB43B), fontSize = 15.sp, fontWeight = FontWeight.Bold,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ActionButton("Manter", onClick = { ScreenController.confirm(context) }, primary = true, modifier = Modifier.focusRequester(keepFocus))
                    ActionButton("Voltar ao anterior", onClick = { ScreenController.revert() })
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    ActionButton("Voltar ao automático", onClick = { ScreenController.startTrial(ScreenMath.recommended(isTv)) })
                    ActionButton("Concluir", onClick = { ScreenController.closePanel() }, primary = true)
                }
                if (isTv) {
                    Text("Dica: a tecla MENU do controle abre esta tela em qualquer lugar do app.", color = Color(0xFF9FB0CC), fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun StepRow(label: String, value: String, onMinus: () -> Unit, onPlus: () -> Unit, minusModifier: Modifier = Modifier) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        ActionButton("−", onClick = onMinus, modifier = minusModifier)
        Text(value, color = Color(0xFFFFB43B), fontSize = 18.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.width(84.dp))
        ActionButton("+", onClick = onPlus)
    }
}

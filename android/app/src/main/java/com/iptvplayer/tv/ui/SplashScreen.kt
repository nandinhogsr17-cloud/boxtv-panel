package com.iptvplayer.tv.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

private val SplashGold = Color(0xFFFFB43B)
private val SplashGoldSoft = Color(0xFFFFD666)
private val SplashNavy = Color(0xFF0B1220)

/** Abertura do app na paleta azul-marinho e dourado: emblema com brilho pulsante, nome da marca e barra de progresso. */
@Composable
fun SplashScreen(
    statusText: String = "Conectando ao BoxTv...",
) {
    val logoScale = remember { Animatable(0.7f) }
    val logoAlpha = remember { Animatable(0f) }
    val sloganAlpha = remember { Animatable(0f) }
    val progressAlpha = remember { Animatable(0f) }

    val infinite = rememberInfiniteTransition(label = "splash")
    val glowScale by infinite.animateFloat(
        initialValue = 0.94f, targetValue = 1.1f,
        animationSpec = infiniteRepeatable(tween(1900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "glowScale",
    )
    val glowAlpha by infinite.animateFloat(
        initialValue = 0.3f, targetValue = 0.7f,
        animationSpec = infiniteRepeatable(tween(1900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "glowAlpha",
    )
    val sweep by infinite.animateFloat(
        initialValue = -0.4f, targetValue = 1.2f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart),
        label = "sweep",
    )

    LaunchedEffect(Unit) {
        logoAlpha.animateTo(1f, tween(500, easing = FastOutSlowInEasing))
        logoScale.animateTo(1f, tween(650, easing = FastOutSlowInEasing))
        delay(150)
        sloganAlpha.animateTo(1f, tween(600, easing = FastOutSlowInEasing))
        progressAlpha.animateTo(1f, tween(450, easing = FastOutSlowInEasing))
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Brush.radialGradient(listOf(Color(0xFF16264A), Color(0xFF0B1220), Color(0xFF060A14)), radius = 1400f)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(340.dp)
                .scale(glowScale)
                .alpha(glowAlpha)
                .background(
                    Brush.radialGradient(listOf(SplashGold.copy(alpha = 0.40f), SplashGold.copy(alpha = 0.10f), Color.Transparent)),
                    CircleShape,
                ),
        )

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = 32.dp),
        ) {
            Box(
                Modifier
                    .scale(logoScale.value)
                    .alpha(logoAlpha.value)
                    .size(112.dp)
                    .clip(RoundedCornerShape(30.dp))
                    .background(Brush.linearGradient(listOf(SplashGoldSoft, SplashGold, Color(0xFFFF9A2E)))),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(48.dp)) {
                    val p = Path().apply {
                        moveTo(size.width * 0.26f, size.height * 0.12f)
                        lineTo(size.width * 0.86f, size.height * 0.50f)
                        lineTo(size.width * 0.26f, size.height * 0.88f)
                        close()
                    }
                    drawPath(p, SplashNavy)
                }
            }

            Spacer(Modifier.height(20.dp))

            Row(Modifier.scale(logoScale.value).alpha(logoAlpha.value), verticalAlignment = Alignment.CenterVertically) {
                Text("Box", color = Color(0xFFF5F7FF), fontSize = 42.sp, fontWeight = FontWeight.Black, letterSpacing = (-1).sp)
                Text("Tv", color = SplashGold, fontSize = 42.sp, fontWeight = FontWeight.Black, letterSpacing = (-1).sp)
            }

            Spacer(Modifier.height(10.dp))

            Column(Modifier.alpha(sloganAlpha.value), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("CANAIS · FILMES · SÉRIES", color = SplashGold, fontSize = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 3.sp, textAlign = TextAlign.Center)
            }

            Spacer(Modifier.height(34.dp))

            Column(
                Modifier.alpha(progressAlpha.value).widthIn(max = 280.dp).fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(5.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color(0x26FFFFFF)),
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(0.85f)
                            .height(5.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(
                                Brush.horizontalGradient(
                                    listOf(Color(0x66FFB43B), SplashGoldSoft, Color(0x66FFB43B)),
                                    startX = sweep * 300f,
                                    endX = (sweep + 0.8f) * 300f,
                                ),
                            ),
                    )
                }
                Spacer(Modifier.height(14.dp))
                AnimatedContent(
                    targetState = statusText,
                    transitionSpec = { fadeIn(tween(180)) togetherWith fadeOut(tween(120)) },
                    label = "boxtv-splash-status",
                ) { status ->
                    Text(status, color = Color(0xFFAAB8D6), fontSize = 12.sp, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

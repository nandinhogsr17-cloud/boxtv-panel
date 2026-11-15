package com.iptvplayer.tv.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * Tela de abertura espetacular com animaÃ§Ã£o da marca BoxTv,
 * efeito neon dinÃ¢mico, slogan marcante e barra de progresso inteligente.
 */
@Composable
fun SplashScreen(
    statusText: String = "Conectando ao BoxTv...",
) {
    // Controladores de animaÃ§Ã£o de entrada
    val logoScale = remember { Animatable(0.6f) }
    val logoAlpha = remember { Animatable(0f) }
    val sloganAlpha = remember { Animatable(0f) }
    val progressAlpha = remember { Animatable(0f) }

    // Pulso de neon contÃ­nuo
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val glowScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowScale"
    )
    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.75f,
        animationSpec = infiniteRepeatable(
            animation = tween(1800, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowAlpha"
    )

    // Barra de luz que corre pela barra de carregamento
    val shimmerOffset by infiniteTransition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    LaunchedEffect(Unit) {
        // SequÃªncia cinematogrÃ¡fica
        logoAlpha.animateTo(1f, animationSpec = tween(600, easing = FastOutSlowInEasing))
        logoScale.animateTo(1f, animationSpec = tween(700, easing = FastOutSlowInEasing))
        delay(200)
        sloganAlpha.animateTo(1f, animationSpec = tween(700, easing = FastOutSlowInEasing))
        progressAlpha.animateTo(1f, animationSpec = tween(500, easing = FastOutSlowInEasing))

    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(
                        Color(0xFF1E1435),
                        Color(0xFF0F0B1A),
                        Color(0xFF07050E)
                    ),
                    center = Offset.Unspecified,
                    radius = 1200f
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        // Luz ambiente de fundo neon (Glow difuso)
        Box(
            modifier = Modifier
                .size(320.dp)
                .scale(glowScale)
                .alpha(glowAlpha)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            Color(0xFFFF0055).copy(alpha = 0.45f),
                            Color(0xFF7C5CFF).copy(alpha = 0.25f),
                            Color.Transparent
                        )
                    ),
                    shape = CircleShape
                )
        )

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(horizontal = 32.dp)
        ) {
            // Ãcone 3D / TV Box futurista
            Box(
                modifier = Modifier
                    .scale(logoScale.value)
                    .alpha(logoAlpha.value)
                    .size(110.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0xFF241838), Color(0xFF130E22), Color(0xFF0B0716))
                        )
                    )
                    .border(
                        width = 2.dp,
                        brush = Brush.linearGradient(
                            listOf(Color(0xFFFF0055), Color(0xFF7C5CFF), Color(0xFF00FFCC))
                        ),
                        shape = RoundedCornerShape(28.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                // Desenho do Play estilizado no centro
                Canvas(modifier = Modifier.size(46.dp)) {
                    val path = Path().apply {
                        moveTo(size.width * 0.28f, size.height * 0.18f)
                        lineTo(size.width * 0.82f, size.height * 0.50f)
                        lineTo(size.width * 0.28f, size.height * 0.82f)
                        close()
                    }
                    drawPath(
                        path = path,
                        brush = Brush.linearGradient(
                            listOf(Color(0xFFFFFFFF), Color(0xFFFF3366), Color(0xFF7C5CFF))
                        )
                    )
                }

                // LED frontal aceso no rodapÃ© da caixinha
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 8.dp)
                        .size(6.dp)
                        .background(Color(0xFF00FFCC), shape = CircleShape)
                )
            }

            Spacer(Modifier.height(20.dp))

            // Nome da Marca "BoxTv"
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .scale(logoScale.value)
                    .alpha(logoAlpha.value)
            ) {
                Text(
                    text = "Box",
                    color = Color.White,
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-1).sp
                )
                Text(
                    text = "Tv",
                    color = Color(0xFFFF0055),
                    fontSize = 40.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-1).sp
                )
                Text(
                    text = " ⚡",
                    fontSize = 28.sp,
                    modifier = Modifier.padding(start = 2.dp)
                )
            }

            Spacer(Modifier.height(10.dp))

            // Slogan Oficial e Chamativo
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.alpha(sloganAlpha.value)
            ) {
                Text(
                    text = "O MELHOR DO ENTRETENIMENTO",
                    color = Color(0xFFFFC857),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 3.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Canais Ao Vivo \u00B7 Filmes \u00B7 S\u00E9ries \u00B7 Jogos",
                    color = Color(0xFF9E9EB8),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 1.sp,
                    textAlign = TextAlign.Center
                )
            }

            Spacer(Modifier.height(36.dp))

            // Barra de Carregamento Futurista
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .alpha(progressAlpha.value)
                    .widthIn(max = 280.dp)
                    .fillMaxWidth()
            ) {
                // Trilho da barra
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(5.dp)
                        .clip(RoundedCornerShape(3.dp))
                        .background(Color(0x33FFFFFF))
                ) {
                    // Barra animada com gradiente e shimmer
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.85f)
                            .height(5.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(
                                Brush.horizontalGradient(
                                    colors = listOf(
                                        Color(0xFFFF0055),
                                        Color(0xFF7C5CFF),
                                        Color(0xFF00FFCC)
                                    ),
                                    startX = shimmerOffset * 300f,
                                    endX = (shimmerOffset + 1f) * 300f
                                )
                            )
                    )
                }

                Spacer(Modifier.height(14.dp))

                // Texto dinÃ¢mico de status
                AnimatedContent(
                    targetState = statusText,
                    transitionSpec = { fadeIn(tween(180)) togetherWith fadeOut(tween(120)) },
                    label = "box-tv-loading-status",
                ) { status ->
                    Text(
                        text = status,
                        color = Color(0xFFB5B5D0),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Normal,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

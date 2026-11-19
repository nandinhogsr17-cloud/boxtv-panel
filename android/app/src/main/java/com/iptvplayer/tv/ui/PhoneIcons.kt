package com.iptvplayer.tv.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** Ícones de linha desenhados no Canvas (sem depender de pacote de ícones). */
enum class PhoneIcon { HOME, LIVE, MOVIES, SERIES, SOCCER, SEARCH, STAR, STAR_FILLED, CHEVRON_DOWN, LIST, FULLSCREEN, SETTINGS, CHEVRON_RIGHT, REFRESH, EXIT, PLAY, SCREEN, SPEAKER, LOCK, TRASH }

@Composable
fun PhoneIconView(icon: PhoneIcon, tint: Color, modifier: Modifier = Modifier, size: Dp = 26.dp) {
    Canvas(modifier.size(size)) { drawIcon(icon, tint) }
}

private fun DrawScope.drawIcon(icon: PhoneIcon, tint: Color) {
    val w = size.width
    val sw = w * 0.085f
    val line = Stroke(width = sw, cap = StrokeCap.Round, join = StrokeJoin.Round)
    fun p(x: Float, y: Float) = Offset(w * x, w * y)
    when (icon) {
        PhoneIcon.HOME -> {
            val path = Path().apply {
                moveTo(w * 0.12f, w * 0.48f); lineTo(w * 0.5f, w * 0.14f); lineTo(w * 0.88f, w * 0.48f)
                moveTo(w * 0.22f, w * 0.42f); lineTo(w * 0.22f, w * 0.86f); lineTo(w * 0.78f, w * 0.86f); lineTo(w * 0.78f, w * 0.42f)
                moveTo(w * 0.42f, w * 0.86f); lineTo(w * 0.42f, w * 0.6f); lineTo(w * 0.58f, w * 0.6f); lineTo(w * 0.58f, w * 0.86f)
            }
            drawPath(path, tint, style = line)
        }
        PhoneIcon.LIVE -> {
            drawRoundRect(tint, p(0.1f, 0.3f), Size(w * 0.8f, w * 0.56f), CornerRadius(w * 0.1f), style = line)
            drawLine(tint, p(0.34f, 0.12f), p(0.5f, 0.3f), sw, StrokeCap.Round)
            drawLine(tint, p(0.66f, 0.12f), p(0.5f, 0.3f), sw, StrokeCap.Round)
        }
        PhoneIcon.MOVIES -> {
            drawRoundRect(tint, p(0.12f, 0.14f), Size(w * 0.76f, w * 0.72f), CornerRadius(w * 0.08f), style = line)
            drawLine(tint, p(0.32f, 0.14f), p(0.32f, 0.86f), sw, StrokeCap.Round)
            drawLine(tint, p(0.68f, 0.14f), p(0.68f, 0.86f), sw, StrokeCap.Round)
            for (y in listOf(0.3f, 0.5f, 0.7f)) {
                drawLine(tint, p(0.12f, y), p(0.32f, y), sw * 0.8f, StrokeCap.Round)
                drawLine(tint, p(0.68f, y), p(0.88f, y), sw * 0.8f, StrokeCap.Round)
            }
        }
        PhoneIcon.SERIES -> {
            drawLine(tint, p(0.22f, 0.16f), p(0.78f, 0.16f), sw, StrokeCap.Round)
            drawLine(tint, p(0.14f, 0.3f), p(0.86f, 0.3f), sw, StrokeCap.Round)
            drawRoundRect(tint, p(0.1f, 0.42f), Size(w * 0.8f, w * 0.46f), CornerRadius(w * 0.09f), style = line)
            val tri = Path().apply { moveTo(w * 0.43f, w * 0.52f); lineTo(w * 0.62f, w * 0.65f); lineTo(w * 0.43f, w * 0.78f); close() }
            drawPath(tri, tint, style = line)
        }
        PhoneIcon.SOCCER -> {
            val c = p(0.5f, 0.5f)
            drawCircle(tint, w * 0.4f, c, style = line)
            val pent = Path()
            for (i in 0 until 5) {
                val a = (-90.0 + i * 72.0) * PI / 180.0
                val x = c.x + (w * 0.15f) * cos(a).toFloat()
                val y = c.y + (w * 0.15f) * sin(a).toFloat()
                if (i == 0) pent.moveTo(x, y) else pent.lineTo(x, y)
                val ox = c.x + (w * 0.4f) * cos(a).toFloat()
                val oy = c.y + (w * 0.4f) * sin(a).toFloat()
                drawLine(tint, Offset(x, y), Offset(ox, oy), sw * 0.8f, StrokeCap.Round)
            }
            pent.close()
            drawPath(pent, tint, style = line)
        }
        PhoneIcon.SEARCH -> {
            drawCircle(tint, w * 0.28f, p(0.44f, 0.44f), style = line)
            drawLine(tint, p(0.65f, 0.65f), p(0.86f, 0.86f), sw, StrokeCap.Round)
        }
        PhoneIcon.STAR, PhoneIcon.STAR_FILLED -> {
            val c = p(0.5f, 0.54f)
            val path = Path()
            for (i in 0 until 10) {
                val r = if (i % 2 == 0) w * 0.4f else w * 0.17f
                val a = (-90.0 + i * 36.0) * PI / 180.0
                val x = c.x + r * cos(a).toFloat()
                val y = c.y + r * sin(a).toFloat()
                if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            path.close()
            if (icon == PhoneIcon.STAR_FILLED) drawPath(path, tint, style = Fill) else drawPath(path, tint, style = line)
        }
        PhoneIcon.CHEVRON_DOWN -> {
            val path = Path().apply { moveTo(w * 0.22f, w * 0.38f); lineTo(w * 0.5f, w * 0.66f); lineTo(w * 0.78f, w * 0.38f) }
            drawPath(path, tint, style = line)
        }
        PhoneIcon.LIST -> {
            drawRoundRect(tint, p(0.12f, 0.16f), Size(w * 0.76f, w * 0.68f), CornerRadius(w * 0.1f), style = line)
            for (y in listOf(0.36f, 0.5f, 0.64f)) drawLine(tint, p(0.28f, y), p(0.72f, y), sw * 0.85f, StrokeCap.Round)
        }
        PhoneIcon.SETTINGS -> {
            val c = p(0.5f, 0.5f)
            drawCircle(tint, w * 0.16f, c, style = line)
            for (i in 0 until 8) {
                val a = (i * 45.0) * PI / 180.0
                val x1 = c.x + (w * 0.27f) * cos(a).toFloat()
                val y1 = c.y + (w * 0.27f) * sin(a).toFloat()
                val x2 = c.x + (w * 0.4f) * cos(a).toFloat()
                val y2 = c.y + (w * 0.4f) * sin(a).toFloat()
                drawLine(tint, Offset(x1, y1), Offset(x2, y2), sw * 1.2f, StrokeCap.Round)
            }
            drawCircle(tint, w * 0.27f, c, style = line)
        }
        PhoneIcon.CHEVRON_RIGHT -> {
            val path = Path().apply { moveTo(w * 0.38f, w * 0.22f); lineTo(w * 0.66f, w * 0.5f); lineTo(w * 0.38f, w * 0.78f) }
            drawPath(path, tint, style = line)
        }
        PhoneIcon.REFRESH -> {
            drawArc(tint, -40f, 280f, false, p(0.2f, 0.2f), Size(w * 0.6f, w * 0.6f), style = line)
            val head = Path().apply { moveTo(w * 0.74f, w * 0.12f); lineTo(w * 0.74f, w * 0.34f); lineTo(w * 0.52f, w * 0.34f) }
            drawPath(head, tint, style = line)
        }
        PhoneIcon.EXIT -> {
            val door = Path().apply { moveTo(w * 0.42f, w * 0.14f); lineTo(w * 0.16f, w * 0.14f); lineTo(w * 0.16f, w * 0.86f); lineTo(w * 0.42f, w * 0.86f) }
            drawPath(door, tint, style = line)
            drawLine(tint, p(0.36f, 0.5f), p(0.86f, 0.5f), sw, StrokeCap.Round)
            val arrow = Path().apply { moveTo(w * 0.68f, w * 0.32f); lineTo(w * 0.86f, w * 0.5f); lineTo(w * 0.68f, w * 0.68f) }
            drawPath(arrow, tint, style = line)
        }
        PhoneIcon.PLAY -> {
            drawRoundRect(tint, p(0.1f, 0.16f), Size(w * 0.8f, w * 0.68f), CornerRadius(w * 0.12f), style = line)
            val tri = Path().apply { moveTo(w * 0.42f, w * 0.34f); lineTo(w * 0.66f, w * 0.5f); lineTo(w * 0.42f, w * 0.66f); close() }
            drawPath(tri, tint, style = line)
        }
        PhoneIcon.SCREEN -> {
            drawRoundRect(tint, p(0.1f, 0.18f), Size(w * 0.8f, w * 0.52f), CornerRadius(w * 0.08f), style = line)
            drawLine(tint, p(0.5f, 0.7f), p(0.5f, 0.84f), sw, StrokeCap.Round)
            drawLine(tint, p(0.32f, 0.84f), p(0.68f, 0.84f), sw, StrokeCap.Round)
        }
        PhoneIcon.SPEAKER -> {
            val sp = Path().apply {
                moveTo(w * 0.14f, w * 0.4f); lineTo(w * 0.32f, w * 0.4f); lineTo(w * 0.52f, w * 0.22f)
                lineTo(w * 0.52f, w * 0.78f); lineTo(w * 0.32f, w * 0.6f); lineTo(w * 0.14f, w * 0.6f); close()
            }
            drawPath(sp, tint, style = line)
            drawArc(tint, -50f, 100f, false, p(0.52f, 0.3f), Size(w * 0.34f, w * 0.4f), style = line)
        }
        PhoneIcon.LOCK -> {
            drawRoundRect(tint, p(0.2f, 0.44f), Size(w * 0.6f, w * 0.42f), CornerRadius(w * 0.08f), style = line)
            drawArc(tint, 180f, 180f, false, p(0.3f, 0.14f), Size(w * 0.4f, w * 0.64f), style = line)
            drawLine(tint, p(0.5f, 0.58f), p(0.5f, 0.72f), sw, StrokeCap.Round)
        }
        PhoneIcon.TRASH -> {
            drawLine(tint, p(0.16f, 0.26f), p(0.84f, 0.26f), sw, StrokeCap.Round)
            drawLine(tint, p(0.38f, 0.26f), p(0.38f, 0.16f), sw, StrokeCap.Round)
            drawLine(tint, p(0.62f, 0.26f), p(0.62f, 0.16f), sw, StrokeCap.Round)
            val bin = Path().apply { moveTo(w * 0.24f, w * 0.26f); lineTo(w * 0.3f, w * 0.86f); lineTo(w * 0.7f, w * 0.86f); lineTo(w * 0.76f, w * 0.26f) }
            drawPath(bin, tint, style = line)
        }
        PhoneIcon.FULLSCREEN -> {
            val path = Path().apply {
                moveTo(w * 0.14f, w * 0.36f); lineTo(w * 0.14f, w * 0.14f); lineTo(w * 0.36f, w * 0.14f)
                moveTo(w * 0.64f, w * 0.14f); lineTo(w * 0.86f, w * 0.14f); lineTo(w * 0.86f, w * 0.36f)
                moveTo(w * 0.86f, w * 0.64f); lineTo(w * 0.86f, w * 0.86f); lineTo(w * 0.64f, w * 0.86f)
                moveTo(w * 0.36f, w * 0.86f); lineTo(w * 0.14f, w * 0.86f); lineTo(w * 0.14f, w * 0.64f)
            }
            drawPath(path, tint, style = line)
        }
    }
}

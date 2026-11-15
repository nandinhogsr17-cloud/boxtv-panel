package com.iptvplayer.tv.ui

import android.view.View
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView

@Composable
fun CastRouteButton(modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(13.dp)
    val base = modifier
        .size(38.dp)
        .clip(shape)
        .background(Surface1)
        .border(1.dp, Accent.copy(alpha = 0.34f), shape)
        .semantics { contentDescription = "Transmitir vídeo para uma TV" }

    AndroidView(
        factory = { viewContext ->
            try {
                // Tenta inicializar CastContext se disponível
                val castClass = Class.forName("com.google.android.gms.cast.framework.CastContext")
                val getMethod = castClass.getMethod("getSharedInstance", android.content.Context::class.java)
                getMethod.invoke(null, viewContext)

                val btn = androidx.mediarouter.app.MediaRouteButton(viewContext)
                com.google.android.gms.cast.framework.CastButtonFactory.setUpMediaRouteButton(viewContext, btn)
                btn.contentDescription = "Transmitir vídeo para uma TV"
                btn
            } catch (_: Throwable) {
                // Se o Google Cast não estiver presente ou o tema não for compatível, não quebra o app
                View(viewContext)
            }
        },
        modifier = base,
    )
}

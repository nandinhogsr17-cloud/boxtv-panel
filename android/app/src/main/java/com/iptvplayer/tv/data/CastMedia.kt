package com.iptvplayer.tv.data

import android.net.Uri
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.common.images.WebImage

object CastMedia {
    fun send(
        session: CastSession,
        item: Item,
        positionMs: Long,
        onResult: (success: Boolean, statusCode: Int) -> Unit,
    ): Boolean {
        val url = item.url?.takeIf { it.isNotBlank() } ?: return false
        val remote = session.remoteMediaClient ?: return false
        val metadata = MediaMetadata(
            if (item.isLive) MediaMetadata.MEDIA_TYPE_TV_SHOW else MediaMetadata.MEDIA_TYPE_MOVIE,
        ).apply {
            putString(MediaMetadata.KEY_TITLE, item.title)
            if (item.group.isNotBlank()) putString(MediaMetadata.KEY_SUBTITLE, item.group)
            item.posterUrl?.takeIf { it.startsWith("https://") || it.startsWith("http://") }?.let {
                addImage(WebImage(Uri.parse(it)))
            }
        }
        val fallback = if (item.isLive) {
            Regex("(?i)\\.ts(?=([?#]|$))").replaceFirst(url, ".m3u8").takeIf { it != url }
        } else null
        val initialPosition = if (item.isLive) 0L else positionMs.coerceAtLeast(0L)
        runCatching {
            remote.load(mediaInfo(url, item, metadata), true, initialPosition).setResultCallback { first ->
                if (first.status.isSuccess || fallback == null) {
                    onResult(first.status.isSuccess, first.status.statusCode)
                } else {
                    runCatching {
                        remote.load(mediaInfo(fallback, item, metadata), true, 0L).setResultCallback { retry ->
                            onResult(retry.status.isSuccess, retry.status.statusCode)
                        }
                    }.onFailure { onResult(false, -1) }
                }
            }
        }.onFailure {
            onResult(false, -1)
            return false
        }
        return true
    }

    private fun mediaInfo(url: String, item: Item, metadata: MediaMetadata): MediaInfo =
        MediaInfo.Builder(url)
            .setContentType(contentType(url, item.isLive))
            .setStreamType(if (item.isLive) MediaInfo.STREAM_TYPE_LIVE else MediaInfo.STREAM_TYPE_BUFFERED)
            .setMetadata(metadata)
            .build()

    private fun contentType(url: String, isLive: Boolean): String {
        val path = runCatching { Uri.parse(url).lastPathSegment.orEmpty().lowercase() }.getOrDefault("")
        return when {
            path.endsWith(".m3u8") -> "application/x-mpegURL"
            path.endsWith(".mpd") -> "application/dash+xml"
            path.endsWith(".webm") -> "video/webm"
            path.endsWith(".mp4") || path.endsWith(".m4v") -> "video/mp4"
            path.endsWith(".ts") || isLive -> "video/mp2t"
            path.endsWith(".mkv") -> "video/x-matroska"
            path.endsWith(".avi") -> "video/x-msvideo"
            path.endsWith(".mpg") || path.endsWith(".mpeg") -> "video/mpeg"
            else -> "application/octet-stream"
        }
    }
}
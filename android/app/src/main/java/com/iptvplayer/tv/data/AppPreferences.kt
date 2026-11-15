package com.iptvplayer.tv.data

import android.content.Context

data class AppSettings(
    val videoQuality: String = "auto",
    val aspectRatio: String = "fit",
    val audioLanguage: String = "auto",
    val subtitleLanguage: String = "off",
    val skipSeconds: Int = 10,
    val bufferMode: String = "balanced",
    val resumePlayback: Boolean = true,
    val autoNextEpisode: Boolean = true,
    val decoderFallback: Boolean = true,
)

object AppPreferences {
    private const val FILE = "iptv_playback_settings"

    fun read(context: Context): AppSettings {
        val prefs = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        return AppSettings(
            videoQuality = prefs.getString("video_quality", "auto") ?: "auto",
            aspectRatio = prefs.getString("aspect_ratio", "fit") ?: "fit",
            audioLanguage = prefs.getString("audio_language", "auto") ?: "auto",
            subtitleLanguage = prefs.getString("subtitle_language", "off") ?: "off",
            skipSeconds = prefs.getInt("skip_seconds", 10).coerceIn(5, 30),
            bufferMode = prefs.getString("buffer_mode", "balanced") ?: "balanced",
            resumePlayback = prefs.getBoolean("resume_playback", true),
            autoNextEpisode = prefs.getBoolean("auto_next_episode", true),
            decoderFallback = prefs.getBoolean("decoder_fallback", true),
        )
    }

    fun save(context: Context, settings: AppSettings) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putString("video_quality", settings.videoQuality)
            .putString("aspect_ratio", settings.aspectRatio)
            .putString("audio_language", settings.audioLanguage)
            .putString("subtitle_language", settings.subtitleLanguage)
            .putInt("skip_seconds", settings.skipSeconds.coerceIn(5, 30))
            .putString("buffer_mode", settings.bufferMode)
            .putBoolean("resume_playback", settings.resumePlayback)
            .putBoolean("auto_next_episode", settings.autoNextEpisode)
            .putBoolean("decoder_fallback", settings.decoderFallback)
            .apply()
    }
}

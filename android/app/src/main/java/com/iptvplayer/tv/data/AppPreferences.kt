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
    val reopenLastChannel: Boolean = false,
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
            reopenLastChannel = prefs.getBoolean("reopen_last_channel", false),
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
            .putBoolean("reopen_last_channel", settings.reopenLastChannel)
            .apply()
    }
}

/** Último canal ao vivo assistido (id + categoria), para reabrir ao iniciar. */
object LastChannel {
    private const val FILE = "iptv_last_channel"
    fun id(context: Context): String? = try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("id", null) } catch (_: Exception) { null }
    fun group(context: Context): String? = try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("group", null) } catch (_: Exception) { null }
    fun set(context: Context, id: String, group: String) {
        try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("id", id).putString("group", group).apply() } catch (_: Exception) {}
    }
}

/** Memória de navegação: última categoria aberta em cada seção (Ao vivo, Filmes, Séries). */
object UiMemory {
    private const val FILE = "iptv_ui_memory"

    fun getGroup(context: Context, type: String): String? =
        try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("group_$type", null) } catch (_: Exception) { null }

    fun setGroup(context: Context, type: String, group: String?) {
        try {
            context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().apply {
                if (group == null) remove("group_$type") else putString("group_$type", group)
            }.apply()
        } catch (_: Exception) {}
    }
}

/**
 * Senha de conteúdo adulto. Fica só neste aparelho (guardada como hash). Com a senha ativa e bloqueada,
 * o app pede ao painel para esconder categorias, buscas e destaques adultos. "Liberar" vale até fechar o app.
 */
object AdultLock {
    private const val FILE = "iptv_adult_lock"
    @Volatile var unlocked: Boolean = false

    private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    private fun hash(pin: String): String {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        return md.digest(("boxtv-adult:$pin").toByteArray()).joinToString("") { "%02x".format(it) }
    }

    fun hasPin(context: Context): Boolean =
        try { !prefs(context).getString("pin", null).isNullOrEmpty() } catch (_: Exception) { false }

    /** True quando o conteúdo adulto deve ficar escondido agora. */
    fun hidden(context: Context): Boolean = hasPin(context) && !unlocked

    fun setPin(context: Context, pin: String) {
        prefs(context).edit().putString("pin", hash(pin)).apply()
        unlocked = false
    }

    fun verify(context: Context, pin: String): Boolean =
        try { prefs(context).getString("pin", null) == hash(pin) } catch (_: Exception) { false }

    fun clearPin(context: Context) {
        prefs(context).edit().remove("pin").apply()
        unlocked = false
    }
}

/** Guarda o último erro que fechou o app para aparecer em Configurações → Ajuda e diagnóstico (com botão de copiar). */
object CrashLog {
    private const val FILE = "iptv_crash"

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val text = buildString {
                    append(java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date()))
                    append(" · ").append(android.os.Build.MANUFACTURER).append(' ').append(android.os.Build.MODEL)
                    append(" · Android ").append(android.os.Build.VERSION.RELEASE).append('\n')
                    append(android.util.Log.getStackTraceString(error).take(2500))
                }
                app.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("last", text).commit()
            } catch (_: Throwable) {
            }
            previous?.uncaughtException(thread, error)
        }
    }

    fun last(context: Context): String? =
        try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("last", null) } catch (_: Exception) { null }

    fun clear(context: Context) {
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().remove("last").apply()
    }
}

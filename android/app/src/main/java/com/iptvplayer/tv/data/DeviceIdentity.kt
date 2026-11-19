package com.iptvplayer.tv.data

import android.content.Context
import java.security.SecureRandom

object DeviceIdentity {
    data class Id(val mac: String, val key: String)

    fun get(context: Context): Id {
        val prefs = context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
        var mac = prefs.getString("mac", null)
        var key = prefs.getString("key", null)
        if (mac == null || key == null) {
            val random = SecureRandom()
            val macBytes = ByteArray(6)
            random.nextBytes(macBytes)
            macBytes[0] = ((macBytes[0].toInt() and 0xFC) or 0x02).toByte()
            mac = macBytes.joinToString(":") { "%02X".format(it) }
            val chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
            key = (1..8).map { chars[random.nextInt(chars.length)] }.joinToString("")
            prefs.edit().putString("mac", mac).putString("key", key).apply()
        }
        return Id(mac, key)
    }

    fun saveAuth(context: Context, user: String, pass: String) {
        val saved = runCatching { CredentialVault.save(context, user, pass) }.isSuccess
        val prefs = context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
        if (saved) {
            // Guardado cifrado: remove qualquer cópia em texto de versões antigas.
            prefs.edit().remove("username").remove("password").apply()
        } else {
            // Algumas TVs/boxes têm o cofre do Android quebrado. Sem isso o app pediria o login a cada abertura,
            // então guarda na área privada do app (outros apps não leem).
            CredentialVault.clear(context)
            prefs.edit().putString("username", user).putString("password", pass).apply()
        }
    }

    fun migrateAuth(context: Context) { getAuth(context) }

    fun getAuth(context: Context): Pair<String?, String?> {
        CredentialVault.read(context)?.let { return it.first to it.second }
        val prefs = context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
        val user = prefs.getString("username", null)
        val pass = prefs.getString("password", null)
        if (!user.isNullOrBlank() && pass != null) {
            val saved = runCatching { CredentialVault.save(context, user, pass) }.isSuccess
            if (saved) prefs.edit().remove("username").remove("password").apply()
            return user to pass
        }
        return null to null
    }

    fun getServerUrl(context: Context, defaultUrl: String): String {
        val prefs = context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
        return prefs.getString("server_url", null)?.takeIf { it.isNotBlank() } ?: defaultUrl
    }

    fun getXtreamHost(context: Context, defaultUrl: String): String {
        val prefs = context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
        return prefs.getString("xtream_host", null)?.takeIf { it.isNotBlank() } ?: defaultUrl
    }

    fun getServerRev(context: Context): Int =
        context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE).getInt("server_rev", 0)

    fun saveServerRev(context: Context, rev: Int) {
        context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE).edit().putInt("server_rev", rev).apply()
    }

    fun saveXtreamHost(context: Context, url: String) {
        context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
            .edit().putString("xtream_host", url.trim().trimEnd('/')).apply()
    }

    fun saveServerUrl(context: Context, url: String) {
        context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
            .edit().putString("server_url", url.trim().trimEnd('/')).apply()
    }

    fun clearAuth(context: Context) {
        CredentialVault.clear(context)
        context.getSharedPreferences("iptv_device", Context.MODE_PRIVATE)
            .edit().remove("username").remove("password").apply()
    }
}
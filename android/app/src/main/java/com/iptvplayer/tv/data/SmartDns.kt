package com.iptvplayer.tv.data

import android.content.Context
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

/**
 * DNS escolhido pelo usuário (Configurações > Rede e DNS). Muitas operadoras bloqueiam ou adulteram o DNS de
 * servidores IPTV: o canal não abre, vira tela preta ou carrega sem fim. Trocar o DNS resolve boa parte desses casos.
 *  auto       = DNS do aparelho; se falhar ou devolver endereço falso, tenta Cloudflare e depois Google (recomendado)
 *  cloudflare = Cloudflare (1.1.1.1) primeiro
 *  google     = Google (8.8.8.8) primeiro
 *  system     = só o DNS do aparelho
 * A consulta usa DNS sobre HTTPS, então a operadora não consegue bloquear nem trocar a resposta.
 */
object DnsPrefs {
    private const val FILE = "iptv_dns"
    @Volatile var mode: String = "auto"

    val options = listOf(
        "auto" to "Automático (recomendado)",
        "cloudflare" to "Cloudflare 1.1.1.1",
        "google" to "Google 8.8.8.8",
        "system" to "Somente o DNS do aparelho",
    )

    fun label(m: String): String = options.firstOrNull { it.first == m }?.second ?: options.first().second

    fun load(context: Context) {
        mode = try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString("mode", "auto") ?: "auto" } catch (_: Exception) { "auto" }
        if (options.none { it.first == mode }) mode = "auto"
    }

    fun save(context: Context, m: String) {
        if (options.none { it.first == m }) return
        mode = m
        FallbackDns.clearCache()
        try { context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString("mode", m).apply() } catch (_: Exception) {}
    }
}

object FallbackDns : Dns {
    // IPs fixos do Render (boxtv-panel.onrender.com) — último recurso quando todo DNS falha
    private val renderIps by lazy {
        listOf(InetAddress.getByName("216.24.57.18"), InetAddress.getByName("216.24.57.16"))
    }

    private val bootstrap by lazy {
        OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(5, TimeUnit.SECONDS)
            .callTimeout(8, TimeUnit.SECONDS)
            .build()
    }

    private class Entry(val at: Long, val ttlMs: Long, val addrs: List<InetAddress>)
    private val cache = ConcurrentHashMap<String, Entry>()

    fun clearCache() = cache.clear()

    private enum class Source { SYSTEM, CLOUDFLARE, GOOGLE }

    /** Endereços que operadoras devolvem para bloquear um site (ou lixo): não servem. */
    private fun bogus(host: String, list: List<InetAddress>): Boolean {
        if (list.isEmpty()) return true
        if (list.all { it.isAnyLocalAddress || it.isLoopbackAddress }) return true
        // onrender.com só existe em 216.24.x.x
        if (host.endsWith(".onrender.com")) {
            return list.none { a -> val b = a.address; b.size == 4 && (b[0].toInt() and 0xFF) == 216 && (b[1].toInt() and 0xFF) == 24 }
        }
        return false
    }

    private fun resolve(src: Source, host: String): Pair<List<InetAddress>, Long> = when (src) {
        Source.SYSTEM -> (runCatching { Dns.SYSTEM.lookup(host) }.getOrNull() ?: emptyList()) to 0L
        Source.CLOUDFLARE -> doh("https://1.1.1.1/dns-query?name=${java.net.URLEncoder.encode(host, "UTF-8")}&type=A", host)
        Source.GOOGLE -> doh("https://8.8.8.8/resolve?name=${java.net.URLEncoder.encode(host, "UTF-8")}&type=A", host)
    }

    private fun doh(url: String, host: String): Pair<List<InetAddress>, Long> {
        return try {
            val req = Request.Builder().url(url).header("accept", "application/dns-json").build()
            bootstrap.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return emptyList<InetAddress>() to 0L
                val (ips, ttl) = parseDoh(r.body?.string().orEmpty())
                ips.mapNotNull { runCatching { InetAddress.getByName(it) }.getOrNull() } to ttl
            }
        } catch (_: Exception) {
            emptyList<InetAddress>() to 0L
        }
    }

    /** Lê a resposta JSON do DNS sobre HTTPS: endereços IPv4 (tipo 1) e o menor TTL em segundos. */
    fun parseDoh(body: String): Pair<List<String>, Long> {
        return try {
            val root = Json.parseToJsonElement(body).jsonObject
            val answers: JsonArray = root["Answer"]?.jsonArray ?: return emptyList<String>() to 0L
            val ips = ArrayList<String>()
            var ttl = Long.MAX_VALUE
            for (a in answers) {
                val o: JsonObject = a.jsonObject
                if (o["type"]?.jsonPrimitive?.int == 1) {
                    ips.add(o["data"]!!.jsonPrimitive.content)
                    ttl = minOf(ttl, o["TTL"]?.jsonPrimitive?.int?.toLong() ?: 60L)
                }
            }
            ips to (if (ttl == Long.MAX_VALUE) 0L else ttl)
        } catch (_: Exception) {
            emptyList<String>() to 0L
        }
    }

    override fun lookup(hostname: String): List<InetAddress> {
        val mode = DnsPrefs.mode
        val key = "$mode|$hostname"
        cache[key]?.let { if (System.currentTimeMillis() - it.at < it.ttlMs) return it.addrs }
        val order = when (mode) {
            "cloudflare" -> listOf(Source.CLOUDFLARE, Source.SYSTEM, Source.GOOGLE)
            "google" -> listOf(Source.GOOGLE, Source.SYSTEM, Source.CLOUDFLARE)
            "system" -> listOf(Source.SYSTEM)
            else -> listOf(Source.SYSTEM, Source.CLOUDFLARE, Source.GOOGLE)
        }
        for (src in order) {
            val (list, ttl) = resolve(src, hostname)
            if (!bogus(hostname, list)) {
                // guarda por pouco tempo (no máximo 5 min) para não consultar a cada pedaço de vídeo
                val keepMs = if (ttl > 0) ttl.coerceIn(30, 300) * 1000 else 60_000L
                cache[key] = Entry(System.currentTimeMillis(), keepMs, list)
                return list
            }
        }
        if (hostname == "boxtv-panel.onrender.com" || hostname.endsWith(".onrender.com")) return renderIps
        throw UnknownHostException("Não foi possível resolver o endereço $hostname. Verifique sua conexão ou troque o DNS em Configurações.")
    }

    /** Teste da tela de Configurações: resolve o servidor e diz qual endereço veio e quanto demorou. */
    fun test(hostname: String): String {
        val t0 = System.currentTimeMillis()
        return try {
            clearCache()
            val r = lookup(hostname)
            "OK · $hostname → ${r.first().hostAddress} (${System.currentTimeMillis() - t0} ms)"
        } catch (e: Exception) {
            "Falhou ao resolver $hostname"
        }
    }
}

/** Cliente HTTP único para vídeo e capas: usa o DNS escolhido pelo usuário. */
object NetClients {
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .dns(FallbackDns)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()
    }
}

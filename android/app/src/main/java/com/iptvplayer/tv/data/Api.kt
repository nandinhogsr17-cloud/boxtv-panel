package com.iptvplayer.tv.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.InetAddress
import java.net.URLEncoder
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit

object FallbackDns : Dns {
    // IPs fixos do Render (boxtv-panel.onrender.com) — backup quando DNS da operadora bloqueia
    private val renderIps = listOf(
        InetAddress.getByName("216.24.57.18"),
        InetAddress.getByName("216.24.57.16"),
    )

    override fun lookup(hostname: String): List<InetAddress> {
        // 1. Tenta DNS do sistema da operadora
        val systemResult = runCatching { Dns.SYSTEM.lookup(hostname) }.getOrNull()
        if (!systemResult.isNullOrEmpty()) {
            // Verifica se o IP retornado não é um "honeypot" da operadora
            // IPs válidos do Render começam com 216.24.x.x
            val validAddresses = systemResult.filter { addr ->
                val bytes = addr.address
                if (hostname.endsWith(".onrender.com") && bytes.size == 4) {
                    // Aceita apenas IPs 216.24.x.x para onrender.com
                    (bytes[0].toInt() and 0xFF) == 216 && (bytes[1].toInt() and 0xFF) == 24
                } else {
                    true // Para outros hosts, confia no DNS do sistema
                }
            }
            if (validAddresses.isNotEmpty()) return validAddresses
        }

        // 2. Fallback: IPs fixos do Render
        if (hostname == "boxtv-panel.onrender.com" || hostname.endsWith(".onrender.com")) {
            return renderIps
        }

        throw UnknownHostException("Não foi possível resolver o endereço $hostname. Verifique sua conexão.")
    }
}

class Api(
    var baseUrl: String,
    val mac: String,
    val key: String,
    var getAuth: (() -> Pair<String?, String?>)? = null,
) {
    private val client = OkHttpClient.Builder()
        .dns(FallbackDns)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(90, TimeUnit.SECONDS)
        .build()

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    private data class CacheEntry(val savedAt: Long, val value: Any)
    private val responseCache = ConcurrentHashMap<String, CacheEntry>()

    @Suppress("UNCHECKED_CAST")
    private suspend fun <T : Any> cached(key: String, ttlMs: Long, fetch: suspend () -> T): T {
        responseCache[key]?.let { entry ->
            if (System.currentTimeMillis() - entry.savedAt < ttlMs) return entry.value as T
            responseCache.remove(key)
        }
        val value = fetch()
        responseCache[key] = CacheEntry(System.currentTimeMillis(), value)
        if (responseCache.size > 96) {
            responseCache.entries.minByOrNull { it.value.savedAt }?.key?.let(responseCache::remove)
        }
        return value
    }

    private fun invalidate(vararg keys: String) {
        keys.forEach { responseCache.remove(it) }
    }

    private fun invalidatePrefixes(vararg prefixes: String) {
        responseCache.keys.toList().forEach { key ->
            if (prefixes.any { key.startsWith(it) }) responseCache.remove(key)
        }
    }

    private suspend fun perform(request: Request) = withContext(Dispatchers.IO) {
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw ApiException(response.code, "HTTP ${response.code}: ${response.message}")
        }
    }

    private fun cleanBaseUrl(): String {
        return baseUrl.trimEnd('/')
    }

    private fun newRequest(path: String): Request.Builder {
        val url = if (path.startsWith("http://") || path.startsWith("https://")) path else "${cleanBaseUrl()}$path"
        return Request.Builder()
            .url(url)
            .addHeader("X-MAC", mac)
            .addHeader("X-Key", key)
            .addHeader("Accept", "application/json")
    }

    private suspend inline fun <reified T> execute(request: Request): T = withContext(Dispatchers.IO) {
        var response = client.newCall(request).execute()
        var body = response.body?.string().orEmpty()
        val path = request.url.encodedPath
        if (response.code == 401 && !path.contains("/auth/login") && !path.contains("/register")) {
            val (u, p) = getAuth?.invoke() ?: (null to null)
            if (!u.isNullOrBlank() && !p.isNullOrBlank()) {
                try {
                    login(u, p)
                    response.close()
                    response = client.newCall(request).execute()
                    body = response.body?.string().orEmpty()
                } catch (_: Exception) {}
            }
        }
        if (!response.isSuccessful) {
            try {
                val errObj = json.decodeFromString<Map<String, String>>(body)
                throw ApiException(
                    httpCode = response.code,
                    error = errObj["error"] ?: "HTTP ${response.code}",
                    status = errObj["status"]
                )
            } catch (e: Exception) {
                if (e is ApiException) throw e
                throw ApiException(response.code, "HTTP ${response.code}: $body")
            }
        }
        json.decodeFromString<T>(body)
    }

    suspend fun register(appVersion: String, model: String): StatusResponse {
        val payload = """{"mac":${Json.encodeToString(mac)},"key":${Json.encodeToString(key)},"appVersion":${Json.encodeToString(appVersion)},"model":${Json.encodeToString(model)}}"""
        val req = newRequest("/api/v1/register")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        return execute(req)
    }

    suspend fun status(): StatusResponse {
        val req = newRequest("/api/v1/status").get().build()
        return cached("status", TimeUnit.SECONDS.toMillis(10)) { execute<StatusResponse>(req) }
    }

    suspend fun login(user: String, pass: String, template: String? = null, serverHost: String? = null): StatusResponse {
        val reqObj = LoginRequest(
            username = user,
            password = pass,
            mac = mac,
            key = key,
            template = template,
            serverHost = serverHost,
        )
        val payload = json.encodeToString(reqObj)
        val req = newRequest("/api/v1/auth/login")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        val result = execute<StatusResponse>(req)
        responseCache.clear()
        return result
    }

    suspend fun home(): HomeResponse {
        val req = newRequest("/api/v1/home").get().build()
        return cached("home", TimeUnit.SECONDS.toMillis(30)) { execute<HomeResponse>(req) }
    }

    suspend fun browse(type: String, group: String?, q: String?, offset: Int, limit: Int, force: Boolean = false): BrowseResponse {
        val b = StringBuilder("/api/v1/browse?type=").append(type)
        if (!group.isNullOrBlank()) b.append("&group=").append(URLEncoder.encode(group, "UTF-8"))
        if (!q.isNullOrBlank()) b.append("&q=").append(URLEncoder.encode(q, "UTF-8"))
        b.append("&offset=").append(offset).append("&limit=").append(limit)
        if (force) b.append("&force=1")
        val req = newRequest(b.toString()).get().build()
        val cacheKey = "browse:$type:${group.orEmpty()}:${q.orEmpty()}:$offset:$limit"
        if (force) responseCache.remove(cacheKey)
        return if (force) execute(req) else cached(cacheKey, TimeUnit.SECONDS.toMillis(45)) { execute<BrowseResponse>(req) }
    }

    suspend fun search(q: String): SearchResponse {
        val req = newRequest("/api/v1/search?q=" + URLEncoder.encode(q, "UTF-8")).get().build()
        return cached("search:${q.lowercase()}", TimeUnit.SECONDS.toMillis(25)) { execute<SearchResponse>(req) }
    }

    suspend fun series(id: String): SeriesDetail {
        val req = newRequest("/api/v1/series/$id").get().build()
        return cached("series:$id", TimeUnit.MINUTES.toMillis(2)) { execute<SeriesDetail>(req) }
    }

    suspend fun item(id: String): Item {
        val req = newRequest("/api/v1/item/$id").get().build()
        return cached("item:$id", TimeUnit.SECONDS.toMillis(45)) { execute<Item>(req) }
    }

    suspend fun meta(id: String): MetaResponse {
        val req = newRequest("/api/v1/meta?id=" + URLEncoder.encode(id, "UTF-8")).get().build()
        return cached("meta:$id", TimeUnit.MINUTES.toMillis(10)) { execute<MetaResponse>(req) }
    }

    suspend fun favorites(type: String? = null): FavoritesResponse {
        val path = if (type != null) "/api/v1/favorites?type=$type" else "/api/v1/favorites"
        val req = newRequest(path).get().build()
        return cached("favorites:${type.orEmpty()}", TimeUnit.SECONDS.toMillis(30)) { execute<FavoritesResponse>(req) }
    }

    suspend fun addFavorite(id: String) {
        val payload = """{"id":${Json.encodeToString(id)}}"""
        val req = newRequest("/api/v1/favorites")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        perform(req)
        invalidate("home")
        invalidatePrefixes("favorites:", "browse:")
    }

    suspend fun removeFavorite(id: String) {
        val req = newRequest("/api/v1/favorites/$id").delete().build()
        perform(req)
        invalidate("home")
        invalidatePrefixes("favorites:", "browse:")
    }

    suspend fun saveProgress(id: String, posMs: Long, durMs: Long) {
        val payload = """{"id":${Json.encodeToString(id)},"positionMs":$posMs,"durationMs":$durMs}"""
        val req = newRequest("/api/v1/progress")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        perform(req)
        invalidate("home", "item:$id")
    }

    suspend fun games(date: String? = null): GamesResponse {
        val url = if (date != null) "/api/v1/games?date=" + URLEncoder.encode(date, "UTF-8") else "/api/v1/games"
        val req = newRequest(url).get().build()
        return cached("games:${date.orEmpty()}", TimeUnit.SECONDS.toMillis(30)) { execute<GamesResponse>(req) }
    }

    suspend fun epg(id: String): EpgResponse {
        val req = newRequest("/api/v1/epg?id=" + URLEncoder.encode(id, "UTF-8")).get().build()
        return cached("epg:$id", TimeUnit.MINUTES.toMillis(2)) { execute<EpgResponse>(req) }
    }

    suspend fun refresh() {
        val req = newRequest("/api/v1/refresh").post("{}".toRequestBody("application/json".toMediaType())).build()
        perform(req)
        responseCache.clear()
    }


}

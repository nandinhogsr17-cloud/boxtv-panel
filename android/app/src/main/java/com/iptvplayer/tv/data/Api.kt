package com.iptvplayer.tv.data

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.concurrent.ConcurrentHashMap
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.InetAddress
import java.net.URLEncoder
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit

class Api(
    var baseUrl: String,
    val mac: String,
    val key: String,
    var getAuth: (() -> Pair<String?, String?>)? = null,
    context: Context? = null,
) {
    private val client = OkHttpClient.Builder()
        .dns(FallbackDns)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .callTimeout(90, TimeUnit.SECONDS)
        .build()

    /** Modo "só aplicativo": fala direto com o Xtream, sem painel. Ligado sempre que há Context. */
    val direct: DirectBackend? = context?.let { DirectBackend(it, client) { hideAdult } }

    /** Senha de conteúdo adulto ativa e bloqueada: o painel esconde categorias, buscas e destaques adultos. */
    @Volatile var hideAdult: Boolean = false
        private set

    fun setHideAdult(value: Boolean) {
        if (hideAdult != value) {
            hideAdult = value
            responseCache.clear()
        }
    }

    private fun adultParam(first: Boolean): String = if (hideAdult) (if (first) "?adult=hide" else "&adult=hide") else ""

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
    }

    private data class CacheEntry(val savedAt: Long, val value: Any)
    private val responseCache = ConcurrentHashMap<String, CacheEntry>()

    @Suppress("UNCHECKED_CAST")
    private suspend fun <T : Any> cached(key: String, ttlMs: Long, fetch: suspend () -> T): T {
        val old = responseCache[key]
        if (old != null && System.currentTimeMillis() - old.savedAt < ttlMs) return old.value as T
        val value = try {
            withRetry { fetch() }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Sem rede (ou servidor acordando): mostra o último conteúdo conhecido em vez de uma tela de erro.
            if (old != null) return old.value as T
            throw e
        }
        responseCache[key] = CacheEntry(System.currentTimeMillis(), value)
        if (responseCache.size > 96) {
            responseCache.entries.minByOrNull { it.value.savedAt }?.key?.let(responseCache::remove)
        }
        return value
    }

    /** Repete até 3 vezes (1,5 s e 3 s) quando o erro é de rede ou o servidor está acordando (502/503/504). */
    private suspend fun <T> withRetry(block: suspend () -> T): T {
        var attempt = 0
        while (true) {
            try {
                return block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val transient = e is java.io.IOException ||
                    (e is ApiException && (e.httpCode == 502 || e.httpCode == 503 || e.httpCode == 504))
                if (!transient || attempt >= 2) throw e
                attempt++
                delay(1500L * attempt)
            }
        }
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
        if ((response.code == 401 || (response.code == 403 && body.contains("device_not_active"))) && !path.contains("/auth/login") && !path.contains("/register")) {
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

    suspend fun status(): StatusResponse {
        direct?.let { d -> return d.status() }
        val req = newRequest("/api/v1/status").get().build()
        return cached("status", TimeUnit.SECONDS.toMillis(10)) { execute<StatusResponse>(req) }
    }

    suspend fun login(user: String, pass: String, serverHost: String? = null): StatusResponse {
        direct?.let { d -> val r = d.login(user, pass, serverHost); responseCache.clear(); return r }
        val reqObj = LoginRequest(
            username = user,
            password = pass,
            mac = mac,
            key = key,
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
        direct?.let { d -> return d.home() }
        val req = newRequest("/api/v1/home" + adultParam(true)).get().build()
        return cached("home", TimeUnit.SECONDS.toMillis(30)) { execute<HomeResponse>(req) }
    }

    suspend fun browse(type: String, group: String?, q: String?, offset: Int, limit: Int, force: Boolean = false): BrowseResponse {
        direct?.let { d -> return d.browse(type, group, q, offset, limit, force) }
        val b = StringBuilder("/api/v1/browse?type=").append(type)
        if (!group.isNullOrBlank()) b.append("&group=").append(URLEncoder.encode(group, "UTF-8"))
        if (!q.isNullOrBlank()) b.append("&q=").append(URLEncoder.encode(q, "UTF-8"))
        b.append("&offset=").append(offset).append("&limit=").append(limit).append(adultParam(false))
        if (force) b.append("&force=1")
        val req = newRequest(b.toString()).get().build()
        val cacheKey = "browse:$type:${group.orEmpty()}:${q.orEmpty()}:$offset:$limit"
        if (force) responseCache.remove(cacheKey)
        return if (force) execute(req) else cached(cacheKey, TimeUnit.SECONDS.toMillis(45)) { execute<BrowseResponse>(req) }
    }

    suspend fun search(q: String): SearchResponse {
        direct?.let { d -> return d.search(q) }
        val req = newRequest("/api/v1/search?q=" + URLEncoder.encode(q, "UTF-8") + adultParam(false)).get().build()
        return cached("search:${q.lowercase()}", TimeUnit.SECONDS.toMillis(25)) { execute<SearchResponse>(req) }
    }

    suspend fun series(id: String): SeriesDetail {
        direct?.let { d -> return d.series(id) }
        val req = newRequest("/api/v1/series/$id").get().build()
        return cached("series:$id", TimeUnit.MINUTES.toMillis(2)) { execute<SeriesDetail>(req) }
    }

    suspend fun item(id: String): Item {
        direct?.let { d -> return d.item(id) }
        val req = newRequest("/api/v1/item/$id").get().build()
        return cached("item:$id", TimeUnit.SECONDS.toMillis(45)) { execute<Item>(req) }
    }

    suspend fun meta(id: String): MetaResponse {
        direct?.let { d -> return d.meta(id) }
        val req = newRequest("/api/v1/meta?id=" + URLEncoder.encode(id, "UTF-8")).get().build()
        return cached("meta:$id", TimeUnit.MINUTES.toMillis(10)) { execute<MetaResponse>(req) }
    }

    suspend fun favorites(type: String? = null): FavoritesResponse {
        direct?.let { d -> return d.favorites(type) }
        val path = if (type != null) "/api/v1/favorites?type=$type" else "/api/v1/favorites"
        val req = newRequest(path).get().build()
        return cached("favorites:${type.orEmpty()}", TimeUnit.SECONDS.toMillis(30)) { execute<FavoritesResponse>(req) }
    }

    suspend fun addFavorite(id: String) {
        direct?.let { d -> d.addFavorite(id); invalidate("home"); invalidatePrefixes("favorites:", "browse:"); return }
        val payload = """{"id":${Json.encodeToString(id)}}"""
        val req = newRequest("/api/v1/favorites")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        perform(req)
        invalidate("home")
        invalidatePrefixes("favorites:", "browse:")
    }

    suspend fun removeFavorite(id: String) {
        direct?.let { d -> d.removeFavorite(id); invalidate("home"); invalidatePrefixes("favorites:", "browse:"); return }
        val req = newRequest("/api/v1/favorites/$id").delete().build()
        perform(req)
        invalidate("home")
        invalidatePrefixes("favorites:", "browse:")
    }

    suspend fun saveProgress(id: String, posMs: Long, durMs: Long) {
        direct?.let { d -> d.saveProgress(id, posMs, durMs); invalidate("home", "item:$id"); return }
        val payload = """{"id":${Json.encodeToString(id)},"positionMs":$posMs,"durationMs":$durMs}"""
        val req = newRequest("/api/v1/progress")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        perform(req)
        invalidate("home", "item:$id")
    }

    // ---- Servidor IPTV único: o painel guarda o endereço; trocar lá troca em todos os aparelhos e no site ----
    suspend fun serverInfo(): ServerInfo? = withContext(Dispatchers.IO) {
        try {
            client.newCall(newRequest("/api/v1/server").get().build()).execute().use { r ->
                if (r.isSuccessful) json.decodeFromString<ServerInfo>(r.body?.string().orEmpty()) else null
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            null
        }
    }

    suspend fun setServer(password: String, host: String, force: Boolean): ServerPush = withContext(Dispatchers.IO) {
        val payload = """{"password":${Json.encodeToString(password)},"host":${Json.encodeToString(host)},"force":$force}"""
        try {
            val req = newRequest("/api/v1/server").post(payload.toRequestBody("application/json".toMediaType())).build()
            client.newCall(req).execute().use { r ->
                val body = r.body?.string().orEmpty()
                val o = runCatching { Json.parseToJsonElement(body).jsonObject }.getOrNull()
                if (r.isSuccessful) {
                    ServerPush(true, null, false, o?.get("migrated")?.jsonPrimitive?.content?.toIntOrNull() ?: 0)
                } else {
                    ServerPush(
                        false,
                        o?.get("message")?.jsonPrimitive?.content ?: "Erro ${r.code}",
                        o?.get("error")?.jsonPrimitive?.content == "unreachable",
                    )
                }
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            ServerPush(false, "Sem conexão com o painel. Tente de novo.")
        }
    }

    /**
     * Pergunta ao painel qual é o servidor atual. Se foi trocado, confere se a sua conta funciona no novo
     * (sem derrubar o que já está funcionando) e só então passa a usá-lo. Devolve o novo endereço, ou null.
     */
    suspend fun syncServer(ctx: Context): String? {
        val d = direct ?: return null
        val info = serverInfo() ?: return null
        if (info.host.isBlank() || info.rev <= DeviceIdentity.getServerRev(ctx)) return null
        val saved = DeviceIdentity.getXtreamHost(ctx, com.iptvplayer.tv.BuildConfig.XTREAM_URL)
        if (info.host.trimEnd('/').equals(saved.trimEnd('/'), ignoreCase = true)) {
            DeviceIdentity.saveServerRev(ctx, info.rev)
            return null
        }
        val (u, p) = getAuth?.invoke() ?: (null to null)
        if (u.isNullOrBlank() || p.isNullOrBlank()) return null
        if (!d.probe(info.host, u, p)) return null // a conta não funciona no servidor novo: mantém o atual e tenta de novo depois
        d.login(u, p, info.host)
        DeviceIdentity.saveXtreamHost(ctx, info.host)
        DeviceIdentity.saveServerRev(ctx, info.rev)
        responseCache.clear()
        return info.host
    }

    // ---- Jogos no modo "só aplicativo": a lista de jogos e placares vem do painel (que tem a agenda), e os canais
    // são trocados pelos do próprio Xtream do usuário para tocar direto, sem passar pelo painel. ----
    @Volatile private var panelReady = false

    private suspend fun panelLogin(d: DirectBackend) {
        val (u, p) = getAuth?.invoke() ?: (null to null)
        if (u.isNullOrBlank() || p.isNullOrBlank()) throw ApiException(401, "xtream_auth_failed")
        val payload = json.encodeToString(LoginRequest(username = u, password = p, mac = mac, key = key, serverHost = d.host()))
        val req = newRequest("/api/v1/auth/login").post(payload.toRequestBody("application/json".toMediaType())).build()
        withContext(Dispatchers.IO) {
            client.newCall(req).execute().use { r -> if (!r.isSuccessful) throw ApiException(r.code, "painel_${r.code}") }
        }
        panelReady = true
    }

    private suspend fun panelGames(d: DirectBackend, date: String?): GamesResponse {
        val path = if (date != null) "/api/v1/games?date=" + URLEncoder.encode(date, "UTF-8") else "/api/v1/games"
        for (attempt in 0..1) {
            if (!panelReady) panelLogin(d)
            val body: String? = withContext(Dispatchers.IO) {
                client.newCall(newRequest(path).get().build()).execute().use { r ->
                    when {
                        r.code == 401 || r.code == 403 -> { panelReady = false; null }
                        !r.isSuccessful -> throw ApiException(r.code, "HTTP ${r.code}")
                        else -> r.body?.string().orEmpty()
                    }
                }
            }
            if (body != null) {
                val g = json.decodeFromString<GamesResponse>(body)
                return g.copy(games = g.games.map { game ->
                    game.copy(channels = game.channels.mapNotNull { c ->
                        try { d.item(c.id) } catch (e: CancellationException) { throw e } catch (_: Exception) { c.takeIf { !it.url.isNullOrBlank() } }
                    })
                })
            }
        }
        throw ApiException(401, "painel_auth")
    }

    suspend fun games(date: String? = null): GamesResponse {
        direct?.let { d ->
            if (baseUrl.isBlank() || baseUrl.contains("exemplo.com")) return GamesResponse()
            return cached("games:${date.orEmpty()}", TimeUnit.SECONDS.toMillis(30)) { panelGames(d, date) }
        }
        val url = if (date != null) "/api/v1/games?date=" + URLEncoder.encode(date, "UTF-8") else "/api/v1/games"
        val req = newRequest(url).get().build()
        return cached("games:${date.orEmpty()}", TimeUnit.SECONDS.toMillis(30)) { execute<GamesResponse>(req) }
    }

    suspend fun epg(id: String): EpgResponse {
        direct?.let { d -> return d.epg(id) }
        val req = newRequest("/api/v1/epg?id=" + URLEncoder.encode(id, "UTF-8")).get().build()
        return cached("epg:$id", TimeUnit.MINUTES.toMillis(2)) { execute<EpgResponse>(req) }
    }

    suspend fun clearHistory() {
        direct?.let { d -> d.clearHistory(); responseCache.clear(); return }
        val req = newRequest("/api/v1/history").delete().build()
        perform(req)
        responseCache.clear()
    }

    suspend fun account(): AccountResponse {
        direct?.let { d -> return d.account() }
        val req = newRequest("/api/v1/account").get().build()
        return cached("account", TimeUnit.SECONDS.toMillis(60)) { execute<AccountResponse>(req) }
    }

    suspend fun refresh() {
        direct?.let { d -> d.refresh(); responseCache.clear(); return }
        val req = newRequest("/api/v1/refresh").post("{}".toRequestBody("application/json".toMediaType())).build()
        perform(req)
        responseCache.clear()
    }


}

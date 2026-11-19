package com.iptvplayer.tv.data

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.text.Normalizer
import java.util.concurrent.ConcurrentHashMap

/**
 * Modo "só aplicativo": o app conversa direto com o servidor Xtream do usuário, sem painel.
 * Catálogo em memória (categorias carregadas sob demanda), favoritos e "continuar assistindo" no próprio aparelho
 * e uma lista M3U extra (link) somada ao catálogo.
 */
class DirectBackend(
    context: Context,
    private val client: OkHttpClient,
    private val hideAdult: () -> Boolean,
) {
    private val appContext = context.applicationContext
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val mutex = Mutex()

    private var origin = ""
    private var user = ""
    private var pass = ""
    private var expiresAtMs: Long? = null
    private var accountStatus = "active"
    private var maxConnections: Int? = null
    private var activeConnections: Int? = null
    private var allowedFormats: List<String> = emptyList()
    private var isTrial = false

    private val live = ArrayList<Item>()
    private val movies = ArrayList<Item>()
    private val series = ArrayList<Item>()
    private val byId = ConcurrentHashMap<String, Item>()
    private val cats = mapOf(
        "live" to LinkedHashMap<String, String>(),
        "movie" to LinkedHashMap<String, String>(),
        "series" to LinkedHashMap<String, String>(),
    )
    private val loadedCats: MutableSet<String> = java.util.Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())
    private var allVodLoaded = false
    private var allSeriesLoaded = false
    private var initialized = false
    private val seriesDetail = ConcurrentHashMap<String, SeriesDetail>()
    private val metaCache = ConcurrentHashMap<String, MetaResponse>()
    private val extraEpisodes = HashMap<String, MutableList<Item>>() // seriesId -> episódios da lista extra
    private var extraSeriesIds = HashSet<String>()
    var warning: String? = null
        private set

    private val prefs get() = appContext.getSharedPreferences("iptv_local", Context.MODE_PRIVATE)

    // ---------- Xtream ----------

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private suspend fun getText(url: String): String = withContext(Dispatchers.IO) {
        val req = Request.Builder().url(url)
            .header("User-Agent", "VLC/3.0.20 LibVLC/3.0.20")
            .header("Accept", "application/json, */*")
            .build()
        var last: Exception? = null
        for (attempt in 0..1) {
            try {
                client.newCall(req).execute().use { r ->
                    if (r.code == 401 || r.code == 403) throw ApiException(401, "xtream_auth_failed")
                    if (!r.isSuccessful) throw ApiException(r.code, "HTTP ${r.code}")
                    return@withContext r.body?.string().orEmpty()
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: ApiException) {
                if (e.httpCode < 500 || attempt == 1) throw e
                last = e
            } catch (e: java.io.IOException) {
                last = e
                if (attempt == 1) throw e
            }
            kotlinx.coroutines.delay(400)
        }
        throw last ?: java.io.IOException("falha de rede")
    }

    private suspend fun api(action: String, params: String = ""): String =
        getText("$origin/player_api.php?username=${enc(user)}&password=${enc(pass)}&action=$action$params")

    // ---------- Cache em disco (abre rápido e aguenta falhas do provedor) ----------

    private val cacheDir by lazy { java.io.File(appContext.cacheDir, "xtream").apply { mkdirs() } }

    private fun cacheFile(key: String) = java.io.File(cacheDir, hashOf("$user@$origin|$key"))

    /**
     * Resposta fresca do disco se ainda vale (ttl); senão baixa e guarda. Se a rede ou o provedor falharem,
     * usa a cópia antiga em vez de mostrar erro.
     */
    private suspend fun cachedApi(action: String, params: String = "", ttlMs: Long): String {
        val f = cacheFile(action + params)
        val fresh = withContext(Dispatchers.IO) { f.takeIf { it.exists() && System.currentTimeMillis() - it.lastModified() < ttlMs }?.readText() }
        if (fresh != null) return fresh
        return try {
            val text = api(action, params)
            if (text.length in 3..15_000_000) withContext(Dispatchers.IO) { runCatching { f.writeText(text) } }
            text
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val stale = withContext(Dispatchers.IO) { f.takeIf { it.exists() }?.readText() }
            stale ?: throw e
        }
    }

    private fun clearDiskCache() {
        runCatching { cacheDir.listFiles()?.forEach { it.delete() } }
    }

    private fun arr(text: String): JSONArray = try { JSONArray(text) } catch (_: Exception) { JSONArray() }
    private fun obj(text: String): JSONObject = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
    private fun JSONObject.str(k: String): String = if (isNull(k)) "" else opt(k)?.toString()?.trim().orEmpty()
    private fun JSONObject.lng(k: String): Long = str(k).toDoubleOrNull()?.toLong() ?: 0L

    suspend fun login(username: String, password: String, host: String?): StatusResponse {
        val h = (host ?: "").trim().trimEnd('/')
        if (h.isBlank()) throw ApiException(400, "no_default_server")
        mutex.withLock {
            origin = h
            user = username.trim()
            pass = password
            resetCatalog()
        }
        val body = getText("$origin/player_api.php?username=${enc(user)}&password=${enc(pass)}")
        val info = obj(body).optJSONObject("user_info") ?: throw ApiException(401, "xtream_auth_failed")
        val auth = info.str("auth")
        if (auth == "0" || auth.equals("false", true) || info.length() == 0) throw ApiException(401, "xtream_auth_failed")
        val exp = info.lng("exp_date")
        expiresAtMs = if (exp > 0) exp * 1000 else null
        val st = info.str("status")
        accountStatus = when {
            st.equals("Disabled", true) || st.equals("Banned", true) -> "blocked"
            st.equals("Expired", true) -> "expired"
            expiresAtMs != null && expiresAtMs!! < System.currentTimeMillis() -> "expired"
            else -> "active"
        }
        maxConnections = info.str("max_connections").toIntOrNull()
        activeConnections = info.str("active_cons").toIntOrNull()
        isTrial = info.str("is_trial") == "1"
        allowedFormats = info.optJSONArray("allowed_output_formats")?.let { a -> (0 until a.length()).map { i -> a.optString(i).lowercase() } }.orEmpty()
        return status()
    }

    /** Confere se a conta funciona em outro servidor, sem mexer no estado atual. */
    suspend fun probe(host: String, username: String, password: String): Boolean = try {
        val info = obj(getText("${host.trim().trimEnd('/')}/player_api.php?username=${enc(username)}&password=${enc(password)}")).optJSONObject("user_info")
        val auth = info?.str("auth").orEmpty()
        info != null && info.length() > 0 && auth != "0" && !auth.equals("false", true)
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        false
    }

    /** Servidor Xtream em uso (o painel precisa dele para montar os jogos). */
    fun host(): String = origin

    fun status(): StatusResponse = StatusResponse(accountStatus, expiresAtMs, user.ifBlank { null })

    suspend fun account(): AccountResponse {
        try {
            val info = obj(getText("$origin/player_api.php?username=${enc(user)}&password=${enc(pass)}")).optJSONObject("user_info")
            if (info != null) {
                maxConnections = info.str("max_connections").toIntOrNull() ?: maxConnections
                activeConnections = info.str("active_cons").toIntOrNull() ?: activeConnections
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
        }
        return AccountResponse(maxConnections, activeConnections)
    }

    private fun resetCatalog() {
        live.clear(); movies.clear(); series.clear(); byId.clear()
        cats.values.forEach { it.clear() }
        loadedCats.clear()
        allVodLoaded = false; allSeriesLoaded = false; initialized = false
        seriesDetail.clear(); metaCache.clear(); epgCache.clear(); extraEpisodes.clear(); extraSeriesIds = HashSet()
        warning = null
    }

    suspend fun refresh() {
        mutex.withLock { resetCatalog(); clearDiskCache() }
        ensureInit()
    }

    private suspend fun ensureInit() {
        if (initialized) return
        mutex.withLock {
            if (initialized) return
            withContext(Dispatchers.Default) {
            if (origin.isBlank()) throw ApiException(401, "xtream_auth_failed")
            val problems = java.util.Collections.synchronizedList(ArrayList<String>())
            coroutineScope {
                val c = listOf("get_live_categories", "get_vod_categories", "get_series_categories").map { a ->
                    async { runCatching { cachedApi(a, "", 10 * 60_000L) }.onFailure { if (it is CancellationException) throw it } }
                }.awaitAll()
                if (c.all { it.isFailure }) {
                    val first = c.first().exceptionOrNull()
                    throw (first as? ApiException) ?: ApiException(503, "Falha ao conectar: ${first?.message ?: "sem resposta"}")
                }
                listOf("live", "movie", "series").forEachIndexed { i, t ->
                    c[i].getOrNull()?.let { text ->
                        val a = arr(text)
                        for (n in 0 until a.length()) {
                            val o = a.optJSONObject(n) ?: continue
                            cats.getValue(t)[o.str("category_id")] = o.str("category_name").ifBlank { "Sem categoria" }
                        }
                    } ?: problems.add(listOf("canais", "filmes", "séries")[i])
                }
            }
            // Canais ao vivo (lista leve) e as primeiras categorias, para o Início abrir na hora
            coroutineScope {
                val tasks = ArrayList<kotlinx.coroutines.Deferred<Unit>>()
                tasks += async { runCatching { loadLive() }.onFailure { if (it is CancellationException) throw it; problems.add("canais ao vivo") }; Unit }
                cats.getValue("movie").keys.take(4).forEach { id -> tasks += async { runCatching { loadVod(id) }.onFailure { if (it is CancellationException) throw it }; Unit } }
                cats.getValue("series").keys.take(4).forEach { id -> tasks += async { runCatching { loadSeries(id) }.onFailure { if (it is CancellationException) throw it }; Unit } }
                tasks.awaitAll()
            }
            try { loadExtras() } catch (e: CancellationException) { throw e } catch (_: Exception) { problems.add("lista extra") }
            warning = if (problems.isEmpty()) null else "Parte do catálogo não carregou (${problems.joinToString(", ")}). Confira a conexão e tente atualizar."
            initialized = true
            }
        }
    }

    private fun addUnique(list: MutableList<Item>, item: Item) {
        synchronized(this) { if (byId.putIfAbsent(item.id, item) == null) list.add(item) }
    }

    private fun snap(list: List<Item>): List<Item> = synchronized(this) { list.toList() }

    private suspend fun loadLive() {
        if ("live" in loadedCats) return
        val a = arr(cachedApi("get_live_streams", "", 10 * 60_000L))
        val names = cats.getValue("live")
        for (n in 0 until a.length()) {
            val o = a.optJSONObject(n) ?: continue
            val id = o.str("stream_id")
            if (id.isBlank()) continue
            addUnique(live, Item(
                id = "l_$id", type = "live", title = o.str("name").ifBlank { "Canal" },
                group = names[o.str("category_id")] ?: "Canais", logo = o.str("stream_icon").ifBlank { null },
                url = "$origin/live/${enc(user)}/${enc(pass)}/$id.$liveExt",
            ))
        }
        loadedCats.add("live")
    }

    private fun vodItem(o: JSONObject, group: String): Item? {
        val id = o.str("stream_id")
        if (id.isBlank()) return null
        val c = cleanTitle(o.str("name"))
        val ext = o.str("container_extension").ifBlank { "mp4" }
        return Item(
            id = "v_$id", type = "movie", title = c.first, year = c.second ?: o.str("year").toIntOrNull(), group = group,
            logo = o.str("stream_icon").ifBlank { null }, url = "$origin/movie/${enc(user)}/${enc(pass)}/$id.$ext",
        )
    }

    private suspend fun loadVod(catId: String) {
        val key = "v:$catId"
        if (key in loadedCats || catId.startsWith("x:")) return
        val a = arr(cachedApi("get_vod_streams", "&category_id=${enc(catId)}", 10 * 60_000L))
        val group = cats.getValue("movie")[catId] ?: "Filmes"
        for (n in 0 until a.length()) vodItem(a.optJSONObject(n) ?: continue, group)?.let { addUnique(movies, it) }
        loadedCats.add(key)
    }

    private fun seriesItem(o: JSONObject, group: String): Item? {
        val id = o.str("series_id")
        if (id.isBlank()) return null
        val c = cleanTitle(o.str("name"))
        return Item(
            id = "s_$id", type = "series", title = c.first, year = c.second ?: o.str("year").toIntOrNull(), group = group,
            logo = o.str("cover").ifBlank { o.str("stream_icon") }.ifBlank { null },
        )
    }

    private suspend fun loadSeries(catId: String) {
        val key = "s:$catId"
        if (key in loadedCats || catId.startsWith("x:")) return
        val a = arr(cachedApi("get_series", "&category_id=${enc(catId)}", 10 * 60_000L))
        val group = cats.getValue("series")[catId] ?: "Séries"
        for (n in 0 until a.length()) seriesItem(a.optJSONObject(n) ?: continue, group)?.let { addUnique(series, it) }
        loadedCats.add(key)
    }

    /** Busca precisa de tudo: baixa todos os filmes/séries de uma vez (só na primeira busca). */
    private suspend fun loadEverything(type: String) {
        mutex.withLock {
            if (type == "movie" && !allVodLoaded) {
                val names = cats.getValue("movie")
                val a = arr(cachedApi("get_vod_streams", "", 30 * 60_000L))
                for (n in 0 until a.length()) {
                    val o = a.optJSONObject(n) ?: continue
                    vodItem(o, names[o.str("category_id")] ?: "Filmes")?.let { addUnique(movies, it) }
                }
                allVodLoaded = true
            } else if (type == "series" && !allSeriesLoaded) {
                val names = cats.getValue("series")
                val a = arr(cachedApi("get_series", "", 30 * 60_000L))
                for (n in 0 until a.length()) {
                    val o = a.optJSONObject(n) ?: continue
                    seriesItem(o, names[o.str("category_id")] ?: "Séries")?.let { addUnique(series, it) }
                }
                allSeriesLoaded = true
            }
        }
    }

    /** Formato do ao vivo: .ts quando o servidor permite (ou não informa); senão o primeiro formato liberado (ex.: m3u8). */
    private val liveExt: String
        get() {
            val learned = prefs.getString("live_fmt:$user@$origin", null)
            if (learned != null && (allowedFormats.isEmpty() || learned in allowedFormats)) return learned
            return if (allowedFormats.isEmpty() || "ts" in allowedFormats) "ts" else allowedFormats.first()
        }

    /** O player descobriu qual formato funciona neste provedor: guarda e troca os endereços dos canais já carregados. */
    fun rememberLiveFormat(ext: String) {
        val e = ext.lowercase()
        if (e != "ts" && e != "m3u8") return
        if (prefs.getString("live_fmt:$user@$origin", null) == e) return
        prefs.edit().putString("live_fmt:$user@$origin", e).apply()
        synchronized(this) {
            for (i in live.indices) {
                val it = live[i]
                val u = it.url ?: continue
                if (it.id.contains("_x") || !u.startsWith("$origin/live/")) continue
                val n = u.substringBeforeLast('.') + "." + e
                if (n != u) { val c = it.copy(url = n); live[i] = c; byId[c.id] = c }
            }
        }
    }

    // ---------- Lista extra (M3U por link) ----------

    fun extraUrl(): String = prefs.getString("extra_url", "").orEmpty()

    fun setExtraUrl(url: String) {
        prefs.edit().putString("extra_url", url.trim()).apply()
    }

    private suspend fun loadExtras() {
        val url = extraUrl()
        if (url.isBlank()) return
        val text = getText(url)
        val parsed = parseM3u(text)
        val label = "Extras"
        fun grp(g: String) = g.ifBlank { label }
        // categorias extras vão para o começo, para aparecerem no Início
        fun addCat(type: String, name: String) {
            val m = cats.getValue(type)
            if (m.values.contains(name)) return
            val old = LinkedHashMap(m)
            m.clear(); m["x:$name"] = name; m.putAll(old)
        }
        for (e in parsed) {
            when (e.kind) {
                "live" -> { addCat("live", grp(e.group)); addUnique(live, Item("l_x${e.hash}", "live", e.name, grp(e.group), e.logo, null, e.url)) }
                "movie" -> {
                    val c = cleanTitle(e.name)
                    addCat("movie", grp(e.group))
                    addUnique(movies, Item("v_x${e.hash}", "movie", c.first, grp(e.group), e.logo, c.second, e.url))
                }
                else -> {
                    val sid = "s_x${hashOf(e.seriesName.lowercase())}"
                    if (!byId.containsKey(sid)) {
                        addCat("series", grp(e.group))
                        addUnique(series, Item(sid, "series", e.seriesName, grp(e.group), e.logo, null, null))
                        extraSeriesIds.add(sid)
                    }
                    val ep = Item(
                        id = "e_x${e.hash}", type = "episode", title = e.episodeTitle, url = e.url,
                        season = e.season, episode = e.episode, seriesId = sid, logo = e.logo,
                    )
                    byId[ep.id] = ep
                    extraEpisodes.getOrPut(sid) { ArrayList() }.add(ep)
                }
            }
        }
        extraEpisodes.values.forEach { l -> l.sortWith(compareBy<Item>({ it.season ?: 1 }, { it.episode ?: 0 })) }
    }

    private class M3uEntry(val name: String, val url: String, val group: String, val logo: String?, val kind: String) {
        val hash: String = hashOf(url)
        var seriesName = ""
        var episodeTitle = ""
        var season = 1
        var episode = 1
    }

    private fun parseM3u(text: String): List<M3uEntry> {
        val out = ArrayList<M3uEntry>()
        val attr = Regex("""([A-Za-z0-9_-]+)="([^"]*)"""")
        val se = Regex("""(?i)^(.*?)[\s._-]*[Ss](\d{1,2})\s*[EeXx](\d{1,3})[\s._:-]*(.*)$""")
        val liveGroup = Regex("""(?i)canal|canais|tv\b|live|ao vivo|esporte|24h""")
        var name = ""; var group = ""; var logo: String? = null; var pending = false
        val seen = HashSet<String>()
        for (raw in text.lineSequence()) {
            val line = raw.trim()
            if (line.isEmpty()) continue
            if (line.startsWith("#EXTINF", true)) {
                val attrs = HashMap<String, String>()
                attr.findAll(line).forEach { attrs[it.groupValues[1].lowercase()] = it.groupValues[2] }
                name = line.substringAfterLast(",", "").trim().ifBlank { attrs["tvg-name"].orEmpty() }
                group = attrs["group-title"].orEmpty().trim()
                logo = attrs["tvg-logo"]?.takeIf { it.isNotBlank() }
                pending = true
            } else if (line.startsWith("#EXTGRP:", true)) {
                group = line.substringAfter(":").trim()
            } else if (!line.startsWith("#") && pending) {
                pending = false
                if (!line.startsWith("http", true) || !seen.add(line)) continue
                val m = se.find(name)
                val kind = when {
                    m != null -> "episode"
                    liveGroup.containsMatchIn(group) || line.contains("/live/") -> "live"
                    else -> "movie"
                }
                val e = M3uEntry(name.ifBlank { "Sem nome" }, line, group, logo, kind)
                if (m != null) {
                    e.seriesName = cleanTitle(m.groupValues[1]).first.ifBlank { name }
                    e.season = m.groupValues[2].toInt()
                    e.episode = m.groupValues[3].toInt()
                    e.episodeTitle = m.groupValues[4].trim().ifBlank { "Episódio ${e.episode}" }
                }
                out.add(e)
            }
        }
        return out
    }

    // ---------- Perfis (favoritos e histórico separados por pessoa, só neste aparelho) ----------

    fun profiles(): List<String> = prefs.getString("profiles", "Principal").orEmpty().split('|').filter { it.isNotBlank() }.ifEmpty { listOf("Principal") }

    fun profile(): String = prefs.getString("profile", "Principal")?.takeIf { it in profiles() } ?: "Principal"

    fun setProfile(name: String) {
        if (name in profiles()) prefs.edit().putString("profile", name).apply()
    }

    fun addProfile(name: String) {
        val n = name.trim().replace("|", " ").take(20)
        if (n.isBlank()) return
        val l = profiles()
        if (n !in l && l.size < 8) prefs.edit().putString("profiles", (l + n).joinToString("|")).apply()
        setProfile(n)
    }

    private fun favKey() = if (profile() == "Principal") "fav" else "fav:${profile()}"
    private fun progKey() = if (profile() == "Principal") "prog" else "prog:${profile()}"

    // ---------- Local: favoritos e progresso ----------

    private data class Prog(val item: Item, val pos: Long, val dur: Long, val at: Long)

    private fun readFavs(): LinkedHashMap<String, Item> {
        val out = LinkedHashMap<String, Item>()
        try {
            val a = JSONArray(prefs.getString(favKey(), "[]"))
            for (i in 0 until a.length()) {
                val it = json.decodeFromString<Item>(a.getString(i))
                out[it.id] = it
            }
        } catch (_: Exception) {
        }
        return out
    }

    private fun writeFavs(m: Map<String, Item>) {
        val a = JSONArray()
        m.values.forEach { a.put(json.encodeToString(it.copy(favorite = false, positionMs = 0, durationMs = 0))) }
        prefs.edit().putString(favKey(), a.toString()).apply()
    }

    private fun readProg(): LinkedHashMap<String, Prog> {
        val out = LinkedHashMap<String, Prog>()
        try {
            val a = JSONArray(prefs.getString(progKey(), "[]"))
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                val it = json.decodeFromString<Item>(o.getString("item"))
                out[it.id] = Prog(it, o.optLong("pos"), o.optLong("dur"), o.optLong("at"))
            }
        } catch (_: Exception) {
        }
        return out
    }

    private fun writeProg(m: Map<String, Prog>) {
        val a = JSONArray()
        m.values.sortedByDescending { it.at }.take(120).forEach {
            a.put(JSONObject().put("item", json.encodeToString(it.item.copy(favorite = false, positionMs = 0, durationMs = 0)))
                .put("pos", it.pos).put("dur", it.dur).put("at", it.at))
        }
        prefs.edit().putString(progKey(), a.toString()).apply()
    }

    private fun decorate(items: List<Item>, favs: Set<String>, prog: Map<String, Prog>): List<Item> = items.map { decorate(it, favs, prog) }

    private fun decorate(it: Item, favs: Set<String>, prog: Map<String, Prog>): Item {
        val p = prog[it.id]
        return it.copy(
            favorite = it.id in favs,
            positionMs = p?.pos ?: 0, durationMs = p?.dur ?: 0,
            episodeCount = if (it.type == "series") (extraEpisodes[it.id]?.size ?: it.episodeCount) else it.episodeCount,
        )
    }

    // ---------- API usada pelas telas ----------

    private fun visible(it: Item) = !(hideAdult() && isAdultGroup(it.group))

    suspend fun home(): HomeResponse {
        ensureInit()
        val favs = readFavs()
        val prog = readProg()
        val favIds = favs.keys
        val rows = ArrayList<RowInfo>()
        val cont = prog.values.filter { !it.item.isLive && it.dur > 0 && it.pos > 5000 && it.pos < it.dur * 0.95 && visible(it.item) }
            .sortedByDescending { it.at }.take(20).map { decorate(it.item, favIds, prog) }
        if (cont.isNotEmpty()) rows.add(RowInfo("continue", "Continuar assistindo", "continue", cont))
        val favItems = favs.values.filter { visible(it) }.take(30).map { decorate(it, favIds, prog) }
        if (favItems.isNotEmpty()) rows.add(RowInfo("favorites", "Minha lista", "favorites", favItems))
        val mine = topLive()
        if (mine.isNotEmpty()) rows.add(RowInfo("mylive", "Seus canais", "live", decorate(mine, favIds, prog)))
        // Recomendados: categorias que você mais assistiu/favoritou, só com títulos que ainda não viu
        run {
            val seen = prog.keys + favIds
            val liked = (prog.values.sortedByDescending { it.at }.take(15).map { it.item } + favs.values.take(10))
                .filter { !it.isLive && it.type != "episode" }.map { it.group }.filter { it.isNotBlank() }
            val top = liked.groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.take(2).map { it.key }
            for (gName in top) {
                val items = (arrOf("movie") + arrOf("series")).filter { it.group == gName && it.id !in seen && visible(it) && !it.logo.isNullOrBlank() }.take(20)
                if (items.size >= 4) rows.add(RowInfo("rec:$gName", "Porque você curte $gName", "movie", decorate(items, favIds, prog)))
            }
        }
        for (type in listOf("movie", "series")) {
            for (g in groupsOf(type).filter { !(hideAdult() && isAdultGroup(it.name)) }.take(4)) {
                val items = arrOf(type).filter { it.group == g.name }.take(20)
                if (items.isNotEmpty()) rows.add(RowInfo("g:$type:${g.name}", g.name, type, decorate(items, favIds, prog)))
            }
        }
        if (snap(movies).isEmpty() && snap(series).isEmpty()) {
            for (g in groupsOf("live").filter { !(hideAdult() && isAdultGroup(it.name)) }.take(3)) {
                val items = arrOf("live").filter { it.group == g.name }.take(20)
                if (items.isNotEmpty()) rows.add(RowInfo("g:live:${g.name}", g.name, "live", decorate(items, favIds, prog)))
            }
        }
        val hero: Item? = cont.firstOrNull() ?: run {
            val pool = (snap(movies).take(200) + snap(series).take(200)).filter { !it.logo.isNullOrBlank() && visible(it) }
            if (pool.isEmpty()) null else decorate(pool[((System.currentTimeMillis() / 86_400_000L) % pool.size).toInt()], favIds, prog)
        }
        return HomeResponse(hero = hero, rows = rows, games = emptyList())
    }

    private fun arrOf(type: String): List<Item> = snap(when (type) { "live" -> live; "movie" -> movies; else -> series })

    private fun groupsOf(type: String): List<GroupInfo> {
        val list = arrOf(type)
        return cats.getValue(type).values.distinct().map { name ->
            val n = list.count { it.group == name }
            GroupInfo(name, if (n > 0) n else if (type == "live") 10 else 20)
        }
    }

    suspend fun browse(type: String, group: String?, q: String?, offset: Int, limit: Int, force: Boolean): BrowseResponse {
        if (force) refresh() else ensureInit()
        if (!group.isNullOrBlank()) {
            val id = cats.getValue(type).entries.firstOrNull { it.value == group }?.key
            if (id != null) withContext(Dispatchers.Default) {
                if (type == "movie") loadVod(id) else if (type == "series") loadSeries(id)
                Unit
            }
        }
        val query = q.orEmpty().trim()
        if (query.isNotEmpty() && type != "live") withContext(Dispatchers.Default) { loadEverything(type) }
        if (type == "live" && "live" !in loadedCats) loadLive()
        var list = arrOf(type).toList()
        if (!group.isNullOrBlank()) {
            if (hideAdult() && isAdultGroup(group)) list = emptyList() else list = list.filter { it.group == group }
        }
        if (hideAdult()) list = list.filter { !isAdultGroup(it.group) }
        val tokens = norm(query).split(' ').filter { it.isNotBlank() }
        if (tokens.isNotEmpty()) {
            val strict = list.filter { i -> val n = norm(i.title); tokens.all { n.contains(it) } }
            val qn = tokens.joinToString(" ")
            list = (if (strict.isNotEmpty()) strict else list.filter { i -> fuzzyMatch(norm(i.title), tokens) })
                .sortedBy { relevance(norm(it.title), qn) }
        }
        val maxLimit = if (type == "live") 3000 else 200
        val lim = limit.coerceIn(1, maxLimit)
        val off = offset.coerceAtLeast(0)
        val page = list.drop(off).take(lim)
        val favs = readFavs().keys
        val prog = readProg()
        val groups = if (off == 0 && query.isEmpty()) groupsOf(type).filter { !(hideAdult() && isAdultGroup(it.name)) } else null
        return BrowseResponse(total = list.size, items = decorate(page, favs, prog), groups = groups, warning = warning)
    }

    suspend fun search(q: String): SearchResponse {
        val query = q.trim()
        if (query.length < 2) return SearchResponse()
        ensureInit()
        withContext(Dispatchers.Default) { loadEverything("movie"); loadEverything("series") }
        val tokens = norm(query).split(' ').filter { it.isNotBlank() }
        val favs = readFavs().keys
        val prog = readProg()
        fun find(l: List<Item>): List<Item> {
            val ok = l.filter { visible(it) }
            val strict = ok.filter { norm(it.title).let { n -> tokens.all { t -> n.contains(t) } } }
            val hits = if (strict.isNotEmpty()) strict else ok.filter { fuzzyMatch(norm(it.title), tokens) }
            val qn = tokens.joinToString(" ")
            return decorate(hits.sortedBy { relevance(norm(it.title), qn) }.take(40), favs, prog)
        }
        return SearchResponse(live = find(snap(live)), movies = find(snap(movies)), series = find(snap(series)))
    }

    suspend fun series(id: String): SeriesDetail {
        ensureInit()
        seriesDetail[id]?.let { return refreshDetail(it) }
        val s = byId[id]?.takeIf { it.type == "series" } ?: throw ApiException(404, "not_found")
        val seasons: List<SeasonInfo>
        if (id in extraSeriesIds) {
            seasons = (extraEpisodes[id] ?: emptyList()).groupBy { it.season ?: 1 }.toSortedMap().map { SeasonInfo(it.key, it.value) }
        } else {
            val raw = id.removePrefix("s_")
            val info = obj(cachedApi("get_series_info", "&series_id=${enc(raw)}", 60 * 60_000L))
            // Alguns provedores mandam "episodes" como objeto {"1":[...]} e outros como lista de listas [[...],[...]]
            val epsObj = info.optJSONObject("episodes")
            val epsArr = info.optJSONArray("episodes")
            val epsMap = LinkedHashMap<String, JSONArray>()
            if (epsObj != null) {
                epsObj.keys().asSequence().toList().sortedBy { it.toIntOrNull() ?: 0 }.forEach { k -> epsObj.optJSONArray(k)?.let { epsMap[k] = it } }
            } else if (epsArr != null) {
                for (n in 0 until epsArr.length()) epsArr.optJSONArray(n)?.let { epsMap[(n + 1).toString()] = it }
            }
            val list = ArrayList<SeasonInfo>()
            if (epsMap.isNotEmpty()) {
                for ((k, a) in epsMap) {
                    val season = k.toIntOrNull() ?: 1
                    val items = ArrayList<Item>()
                    for (n in 0 until a.length()) {
                        val o = a.optJSONObject(n) ?: continue
                        val epId = o.str("id")
                        if (epId.isBlank()) continue
                        val num = o.str("episode_num").toIntOrNull() ?: (n + 1)
                        val ext = o.str("container_extension").ifBlank { "mp4" }
                        val item = Item(
                            id = "e_$epId", type = "episode", title = o.str("title").ifBlank { "Episódio $num" },
                            url = "$origin/series/${enc(user)}/${enc(pass)}/$epId.$ext",
                            season = season, episode = num, seriesId = id,
                            logo = o.optJSONObject("info")?.str("movie_image")?.ifBlank { null },
                        )
                        items.add(item)
                        byId[item.id] = item
                    }
                    list.add(SeasonInfo(season, items))
                }
            }
            seasons = list
        }
        val d = SeriesDetail(id = id, type = "series", title = s.title, group = s.group, logo = s.logo, year = s.year, seasons = seasons)
        seriesDetail[id] = d
        return refreshDetail(d)
    }

    private fun refreshDetail(d: SeriesDetail): SeriesDetail {
        val favs = readFavs().keys
        val prog = readProg()
        return d.copy(favorite = d.id in favs, seasons = d.seasons.map { s -> s.copy(episodes = decorate(s.episodes, favs, prog)) })
    }

    suspend fun item(id: String): Item {
        ensureInit()
        val it = byId[id] ?: readFavs()[id] ?: readProg()[id]?.item ?: throw ApiException(404, "not_found")
        return decorate(it, readFavs().keys, readProg())
    }

    suspend fun meta(id: String): MetaResponse {
        ensureInit()
        metaCache[id]?.let { return it }
        var it = byId[id] ?: return MetaResponse()
        if (it.type == "episode") it = byId[it.seriesId.orEmpty()] ?: return MetaResponse()
        if (it.type == "live" || it.id.contains("_x")) return MetaResponse(year = it.year)
        val isMovie = it.type == "movie"
        val raw = it.id.substring(2)
        val data = try {
            obj(if (isMovie) cachedApi("get_vod_info", "&vod_id=${enc(raw)}", 6 * 60 * 60_000L) else cachedApi("get_series_info", "&series_id=${enc(raw)}", 60 * 60_000L))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return MetaResponse(year = it.year)
        }
        val i = data.optJSONObject("info") ?: JSONObject()
        fun first(vararg keys: String): String = keys.map { k -> i.str(k) }.firstOrNull { v -> v.isNotBlank() } ?: ""
        val overview = first("plot", "description", "overview")
        val poster = first("movie_image", "cover_big", "cover")
        val backdrop = i.optJSONArray("backdrop_path")?.optString(0).orEmpty().ifBlank { first("backdrop_path", "backdrop") }
        val rating = i.str("rating").toDoubleOrNull()?.takeIf { v -> v > 0 } ?: i.str("rating_5based").toDoubleOrNull()?.let { v -> v * 2 }?.takeIf { v -> v > 0 }
        val year = first("releasedate", "release_date", "releaseDate").take(4).toIntOrNull() ?: it.year
        val genres = first("genre").split(',', '/', '|').map { g -> g.trim() }.filter { g -> g.isNotEmpty() }.take(3).joinToString(" · ")
        val m = MetaResponse(
            overview = overview.ifBlank { null },
            poster = poster.takeIf { v -> v.startsWith("http", true) },
            backdrop = backdrop.takeIf { v -> v.startsWith("http", true) },
            rating = rating?.let { v -> Math.round(v * 10) / 10.0 },
            year = year,
            genres = genres.ifBlank { null },
        )
        metaCache[id] = m
        return m
    }

    fun favorites(type: String?): FavoritesResponse {
        val prog = readProg()
        val favs = readFavs()
        val items = favs.values.filter { (type == null || it.type == type) && visible(it) }.reversed()
        return FavoritesResponse(decorate(items, favs.keys, prog))
    }

    suspend fun addFavorite(id: String) {
        ensureInit()
        val item = byId[id] ?: readProg()[id]?.item ?: throw ApiException(404, "not_found")
        val favs = readFavs()
        favs[id] = item
        writeFavs(favs)
    }

    fun removeFavorite(id: String) {
        val favs = readFavs()
        if (favs.remove(id) != null) writeFavs(favs)
    }

    fun saveProgress(id: String, posMs: Long, durMs: Long) {
        val item = byId[id] ?: readProg()[id]?.item ?: return
        if (item.isLive) return
        val prog = readProg()
        prog[id] = Prog(item, posMs, durMs, System.currentTimeMillis())
        writeProg(prog)
    }

    /** Conta quantas vezes cada canal ao vivo foi aberto (por perfil), para a fileira "Seus canais". */
    fun recordLive(id: String) {
        if (!id.startsWith("l_")) return
        val key = "livecount" + if (profile() == "Principal") "" else ":${profile()}"
        val o = try { JSONObject(prefs.getString(key, "{}")) } catch (_: Exception) { JSONObject() }
        o.put(id, o.optInt(id) + 1)
        // mantém só os 60 mais usados
        if (o.length() > 60) {
            val keep = o.keys().asSequence().sortedByDescending { o.optInt(it) }.take(60).toSet()
            o.keys().asSequence().toList().filter { it !in keep }.forEach { o.remove(it) }
        }
        prefs.edit().putString(key, o.toString()).apply()
    }

    private fun topLive(): List<Item> {
        val key = "livecount" + if (profile() == "Principal") "" else ":${profile()}"
        val o = try { JSONObject(prefs.getString(key, "{}")) } catch (_: Exception) { return emptyList() }
        return o.keys().asSequence().sortedByDescending { o.optInt(it) }.mapNotNull { byId[it] }.filter { visible(it) }.take(15).toList()
    }

    fun clearHistory() {
        prefs.edit().remove(progKey()).apply()
    }

    private val epgCache = ConcurrentHashMap<String, Pair<Long, EpgResponse>>()

    suspend fun epg(id: String): EpgResponse {
        epgCache[id]?.let { (at, r) -> if (System.currentTimeMillis() - at < 60_000L) return r }
        val r = epgLoad(id)
        if (epgCache.size > 300) epgCache.clear()
        epgCache[id] = System.currentTimeMillis() to r
        return r
    }

    private suspend fun epgLoad(id: String): EpgResponse {
        ensureInit()
        val it = byId[id]
        if (it == null || it.type != "live" || id.contains("_x")) return EpgResponse(id, null)
        return try {
            val raw = id.removePrefix("l_")
            val a = obj(api("get_short_epg", "&stream_id=${enc(raw)}&limit=5")).optJSONArray("epg_listings") ?: return EpgResponse(id, null)
            fun dec(s: String) = try { String(Base64.decode(s, Base64.DEFAULT), Charsets.UTF_8).trim() } catch (_: Exception) { s }
            val now = System.currentTimeMillis()
            val list = ArrayList<EpgProgram>()
            for (n in 0 until a.length()) {
                val o = a.optJSONObject(n) ?: continue
                val start = o.lng("start_timestamp") * 1000
                val stop = o.lng("stop_timestamp") * 1000
                if (stop <= now) continue
                val p = if (stop > start) ((now - start).toFloat() / (stop - start)).coerceIn(0f, 1f) else 0f
                list.add(EpgProgram(dec(o.str("title")), dec(o.str("description")), start, stop, p))
            }
            list.sortBy { it.startMs }
            val current = list.firstOrNull { it.startMs <= now && it.stopMs > now }
            val upcoming = list.filter { it.startMs > now }
            EpgResponse(id, if (current == null && upcoming.isEmpty()) null else EpgData(current, upcoming.firstOrNull(), upcoming.drop(1)))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            EpgResponse(id, null)
        }
    }

    companion object {
        private val ADULT = Regex("""(?i)\b(xxx|adulto|adultos|porn\w*|erotic\w*|sexo|sex|hentai|sensual)\b|\+18|18\+|for adults""")

        fun isAdultGroup(name: String): Boolean {
            val n = Normalizer.normalize(name, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
            return ADULT.containsMatchIn(n)
        }

        fun norm(s: String): String =
            Normalizer.normalize(s.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").replace(Regex("[^a-z0-9 ]"), " ").replace(Regex("\\s+"), " ").trim()

        /** Distância de edição limitada (para achar "vingadores" digitando "vingadors"). */
        private fun near(a: String, b: String): Boolean {
            if (a == b) return true
            if (kotlin.math.abs(a.length - b.length) > 1 || a.length < 4) return false
            var i = 0
            while (i < a.length && i < b.length && a[i] == b[i]) i++
            if (a.length == b.length) return a.substring(i + 1) == b.substring(i + 1) ||
                (i + 1 < a.length && a[i] == b[i + 1] && a[i + 1] == b[i] && a.substring(i + 2) == b.substring(i + 2))
            return if (a.length > b.length) a.substring(i + 1) == b.substring(i) else b.substring(i + 1) == a.substring(i)
        }

        /** Todas as palavras da busca batem (exato ou com 1 erro de digitação) com o título já normalizado. */
        fun fuzzyMatch(titleNorm: String, tokens: List<String>): Boolean {
            val words = titleNorm.split(' ').filter { it.isNotEmpty() }
            return tokens.all { t -> titleNorm.contains(t) || (t.length >= 4 && words.any { w -> near(t, w) || (w.length > 4 && near(t, w.take(t.length))) }) }
        }

        /** Quanto menor, mais relevante: título igual > começa com a busca > palavra inteira > contém; empate: título mais curto. */
        fun relevance(titleNorm: String, queryNorm: String): Int {
            if (queryNorm.isEmpty()) return 0
            val base = when {
                titleNorm == queryNorm -> 0
                titleNorm.startsWith(queryNorm) -> 1
                (" $titleNorm ").contains(" $queryNorm ") -> 2
                titleNorm.contains(queryNorm) -> 3
                else -> 4
            }
            return base * 1000 + titleNorm.length.coerceAtMost(999)
        }

        fun hashOf(s: String): String =
            java.security.MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }.take(12)

        private val QUALITY = Regex("""(?i)\b(4k|uhd|fhd|hd|sd|1080p|720p|2160p|dual|dublado|legendado|leg|dub|h\.?264|h\.?265|hevc|web-?dl|bluray)\b""")

        /** (título limpo, ano) a partir do nome cru do provedor. */
        fun cleanTitle(raw: String): Pair<String, Int?> {
            var s = raw
            var year: Int? = null
            val maxYear = java.util.Calendar.getInstance().get(java.util.Calendar.YEAR) + 1
            s = Regex("""\((\d{4})\)""").replace(s) { m ->
                val n = m.groupValues[1].toInt()
                if (year == null && n in 1900..maxYear) year = n
                " "
            }
            s = s.replace(Regex("""\[[^\]]*]"""), " ").replace(Regex("""\([^)]*\)"""), " ")
            s = s.replace(Regex("""^\s*\|[A-Za-z]{2,4}\|\s*"""), "")
            s = s.replace(Regex("""(?i)^\s*(?:BR|PT|PTBR|EN|ES|LAT|MX|US|UK)\s*[:|-]\s*"""), "")
            s = QUALITY.replace(s, " ")
            val ty = Regex("""\s((?:19|20)\d{2})\s*$""").find(s)
            if (ty != null) {
                val n = ty.groupValues[1].toInt()
                val rest = s.substring(0, ty.range.first).trim()
                if (rest.isNotEmpty() && n in 1900..maxYear) {
                    if (year == null) year = n
                    s = rest
                }
            }
            s = s.replace(Regex("\\s+"), " ").replace(Regex("""[\s\-–:|._]+$"""), "").replace(Regex("""^[\s\-–:|._]+"""), "").trim()
            return (s.ifBlank { raw.trim() }) to year
        }
    }
}

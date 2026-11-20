package com.iptvplayer.tv.data

import kotlinx.serialization.Serializable

@Serializable
data class Item(
    val id: String,
    val type: String,
    val title: String,
    val group: String = "",
    val logo: String? = null,
    val year: Int? = null,
    val url: String? = null,
    val favorite: Boolean = false,
    val positionMs: Long = 0,
    val durationMs: Long = 0,
    val episodeCount: Int? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val seriesId: String? = null,
) {
    val isLive: Boolean get() = type == "live"
    val posterUrl: String? get() = logo
    val progress: Float
        get() = if (durationMs > 0) (positionMs.toFloat() / durationMs.toFloat()).coerceIn(0f, 1f) else 0f
}

@Serializable
data class HomeResponse(
    val hero: Item? = null,
    val rows: List<RowInfo> = emptyList(),
    val games: List<Game> = emptyList(),
)

@Serializable
data class RowInfo(
    val id: String,
    val title: String,
    val kind: String,
    val items: List<Item> = emptyList(),
)

@Serializable
data class GroupInfo(
    val name: String,
    val count: Int,
)

@Serializable
data class BrowseResponse(
    val total: Int,
    val items: List<Item> = emptyList(),
    val groups: List<GroupInfo>? = null,
    val warning: String? = null,
)

@Serializable
data class SearchResponse(
    val live: List<Item> = emptyList(),
    val movies: List<Item> = emptyList(),
    val series: List<Item> = emptyList(),
)

@Serializable
data class FavoritesResponse(
    val items: List<Item> = emptyList(),
)

@Serializable
data class SeriesDetail(
    val id: String,
    val type: String,
    val title: String,
    val group: String = "",
    val logo: String? = null,
    val year: Int? = null,
    val favorite: Boolean = false,
    val seasons: List<SeasonInfo> = emptyList(),
)

@Serializable
data class SeasonInfo(
    val season: Int,
    val episodes: List<Item> = emptyList(),
)

@Serializable
data class MetaResponse(
    val overview: String? = null,
    val poster: String? = null,
    val backdrop: String? = null,
    val rating: Double? = null,
    val year: Int? = null,
    val genres: String? = null,
)

@Serializable
data class EpgProgram(
    val title: String = "",
    val desc: String = "",
    val startMs: Long = 0,
    val stopMs: Long = 0,
    val progress: Float = 0f,
)

@Serializable
data class EpgData(
    val current: EpgProgram? = null,
    val next: EpgProgram? = null,
    val upcoming: List<EpgProgram> = emptyList(),
)

@Serializable
data class EpgResponse(
    val id: String = "",
    val epg: EpgData? = null,
)

@Serializable
data class Game(
    val id: String = "",
    val date: String = "",
    val time: String = "",
    val competition: String = "",
    val home: String = "",
    val away: String = "",
    val channelHint: String = "",
    val channels: List<Item> = emptyList(),
    val isLive: Boolean = false,
    val statusLabel: String = "",
    val score: String? = null,
)

@Serializable
data class GamesResponse(
    val games: List<Game> = emptyList(),
)

@Serializable
data class StatusResponse(
    val status: String,
    val expiresAt: Long? = null,
    val name: String? = null,
)

@Serializable
data class AccountResponse(
    val maxConnections: Int? = null,
    val activeConnections: Int? = null,
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
    val mac: String,
    val key: String,
    val serverHost: String? = null,
)

/** Servidor IPTV único definido no painel (vale para todos os aparelhos e o site). */
@Serializable
data class ServerInfo(
    val host: String = "",
    val rev: Int = 0,
    val updatedAt: Long = 0,
)

data class ServerPush(val ok: Boolean, val message: String? = null, val needsConfirm: Boolean = false, val migrated: Int = 0)

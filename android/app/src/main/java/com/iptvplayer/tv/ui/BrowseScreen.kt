package com.iptvplayer.tv.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.GroupInfo
import com.iptvplayer.tv.data.Item
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/**
 * Ao Vivo (grupos à esquerda, canais à direita) e Filmes/Séries (grupos em cima, capas embaixo).
 * Carrega de 60 em 60 conforme o usuário rola. Tecla MENU em um canal = favoritar.
 */
@Composable
fun BrowseScreen(type: String, onOpen: (Item) -> Unit, onPlay: (PlayRequest) -> Unit) {
    val app = LocalContext.current.applicationContext as IptvApp
    val isTv = rememberIsTv()
    val scope = rememberCoroutineScope()

    var group by remember(type) { mutableStateOf<String?>(null) }
    var groups by remember(type) { mutableStateOf<List<GroupInfo>>(emptyList()) }
    var attempt by remember(type) { mutableIntStateOf(0) }
    val items = remember(type, group, attempt) { mutableStateListOf<Item>() }
    var total by remember(type, group, attempt) { mutableIntStateOf(-1) }
    var loading by remember(type, group, attempt) { mutableStateOf(false) }
    var error by remember(type, group, attempt) { mutableStateOf<String?>(null) }

    fun loadMore() {
        if (loading || error != null) return
        if (total >= 0 && items.size >= total) return
        loading = true
        scope.launch {
            try {
                val r = app.api.browse(type, group, null, items.size, 60, force = items.isEmpty() && attempt > 0)
                total = r.total
                if (r.items.isEmpty() && r.warning != null) error = r.warning
                r.groups?.let { groups = it }
                items.addAll(r.items)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                error = friendlyError(e)
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(type, group, attempt) { loadMore() }

    fun toggleFavorite(id: String) {
        val i = items.indexOfFirst { it.id == id }
        if (i < 0) return
        val cur = items[i]
        items[i] = cur.copy(favorite = !cur.favorite)
        scope.launch {
            try {
                if (cur.favorite) app.api.removeFavorite(cur.id) else app.api.addFavorite(cur.id)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // sem rede: o ícone volta ao estado anterior na próxima atualização
            }
        }
    }

    if (type == "live" && isTv) {
        Row(
            Modifier
                .fillMaxSize()
                .padding(horizontal = 48.dp)
        ) {
            LazyColumn(
                Modifier
                    .width(240.dp)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                item { Pill("Todos", selected = group == null, onClick = { group = null }, modifier = Modifier.fillMaxWidth()) }
                items(groups) { g ->
                    Pill(
                        g.name,
                        selected = group == g.name,
                        onClick = { group = g.name },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
            Spacer(Modifier.width(20.dp))
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
            ) {
                if (items.isEmpty()) {
                    BrowseEmpty(error, loading) { attempt++ }
                } else {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        itemsIndexed(items, key = { _, ch -> ch.id }) { index, ch ->
                            ChannelRow(
                                ch,
                                onClick = { onPlay(PlayRequest(items.toList(), index)) },
                                onToggleFavorite = { toggleFavorite(ch.id) },
                            )
                        }
                        item(key = "load-more:$type:${group.orEmpty()}") {
                            LaunchedEffect(items.size, total, error, loading) {
                                if (!loading && error == null && (total < 0 || items.size < total)) loadMore()
                            }
                            if (loading && total >= 0 && items.isNotEmpty()) {
                                Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { Spinner() }
                            }
                        }
                        if (error != null) item { BrowseLoadError(error!!) { attempt++ } }
                    }
                }
            }
        }
    } else if (type == "live") {
        Column(Modifier.fillMaxSize()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { Pill("Todos", selected = group == null, onClick = { group = null }) }
                items(groups, key = { it.name }) { g ->
                    Pill(g.name, selected = group == g.name, onClick = { group = g.name })
                }
            }
            Box(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                if (items.isEmpty()) {
                    BrowseEmpty(error, loading) { attempt++ }
                } else {
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        contentPadding = PaddingValues(vertical = 8.dp),
                    ) {
                        itemsIndexed(items, key = { _, ch -> ch.id }) { index, ch ->
                            ChannelRow(
                                ch,
                                onClick = { onPlay(PlayRequest(items.toList(), index)) },
                                onToggleFavorite = { toggleFavorite(ch.id) },
                            )
                        }
                        item(key = "load-more:$type:${group.orEmpty()}") {
                            LaunchedEffect(items.size, total, error, loading) {
                                if (!loading && error == null && (total < 0 || items.size < total)) loadMore()
                            }
                            if (loading && total >= 0 && items.isNotEmpty()) {
                                Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { Spinner() }
                            }
                        }
                        if (error != null) item { BrowseLoadError(error!!) { attempt++ } }
                    }
                }
            }
        }
    } else {
        val sidePadding = if (isTv) 48.dp else 18.dp
        val posterWidth = if (isTv) 190.dp else 148.dp
        Column(Modifier.fillMaxSize()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = sidePadding, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item { Pill("Todos", selected = group == null, onClick = { group = null }) }
                items(groups, key = { it.name }) { g ->
                    Pill("${g.name} (${g.count})", selected = group == g.name, onClick = { group = g.name })
                }
            }
            Box(Modifier.fillMaxSize()) {
                if (items.isEmpty()) {
                    BrowseEmpty(error, loading) { attempt++ }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = posterWidth),
                        contentPadding = PaddingValues(horizontal = sidePadding, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(if (isTv) 18.dp else 12.dp),
                        verticalArrangement = Arrangement.spacedBy(if (isTv) 20.dp else 16.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        itemsIndexed(items, key = { _, item -> item.id }) { _, item ->
                            MediaCard(item, onClick = { onOpen(item) }, Modifier.fillMaxWidth(), cardWidth = posterWidth)
                        }
                        item(key = "load-more:$type:${group.orEmpty()}") {
                            LaunchedEffect(items.size, total, error, loading) {
                                if (!loading && error == null && (total < 0 || items.size < total)) loadMore()
                            }
                            if (loading && total >= 0 && items.isNotEmpty()) {
                                Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { Spinner() }
                            }
                        }
                        if (error != null) item { BrowseLoadError(error!!) { attempt++ } }
                    }
                }
            }
        }
    }
}


@Composable
private fun BrowseLoadError(message: String, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = TextSecondary, fontSize = 13.sp)
        Spacer(Modifier.size(8.dp))
        ActionButton("Tentar novamente", onRetry, primary = true)
    }
}

@Composable
private fun BrowseEmpty(error: String?, loading: Boolean, onRetry: () -> Unit) {
    when {
        error != null -> ErrorBox(error, onRetry)
        loading -> CenterBox { Spinner() }
        else -> CenterBox { Text("Nada encontrado aqui.", color = TextSecondary, fontSize = 16.sp) }
    }
}

@Composable
fun ChannelRow(item: Item, onClick: () -> Unit, onToggleFavorite: () -> Unit) {
    FocusCard(
        onClick,
        Modifier
            .fillMaxWidth()
            .onKeyEvent { ev ->
                if (ev.type == KeyEventType.KeyDown && ev.key == Key.Menu) {
                    onToggleFavorite()
                    true
                } else {
                    false
                }
            },
        shape = RoundedCornerShape(8.dp),
        focusedScale = 1.02f,
    ) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) Surface2 else Surface1)
                .padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(56.dp, 38.dp)) { PosterBackground(item, fit = true) }
            Spacer(Modifier.width(12.dp))
            Text(
                item.title,
                color = TextPrimary,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (item.favorite) Text("★", color = Gold, fontSize = 16.sp)
        }
    }
}

package com.iptvplayer.tv.ui

import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.produceState
import androidx.compose.ui.graphics.Brush
import com.iptvplayer.tv.data.MetaResponse
import kotlinx.coroutines.delay
import androidx.compose.ui.focus.onFocusChanged
import com.iptvplayer.tv.data.EpgData
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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

    val appContext = LocalContext.current
    var group by remember(type) { mutableStateOf<String?>(com.iptvplayer.tv.data.UiMemory.getGroup(appContext, type)) }
    var groups by remember(type) { mutableStateOf<List<GroupInfo>>(emptyList()) }
    LaunchedEffect(type, group) { com.iptvplayer.tv.data.UiMemory.setGroup(appContext, type, group) }
    // Categoria lembrada que não existe mais na lista: volta para "Todos".
    LaunchedEffect(groups) {
        if (group != null && groups.isNotEmpty() && groups.none { it.name == group }) group = null
    }
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
        val focusedChannel = remember { mutableStateOf<Item?>(null) }
        LaunchedEffect(items.size) {
            if (focusedChannel.value == null && items.isNotEmpty()) {
                focusedChannel.value = items.first()
            }
        }
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
                        "${g.name} (${g.count})",
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
                        itemsIndexed(items, key = { _, ch -> ch.id }, contentType = { _, _ -> "channel" }) { index, ch ->
                            ChannelRow(
                                ch,
                                onClick = { onPlay(PlayRequest(items.toList(), index)) },
                                onToggleFavorite = { toggleFavorite(ch.id) },
                                number = index + 1,
                                onFocused = { focusedChannel.value = ch },
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
            Spacer(Modifier.width(16.dp))
            LiveEpgPanel(focusedChannel) { ch ->
                val idx = items.indexOfFirst { it.id == ch.id }
                if (idx >= 0) onPlay(PlayRequest(items.toList(), idx))
            }
        }
    } else if (type == "live") {
        Column(Modifier.fillMaxSize()) {
            CategoryPicker("CATEGORIA DO AO VIVO", group, groups, total) { group = it }
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
                                number = index + 1,
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
    } else if (isTv) {
        TvCatalogLayout(
            type = type,
            groups = groups,
            group = group,
            onGroup = { group = it },
            items = items,
            total = total,
            loading = loading,
            error = error,
            onRetry = { attempt++ },
            onLoadMore = { loadMore() },
            onOpen = onOpen,
            onPlay = onPlay,
        )
    } else {
        val sidePadding = if (isTv) 48.dp else 18.dp
        val posterWidth = if (isTv) 190.dp else 148.dp
        Column(Modifier.fillMaxSize()) {
            if (isTv) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = sidePadding, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item { Pill("Todos", selected = group == null, onClick = { group = null }) }
                    items(groups, key = { it.name }) { g ->
                        Pill("${g.name} (${g.count})", selected = group == g.name, onClick = { group = g.name })
                    }
                }
            } else {
                CategoryPicker("CATEGORIA", group, groups, total) { group = it }
            }
            Box(Modifier.fillMaxSize()) {
                if (items.isEmpty()) {
                    BrowseEmpty(error, loading) { attempt++ }
                } else {
                    LazyVerticalGrid(
                        columns = if (isTv) GridCells.Adaptive(minSize = posterWidth) else GridCells.Fixed(ScreenMath.gridColumns(LocalScreenInfo.current.widthDp)),
                        contentPadding = PaddingValues(horizontal = sidePadding, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(if (isTv) 18.dp else 12.dp),
                        verticalArrangement = Arrangement.spacedBy(if (isTv) 20.dp else 16.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        itemsIndexed(items, key = { _, item -> item.id }) { _, item ->
                            MediaCard(item, onClick = { onOpen(item) }, Modifier.fillMaxWidth(), cardWidth = posterWidth, fillWidth = !isTv)
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
        loading -> PosterSkeleton()
        else -> CenterBox { Text("Nada encontrado aqui.", color = TextSecondary, fontSize = 16.sp) }
    }
}

@Composable
fun ChannelRow(item: Item, onClick: () -> Unit, onToggleFavorite: () -> Unit, number: Int? = null, onFocused: (() -> Unit)? = null) {
    if (UiMode.phone) {
        PhoneChannelRow(item, onClick, onToggleFavorite, number)
        return
    }
    FocusCard(
        onClick,
        Modifier
            .fillMaxWidth()
            .onFocusChanged { if (it.hasFocus) onFocused?.invoke() }
            .onKeyEvent { ev ->
                if (ev.key == Key.Menu) {
                    if (ev.type == KeyEventType.KeyDown) onToggleFavorite()
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
            if (number != null) {
                Text(
                    number.toString(),
                    color = TextSecondary,
                    fontSize = 12.sp,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                    modifier = Modifier.width(38.dp),
                )
            }
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


@Composable
private fun PhoneChannelRow(item: Item, onClick: () -> Unit, onToggleFavorite: () -> Unit, number: Int?) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (number != null) {
            Text(number.toString(), color = TextSecondary, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.width(46.dp), maxLines = 1)
        }
        Box(Modifier.size(82.dp, 58.dp).clip(RoundedCornerShape(14.dp)).background(Surface1)) { PosterBackground(item, fit = true) }
        Spacer(Modifier.width(16.dp))
        Text(
            item.title,
            color = TextPrimary,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(10.dp))
        Box(
            Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(Surface1).clickable(onClick = onToggleFavorite),
            contentAlignment = Alignment.Center,
        ) {
            PhoneIconView(if (item.favorite) PhoneIcon.STAR_FILLED else PhoneIcon.STAR, if (item.favorite) Gold else TextSecondary, size = 26.dp)
        }
    }
}

/** Seletor de categoria (celular): cartão com nome e quantidade; toque abre a lista. */
@Composable
private fun CategoryPicker(label: String, selected: String?, groups: List<GroupInfo>, total: Int, onPick: (String?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val count = selected?.let { name -> groups.firstOrNull { it.name == name }?.count } ?: total.coerceAtLeast(0)
    Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(Surface1)
                .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(22.dp))
                .clickable { open = true }
                .padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PhoneIconView(PhoneIcon.LIST, Accent, size = 30.dp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(label, color = TextSecondary, fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp, maxLines = 1)
                Text(selected ?: "Todos", color = TextPrimary, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text(count.toString(), color = TextSecondary, fontSize = 17.sp)
            Spacer(Modifier.width(10.dp))
            PhoneIconView(PhoneIcon.CHEVRON_DOWN, TextPrimary, size = 24.dp)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = Modifier.heightIn(max = 420.dp)) {
            DropdownMenuItem(text = { Text("Todos") }, onClick = { onPick(null); open = false })
            groups.forEach { g ->
                DropdownMenuItem(text = { Text("${g.name} (${g.count})") }, onClick = { onPick(g.name); open = false })
            }
        }
    }
}


// ─── Catálogo da TV: categorias | grade de capas | painel do título em foco ──
@Composable
private fun TvCatalogLayout(
    type: String,
    groups: List<GroupInfo>,
    group: String?,
    onGroup: (String?) -> Unit,
    items: List<Item>,
    total: Int,
    loading: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onOpen: (Item) -> Unit,
    onPlay: (PlayRequest) -> Unit,
) {
    val focused = remember(type) { mutableStateOf<Item?>(null) }
    val allCount = if (groups.isNotEmpty()) groups.sumOf { it.count } else total.coerceAtLeast(0)
    Row(Modifier.fillMaxSize().padding(start = 12.dp, end = 24.dp, bottom = 8.dp)) {
        Column(Modifier.width(176.dp).fillMaxHeight()) {
            Text(if (type == "movie") "Filmes" else "Séries", color = TextPrimary, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
            Text("${if (total >= 0) allCount else 0} títulos", color = TextSecondary, fontSize = 11.sp)
            Spacer(Modifier.height(8.dp))
            LazyColumn(
                Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(4.dp),
                contentPadding = PaddingValues(bottom = 12.dp),
            ) {
                item(key = "all") { TvCategoryRow("Todos", allCount, group == null) { onGroup(null) } }
                items(groups, key = { it.name }) { g ->
                    TvCategoryRow(g.name, g.count, group == g.name) { onGroup(g.name) }
                }
            }
        }
        Spacer(Modifier.width(12.dp))
        Box(Modifier.weight(1f).fillMaxHeight()) {
            if (items.isEmpty()) {
                BrowseEmpty(error, loading, onRetry)
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(minSize = 88.dp),
                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    itemsIndexed(items, key = { _, item -> item.id }, contentType = { _, _ -> "poster" }) { _, item ->
                        MediaCard(
                            item,
                            onClick = { onOpen(item) },
                            Modifier.fillMaxWidth(),
                            fillWidth = true,
                            onFocused = { focused.value = item },
                        )
                    }
                    item(key = "load-more:$type:${group.orEmpty()}") {
                        LaunchedEffect(items.size, total, error, loading) {
                            if (!loading && error == null && (total < 0 || items.size < total)) onLoadMore()
                        }
                        if (loading && total >= 0 && items.isNotEmpty()) {
                            Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { Spinner() }
                        }
                    }
                    if (error != null) item { BrowseLoadError(error) { onRetry() } }
                }
            }
        }
        Spacer(Modifier.width(12.dp))
        TvDetailPanel(focused, onOpen, onPlay)
    }
}

@Composable
private fun TvCategoryRow(name: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    FocusCard(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp), focusedScale = 1.02f) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (selected) Accent else if (focused) Surface2 else Color.Transparent)
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                name,
                color = if (selected) OnAccent else TextPrimary,
                fontSize = 12.sp,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                count.toString(),
                color = if (selected) OnAccent.copy(alpha = 0.75f) else TextSecondary,
                fontSize = 10.sp,
                fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
            )
        }
    }
}

@Composable
private fun TvDetailPanel(focusedState: androidx.compose.runtime.State<Item?>, onOpen: (Item) -> Unit, onPlay: (PlayRequest) -> Unit) {
    val item = focusedState.value
    val app = LocalContext.current.applicationContext as IptvApp
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier
            .width(236.dp)
            .fillMaxHeight()
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Surface2, Surface1)))
            .border(1.dp, Color.White.copy(alpha = 0.07f), shape)
            .padding(14.dp),
    ) {
        if (item == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Escolha um título para ver os detalhes.", color = TextSecondary, fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            return@Column
        }
        val meta by produceState<MetaResponse?>(null, item.id) {
            value = null
            delay(350) // só busca quando o foco para de passar de capa em capa
            value = try {
                app.api.meta(item.id)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
        }
        Box(Modifier.align(Alignment.CenterHorizontally).width(108.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp))) {
            PosterBackground(item, fit = false)
        }
        Spacer(Modifier.height(10.dp))
        Text(item.title, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(3.dp))
        val info = listOfNotNull(
            if (item.type == "series") "Série" else "Filme",
            (item.year ?: meta?.year)?.toString(),
            item.group.takeIf { it.isNotBlank() },
        ).joinToString(" · ")
        Text(info, color = TextSecondary, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        meta?.rating?.takeIf { it > 0 }?.let {
            Text("★ " + String.format(java.util.Locale.US, "%.1f", it), color = Gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(6.dp))
        val overview = meta?.overview.orEmpty()
        if (overview.isNotBlank()) {
            Text(overview, color = TextSecondary, fontSize = 10.sp, lineHeight = 14.sp, maxLines = 7, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ActionButton(
                if (item.type == "series") "Ver episódios" else "▶ Assistir",
                onClick = { if (item.type == "series") onOpen(item) else onPlay(PlayRequest(listOf(item), 0)) },
                primary = true,
            )
            ActionButton("Detalhes", onClick = { onOpen(item) })
        }
    }
}

@Composable
private fun LiveEpgPanel(channelState: androidx.compose.runtime.State<Item?>, onWatch: (Item) -> Unit) {
    val channel = channelState.value
    val app = LocalContext.current.applicationContext as IptvApp
    val shape = RoundedCornerShape(18.dp)
    Column(
        Modifier
            .width(250.dp)
            .fillMaxHeight()
            .padding(vertical = 8.dp)
            .clip(shape)
            .background(Brush.verticalGradient(listOf(Surface2, Surface1)))
            .border(1.dp, Color.White.copy(alpha = 0.07f), shape)
            .padding(14.dp),
    ) {
        if (channel == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Selecione um canal para ver a programação.", color = TextSecondary, fontSize = 12.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            return@Column
        }
        val epg by produceState<EpgData?>(null, channel.id) {
            value = null
            delay(400) // só busca quando o foco para de passar de canal em canal
            value = try {
                app.api.epg(channel.id).epg
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
        }
        Box(Modifier.align(Alignment.CenterHorizontally).size(120.dp, 72.dp).clip(RoundedCornerShape(10.dp))) {
            PosterBackground(channel, fit = true)
        }
        Spacer(Modifier.height(10.dp))
        Text(channel.title, color = TextPrimary, fontSize = 15.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(8.dp))
        val now = epg?.current
        if (now == null) {
            Text("Sem guia de programação para este canal.", color = TextSecondary, fontSize = 11.sp)
        } else {
            Text("AGORA", color = Gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(now.title, color = TextPrimary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            androidx.compose.material3.LinearProgressIndicator(
                progress = { now.progress.coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).height(3.dp),
                color = Gold,
                trackColor = Color.White.copy(alpha = 0.12f),
            )
            if (now.desc.isNotBlank()) Text(now.desc, color = TextSecondary, fontSize = 10.sp, lineHeight = 14.sp, maxLines = 4, overflow = TextOverflow.Ellipsis)
            val fmt = remember { java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()) }
            val later = listOfNotNull(epg?.next) + (epg?.upcoming.orEmpty())
            if (later.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text("A SEGUIR", color = TextSecondary, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                later.take(3).forEach { p ->
                    Text("${fmt.format(java.util.Date(p.startMs))}  ${p.title}", color = TextPrimary, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.weight(1f))
        ActionButton("▶ Assistir", onClick = { onWatch(channel) }, primary = true)
    }
}

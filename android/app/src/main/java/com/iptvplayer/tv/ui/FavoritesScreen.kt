package com.iptvplayer.tv.ui

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Item

@Composable
fun FavoritesScreen(refreshKey: Int, onOpen: (Item) -> Unit, onPlay: (PlayRequest) -> Unit) {
    val app = LocalContext.current.applicationContext as IptvApp
    var attempt by remember { mutableIntStateOf(0) }
    val state by rememberLoad(refreshKey, attempt) { app.api.favorites() }

    when (val s = state) {
        is Load.Loading -> CenterBox { Spinner() }
        is Load.Err -> ErrorBox(s.message) { attempt++ }
        is Load.Ok -> {
            val all = s.value.items
            if (all.isEmpty()) {
                CenterBox {
                    Text(
                        "Sua lista está vazia.\nAbra um filme, série ou canal e adicione aos favoritos.",
                        color = TextSecondary,
                        fontSize = 16.sp,
                    )
                }
            } else {
                val live = all.filter { it.isLive }
                val movies = all.filter { it.type == "movie" }
                val series = all.filter { it.type == "series" }
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp, horizontal = 0.dp)) {
                    if (movies.isNotEmpty()) item { ItemRow("Filmes", movies, onOpen) }
                    if (series.isNotEmpty()) item { ItemRow("Séries", series, onOpen) }
                    if (live.isNotEmpty()) {
                        item {
                            ItemRow("Canais", live, onClick = { ch -> onPlay(PlayRequest(live, live.indexOf(ch))) })
                        }
                    }
                }
            }
        }
    }
}

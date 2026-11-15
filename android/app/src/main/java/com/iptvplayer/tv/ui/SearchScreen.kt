package com.iptvplayer.tv.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iptvplayer.tv.IptvApp
import com.iptvplayer.tv.data.Item
import com.iptvplayer.tv.data.SearchResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

@Composable
fun SearchScreen(onOpen: (Item) -> Unit, onPlay: (PlayRequest) -> Unit) {
    val app = LocalContext.current.applicationContext as IptvApp
    val sidePadding = if (rememberIsTv()) 48.dp else 18.dp
    var query by remember { mutableStateOf("") }
    val q = query.trim()

    val result by produceState<Load<SearchResponse>?>(null, q) {
        if (q.length < 2) {
            value = null
            return@produceState
        }
        delay(450) // espera o usuário parar de digitar
        value = Load.Loading
        value = try {
            Load.Ok(app.api.search(q))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Load.Err(friendlyError(e))
        }
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            singleLine = true,
            label = { Text("Buscar canais, filmes e séries") },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = sidePadding, vertical = 8.dp),
        )
        when (val r = result) {
            null -> CenterBox {
                Text("Digite pelo menos 2 letras.", color = TextSecondary, fontSize = 15.sp)
            }
            is Load.Loading -> CenterBox { Spinner() }
            is Load.Err -> CenterBox { Text(r.message, color = TextSecondary, fontSize = 15.sp) }
            is Load.Ok -> {
                val res = r.value
                if (res.live.isEmpty() && res.movies.isEmpty() && res.series.isEmpty()) {
                    CenterBox { Text("Nada encontrado para \"$q\".", color = TextSecondary, fontSize = 15.sp) }
                } else {
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
                        if (res.movies.isNotEmpty()) item { ItemRow("Filmes", res.movies, onOpen) }
                        if (res.series.isNotEmpty()) item { ItemRow("Séries", res.series, onOpen) }
                        if (res.live.isNotEmpty()) {
                            item {
                                ItemRow("Canais", res.live, onClick = { ch -> onPlay(PlayRequest(res.live, res.live.indexOf(ch))) })
                            }
                        }
                    }
                }
            }
        }
    }
}

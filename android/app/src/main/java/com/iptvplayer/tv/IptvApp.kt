package com.iptvplayer.tv

import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.iptvplayer.tv.data.Api
import com.iptvplayer.tv.data.DeviceIdentity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class IptvApp : Application(), ImageLoaderFactory {
    lateinit var identity: DeviceIdentity.Id
        private set
    lateinit var api: Api
        private set

    override fun onCreate() {
        super.onCreate()
        com.iptvplayer.tv.data.CrashLog.install(this)
        com.iptvplayer.tv.data.DnsPrefs.load(this)
        identity = DeviceIdentity.get(this)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { DeviceIdentity.migrateAuth(this@IptvApp) }
        val serverUrl = DeviceIdentity.getServerUrl(this, BuildConfig.PANEL_URL)
        api = Api(serverUrl, identity.mac, identity.key, { DeviceIdentity.getAuth(this) }, this)
    }

    /**
     * Capas: guarda em disco (150 MB) e ignora cabeçalhos "no-cache" comuns em servidores IPTV, para as capas não
     * serem baixadas de novo a cada visita. Em aparelhos com pouca memória usa menos RAM e imagens mais leves.
     */
    override fun newImageLoader(): ImageLoader {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
        val lowRam = am?.isLowRamDevice == true
        return ImageLoader.Builder(this)
            .callFactory { com.iptvplayer.tv.data.NetClients.client }
            .memoryCache { MemoryCache.Builder(this).maxSizePercent(if (lowRam) 0.12 else 0.25).build() }
            .diskCache { DiskCache.Builder().directory(cacheDir.resolve("img")).maxSizeBytes(150L * 1024 * 1024).build() }
            .respectCacheHeaders(false)
            .allowRgb565(lowRam)
            .bitmapConfig(if (lowRam) Bitmap.Config.RGB_565 else Bitmap.Config.ARGB_8888)
            .crossfade(true)
            .build()
    }

    fun updateServerUrl(url: String) {
        DeviceIdentity.saveServerUrl(this, url)
        api.baseUrl = url
    }
}

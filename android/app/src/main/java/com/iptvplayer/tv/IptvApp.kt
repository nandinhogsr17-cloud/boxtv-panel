package com.iptvplayer.tv

import android.app.Application
import com.iptvplayer.tv.data.Api
import com.iptvplayer.tv.data.DeviceIdentity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class IptvApp : Application() {
    lateinit var identity: DeviceIdentity.Id
        private set
    lateinit var api: Api
        private set

    override fun onCreate() {
        super.onCreate()
        identity = DeviceIdentity.get(this)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch { DeviceIdentity.migrateAuth(this@IptvApp) }
        val serverUrl = DeviceIdentity.getServerUrl(this, BuildConfig.PANEL_URL)
        api = Api(serverUrl, identity.mac, identity.key) {
            DeviceIdentity.getAuth(this)
        }
    }

    fun updateServerUrl(url: String) {
        DeviceIdentity.saveServerUrl(this, url)
        api.baseUrl = url
    }
}

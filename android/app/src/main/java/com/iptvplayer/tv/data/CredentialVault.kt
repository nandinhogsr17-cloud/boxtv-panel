package com.iptvplayer.tv.data

import android.content.Context
import android.security.KeyPairGeneratorSpec
import android.util.Base64
import org.json.JSONObject
import java.math.BigInteger
import java.nio.charset.StandardCharsets
import java.security.Key
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.SecureRandom
import java.util.Calendar
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import javax.security.auth.x500.X500Principal

/** Device-local encryption for Xtream credentials. The AES key is wrapped by Android Keystore. */
internal object CredentialVault {
    private const val KEY_ALIAS = "boxtv_xtream_credentials_v1"
    private const val STORE_NAME = "iptv_secure_auth"
    private const val VALUE_KEY = "credentials"
    private const val RSA_TRANSFORMATION = "RSA/ECB/PKCS1Padding"
    private const val AES_TRANSFORMATION = "AES/GCM/NoPadding"
    private const val AAD = "boxtv-xtream-auth-v1"

    @Synchronized
    fun save(context: Context, username: String, password: String) {
        val payload = JSONObject().put("username", username).put("password", password)
            .toString().toByteArray(StandardCharsets.UTF_8)
        val aesKey = ByteArray(32).also(SecureRandom()::nextBytes)
        val aes = Cipher.getInstance(AES_TRANSFORMATION)
        aes.init(Cipher.ENCRYPT_MODE, SecretKeySpec(aesKey, "AES"))
        aes.updateAAD(AAD.toByteArray(StandardCharsets.UTF_8))
        val encrypted = aes.doFinal(payload)
        val wrappedKey = rsaCipher(Cipher.ENCRYPT_MODE, getOrCreateKeyPair(context).public).doFinal(aesKey)
        val encoded = listOf(wrappedKey, aes.iv, encrypted).joinToString(".") {
            Base64.encodeToString(it, Base64.NO_WRAP)
        }
        context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE)
            .edit().putString(VALUE_KEY, encoded).apply()
    }

    @Synchronized
    fun read(context: Context): Pair<String, String>? {
        val encoded = context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE)
            .getString(VALUE_KEY, null) ?: return null
        return runCatching {
            val parts = encoded.split('.')
            require(parts.size == 3)
            val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val privateKey = keyStore.getKey(KEY_ALIAS, null) ?: error("Credential key is missing")
            val aesKey = rsaCipher(Cipher.DECRYPT_MODE, privateKey).doFinal(Base64.decode(parts[0], Base64.NO_WRAP))
            val iv = Base64.decode(parts[1], Base64.NO_WRAP)
            val cipher = Cipher.getInstance(AES_TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(aesKey, "AES"), GCMParameterSpec(128, iv))
            cipher.updateAAD(AAD.toByteArray(StandardCharsets.UTF_8))
            val json = JSONObject(String(cipher.doFinal(Base64.decode(parts[2], Base64.NO_WRAP)), StandardCharsets.UTF_8))
            json.getString("username") to json.getString("password")
        }.getOrNull()
    }

    @Synchronized
    fun clear(context: Context) {
        context.getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun rsaCipher(mode: Int, key: Key): Cipher =
        Cipher.getInstance(RSA_TRANSFORMATION).apply { init(mode, key) }

    private fun getOrCreateKeyPair(context: Context): KeyPair {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return KeyPair(keyStore.getCertificate(KEY_ALIAS).publicKey, keyStore.getKey(KEY_ALIAS, null) as java.security.PrivateKey)
        }
        val start = Calendar.getInstance()
        val end = Calendar.getInstance().apply { add(Calendar.YEAR, 30) }
        val spec = KeyPairGeneratorSpec.Builder(context)
            .setAlias(KEY_ALIAS)
            .setSubject(X500Principal("CN=BoxTv Xtream credentials"))
            .setSerialNumber(BigInteger.ONE)
            .setStartDate(start.time)
            .setEndDate(end.time)
            .build()
        return KeyPairGenerator.getInstance("RSA", "AndroidKeyStore").run {
            initialize(spec)
            generateKeyPair()
        }
    }
}
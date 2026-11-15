package com.iptvplayer.tv.data

class ApiException(
    val httpCode: Int,
    val error: String,
    val status: String? = null,
) : Exception("API Error $httpCode: $error" + (status?.let { " ($it)" } ?: ""))

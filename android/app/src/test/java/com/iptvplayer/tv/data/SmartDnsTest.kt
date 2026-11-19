package com.iptvplayer.tv.data

import org.junit.Assert.assertEquals
import org.junit.Test

class SmartDnsTest {
    @Test
    fun parsesAddressesAndMinTtl() {
        val body = """{"Status":0,"Answer":[{"name":"a.com","type":5,"TTL":10,"data":"b.com."},{"name":"b.com","type":1,"TTL":120,"data":"1.2.3.4"},{"name":"b.com","type":1,"TTL":60,"data":"5.6.7.8"}]}"""
        val (ips, ttl) = FallbackDns.parseDoh(body)
        assertEquals(listOf("1.2.3.4", "5.6.7.8"), ips)
        assertEquals(60L, ttl)
    }

    @Test
    fun emptyOrBrokenAnswerGivesNothing() {
        assertEquals(emptyList<String>(), FallbackDns.parseDoh("""{"Status":3}""").first)
        assertEquals(emptyList<String>(), FallbackDns.parseDoh("não é json").first)
    }
}

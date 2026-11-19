package com.iptvplayer.tv.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DirectBackendTest {
    @Test
    fun cleanTitleRemovesNoiseAndFindsYear() {
        val (title, year) = DirectBackend.cleanTitle("BR: Filme Teste (2024) [FHD] DUAL")
        assertEquals("Filme Teste", title)
        assertEquals(2024, year)
    }

    @Test
    fun cleanTitleKeepsPlainNames() {
        val (title, year) = DirectBackend.cleanTitle("Canal Um")
        assertEquals("Canal Um", title)
        assertEquals(null, year)
    }

    @Test
    fun adultGroupsAreDetected() {
        assertTrue(DirectBackend.isAdultGroup("ADULTOS +18"))
        assertTrue(DirectBackend.isAdultGroup("Filmes Eróticos"))
        assertTrue(DirectBackend.isAdultGroup("XXX"))
        assertFalse(DirectBackend.isAdultGroup("Lançamentos"))
        assertFalse(DirectBackend.isAdultGroup("Sexta-feira Clássicos"))
    }

    @Test
    fun normIgnoresAccentsAndCase() {
        assertEquals("acao e aventura", DirectBackend.norm("Ação  e  Aventura"))
    }

    @Test
    fun hashIsStableAndShort() {
        assertEquals(DirectBackend.hashOf("http://a/b.mp4"), DirectBackend.hashOf("http://a/b.mp4"))
        assertEquals(12, DirectBackend.hashOf("x").length)
    }

    @Test
    fun fuzzyToleratesOneTypo() {
        val t = DirectBackend.norm("Os Vingadores: Ultimato")
        assertTrue(DirectBackend.fuzzyMatch(t, listOf("vingadors")))
        assertTrue(DirectBackend.fuzzyMatch(t, listOf("ultimto")))
        assertFalse(DirectBackend.fuzzyMatch(t, listOf("batman")))
    }

    @Test
    fun relevanceRanksExactAndPrefixFirst() {
        val q = "matrix"
        val titles = listOf("O Retorno de Matrix Resurrections", "Matrix", "Matrix Reloaded", "Animatrix")
            .sortedBy { DirectBackend.relevance(DirectBackend.norm(it), q) }
        assertEquals(listOf("Matrix", "Matrix Reloaded", "O Retorno de Matrix Resurrections", "Animatrix"), titles)
    }
}

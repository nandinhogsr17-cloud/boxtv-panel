package com.iptvplayer.tv.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenMathTest {
    @Test fun tv1080pDensity2NeedsNoScaling() {
        assertEquals(1f, ScreenMath.autoFactor(true, 1920, 1080, 2f), 0.001f)
    }

    @Test fun tvBoxWithLowDensityIsScaledUp() {
        // 1080p com densidade 1.0 = 1920x1080 dp: a interface ficaria minúscula
        assertEquals(2f, ScreenMath.autoFactor(true, 1920, 1080, 1f), 0.001f)
        // 720p com densidade 1.0 = 1280x720 dp
        assertEquals(1.333f, ScreenMath.autoFactor(true, 1280, 720, 1f), 0.01f)
    }

    @Test fun tvUltrawideUsesLimitingSide() {
        // 2560x1080 a 2.0: 1280x540 dp -> limitado pela altura (1.0), não pela largura (1.33)
        assertEquals(1f, ScreenMath.autoFactor(true, 2560, 1080, 2f), 0.001f)
    }

    @Test fun phoneKeepsSystemSize() {
        assertEquals(1f, ScreenMath.autoFactor(false, 1080, 2400, 2.625f), 0.001f)
    }

    @Test fun tabletGrowsButIsCapped() {
        val f = ScreenMath.autoFactor(false, 2560, 1600, 2f) // sw = 800 dp
        assertTrue(f > 1f && f <= 1.2f)
    }

    @Test fun invalidInputsNeverProduceInvalidFactor() {
        assertEquals(1f, ScreenMath.autoFactor(true, 0, 0, 0f), 0f)
        assertEquals(1f, ScreenMath.autoFactor(false, 1080, 2400, Float.NaN), 0.5f)
        val f = ScreenMath.factor(9999, true, 1920, 1080, 1f)
        assertTrue(f <= ScreenMath.MAX_FACTOR && f >= ScreenMath.MIN_FACTOR)
    }

    @Test fun sanitizeClampsEverything() {
        val s = ScreenMath.sanitize(ScreenSettings(-5, 99, -3))
        assertEquals(ScreenMath.MIN_PCT, s.scalePct)
        assertEquals(ScreenMath.MAX_OVERSCAN, s.overscanHPct)
        assertEquals(0, s.overscanVPct)
    }

    @Test fun fontScaleIsLimited() {
        assertEquals(1.3f, ScreenMath.fontScale(2f, 1f, false), 0.001f)
        assertEquals(1f, ScreenMath.fontScale(Float.NaN, 1f, false), 0.001f)
        // fator grande + fonte grande não passa do multiplicador máximo
        val fs = ScreenMath.fontScale(1.3f, 2.4f, false)
        assertTrue(2.4f * fs <= ScreenMath.MAX_TEXT_MULTIPLIER + 0.001f)
    }

    @Test fun gridColumnsAdaptToWidth() {
        assertEquals(3, ScreenMath.gridColumns(411f))
        assertEquals(6, ScreenMath.gridColumns(800f))
        assertEquals(8, ScreenMath.gridColumns(3000f))
        assertEquals(3, ScreenMath.gridColumns(Float.NaN))
    }

    @Test fun sizeClassBreakpoints() {
        assertEquals(SizeClass.COMPACT, ScreenMath.sizeClass(411f))
        assertEquals(SizeClass.MEDIUM, ScreenMath.sizeClass(700f))
        assertEquals(SizeClass.EXPANDED, ScreenMath.sizeClass(1000f))
    }

    @Test fun smallPhoneIsShrunkToFit() {
        assertEquals(0.9f, ScreenMath.autoFactor(false, 720, 1280, 2.5f), 0.001f)
    }

    @Test fun recommendedHasSafeMarginOnlyOnTv() {
        assertEquals(ScreenMath.TV_SAFE_OVERSCAN_PCT, ScreenMath.recommended(true).overscanHPct)
        assertEquals(0, ScreenMath.recommended(false).overscanHPct)
        assertEquals(100, ScreenMath.recommended(true).scalePct)
    }

    @Test fun classifiesDevices() {
        assertEquals("TV HD", ScreenMath.deviceClass(true, 1280, 720, 160))
        assertEquals("TV Full HD", ScreenMath.deviceClass(true, 1920, 1080, 320))
        assertEquals("TV 4K", ScreenMath.deviceClass(true, 3840, 2160, 640))
        assertEquals("Celular", ScreenMath.deviceClass(false, 1080, 2400, 420))
        assertEquals("Tablet", ScreenMath.deviceClass(false, 1600, 2560, 320))
    }

    @Test fun signatureIgnoresOrientation() {
        assertEquals(ScreenMath.signature(1920, 1080, 320), ScreenMath.signature(1080, 1920, 320))
    }
}

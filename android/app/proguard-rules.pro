# Se ligar isMinifyEnabled = true no release, mantenha os modelos da API:
-keepattributes *Annotation*, InnerClasses
-keep class com.iptvplayer.tv.data.** { *; }
-keepclassmembers class **$$serializer { *; }
-dontwarn okhttp3.internal.platform.**

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val configuredApplicationId = providers.gradleProperty("ludoApplicationId").orNull
    ?: System.getenv("LUDO_APPLICATION_ID")
val applicationIdForBuild = configuredApplicationId ?: "com.example.ludo_multiplayer"
val androidReleaseEnvironment = listOf(
    "ANDROID_KEYSTORE_PATH",
    "ANDROID_KEYSTORE_PASSWORD",
    "ANDROID_KEY_ALIAS",
    "ANDROID_KEY_PASSWORD",
)
val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }

if (releaseRequested) {
    require(!configuredApplicationId.isNullOrBlank() && !configuredApplicationId.startsWith("com.example.")) {
        "Set publisher-owned -PludoApplicationId or LUDO_APPLICATION_ID for release builds"
    }
    val missingSigning = androidReleaseEnvironment.filter { System.getenv(it).isNullOrBlank() }
    require(missingSigning.isEmpty()) { "Missing Android release signing configuration: ${missingSigning.joinToString()}" }
    require(file(System.getenv("ANDROID_KEYSTORE_PATH")).isFile) {
        "ANDROID_KEYSTORE_PATH must reference an existing keystore"
    }
}

android {
    namespace = "com.example.ludo_multiplayer"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = applicationIdForBuild
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = maxOf(flutter.minSdkVersion, 24)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH") ?: "")
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

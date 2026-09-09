#!/usr/bin/env bash
# OpenEir sandbox — Android build toolchain installer.
# Re-runnable after workspace wipes: JDK (full, has javac), Android SDK 35,
# Gradle 8.11.1. System packages (java JRE-only) are NOT touched.
set -euo pipefail

echo "[1/4] Temurin JDK 21 (javac) ..."
if [ ! -x "$HOME/jdk/bin/javac" ]; then
  curl -sL -o /tmp/jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  mkdir -p ~/jdk && tar xzf /tmp/jdk21.tar.gz -C ~/jdk --strip-components=1
fi
"$HOME/jdk/bin/javac" -version

echo "[2/4] Android cmdline-tools ..."
if [ ! -d "$HOME/android-sdk/cmdline-tools/latest" ]; then
  mkdir -p ~/android-sdk/cmdline-tools
  curl -sL -o /tmp/cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
  unzip -q /tmp/cmdtools.zip -d ~/android-sdk/cmdline-tools
  mv ~/android-sdk/cmdline-tools/cmdline-tools ~/android-sdk/cmdline-tools/latest
fi

echo "[3/4] SDK packages (platform-35, build-tools 35.0.0, platform-tools) ..."
export ANDROID_HOME="$HOME/android-sdk"
if [ ! -d "$HOME/android-sdk/platforms/android-35" ]; then
  yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses > /dev/null 2>&1 || true
  "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-35" "build-tools;35.0.0" > /dev/null 2>&1
fi
ls "$ANDROID_HOME/platforms" "$ANDROID_HOME/build-tools"

echo "[4/4] Gradle 8.11.1 ..."
if [ ! -x "$HOME/gradle/gradle-8.11.1/bin/gradle" ]; then
  curl -sL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-8.11.1-all.zip"
  mkdir -p ~/gradle && unzip -q /tmp/gradle.zip -d ~/gradle
fi
"$HOME/gradle/gradle-8.11.1/bin/gradle" --version | grep "Gradle"

echo "TOOLCHAIN READY — use: JAVA_HOME=~/jdk ~/gradle/gradle-8.11.1/bin/gradle --no-daemon <task>"

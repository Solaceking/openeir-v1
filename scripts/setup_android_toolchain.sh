#!/bin/bash
# Rebuild the Android build toolchain after sandbox wipe (known-good from v3.8.2/v3.8.3 builds):
#   Temurin JDK 21 (needs javac — system JRE has none), Gradle 8.11.1, Android SDK 35 + build-tools 35.
# Then generate the NEW release keystore (previous rotated keystore was lost in the wipe).
set -x
export HOME=/home/z
cd $HOME

echo "=== [1/5] Temurin JDK 21 ==="
if [ ! -d $HOME/jdk ]; then
  for i in 1 2 3; do
    curl -sSL --retry 3 --retry-delay 3 -o /tmp/jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" && [ -s /tmp/jdk21.tar.gz ] && break
    echo "retry $i failed"; sleep 5
  done
  [ -s /tmp/jdk21.tar.gz ] || exit 1
  mkdir -p $HOME/jdk && tar -xzf /tmp/jdk21.tar.gz -C $HOME/jdk --strip-components=1 || exit 1
fi
export JAVA_HOME=$HOME/jdk
export PATH=$JAVA_HOME/bin:$PATH
$JAVA_HOME/bin/javac -version || exit 1

echo "=== [2/5] Gradle 8.11.1 ==="
if [ ! -d $HOME/gradle/gradle-8.11.1 ]; then
  mkdir -p $HOME/gradle
  curl -sSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-8.11.1-bin.zip" || exit 1
  unzip -q /tmp/gradle.zip -d $HOME/gradle || exit 1
fi
$HOME/gradle/gradle-8.11.1/bin/gradle --version 2>&1 | head -5

echo "=== [3/5] Android cmdline-tools ==="
mkdir -p $HOME/android-sdk/cmdline-tools
if [ ! -d $HOME/android-sdk/cmdline-tools/latest ]; then
  curl -sSL -o /tmp/cmdtools.zip "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip" || exit 1
  unzip -q /tmp/cmdtools.zip -d /tmp/cmdtools || exit 1
  mv /tmp/cmdtools/cmdline-tools $HOME/android-sdk/cmdline-tools/latest || exit 1
fi
SDKM=$HOME/android-sdk/cmdline-tools/latest/bin/sdkmanager
yes | $SDKM --licenses > /tmp/sdk-licenses.log 2>&1

echo "=== [4/5] platforms;android-35 + build-tools;35.0.0 ==="
yes | $SDKM "platforms;android-35" "build-tools;35.0.0" "platform-tools" > /tmp/sdk-install.log 2>&1
ls $HOME/android-sdk/platforms $HOME/android-sdk/build-tools || exit 1

echo "=== [5/5] local.properties + keystore ==="
echo "sdk.dir=$HOME/android-sdk" > /home/z/my-project/mobile/android/local.properties

DL=/home/z/my-project/download
mkdir -p $DL
if [ ! -f $DL/openeir-release.keystore ]; then
  PASS=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
  $JAVA_HOME/bin/keytool -genkeypair -v \
    -keystore $DL/openeir-release.keystore -alias openeir \
    -keyalg RSA -keysize 4096 -validity 3650 \
    -storepass "$PASS" -keypass "$PASS" \
    -dname "CN=OpenEir, OU=OpenEir, O=OpenEir, L=Self-hosted, C=AT" || exit 1
  echo "openeir-keystore-password=$PASS" > $DL/openeir-keystore-PASSWORD.txt
  chmod 600 $DL/openeir-keystore-PASSWORD.txt $DL/openeir-release.keystore
  echo "NEW_KEYSTORE_CREATED"
else
  echo "KEYSTORE_EXISTS"
fi
echo "=== TOOLCHAIN READY ==="

# NOTE for local builds: run `cd mobile && npx cap sync android` BEFORE gradle —
# android/app/src/main/assets/public is a gitignored generated copy of shell/www.
# CI (android.yml) runs cap sync itself; skipping it ships a stale shell.

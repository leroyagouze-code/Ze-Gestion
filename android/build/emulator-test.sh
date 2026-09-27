#!/usr/bin/env bash
# Test sur le téléphone virtuel de la CI : installe l'APK, l'ouvre, attend que ZE Gestion soit prêt,
# vérifie les pages depuis le PC (port redirigé) et relève ce que l'écran affiche.
set -u
APK="$1"
OUT=/tmp/emu
mkdir -p "$OUT"
PKG=com.zegroup.gestion

adb install -r "$APK" || exit 1
adb logcat -c
adb shell am start -n "$PKG/.MainActivity"

ok=0
for i in $(seq 1 150); do
  if adb logcat -d -s ZEGestionNode:* | grep -q "Application prête"; then ok=1; break; fi
  if adb logcat -d -s ZEGestionNode:* | grep -q "Échec du démarrage"; then break; fi
  sleep 2
done
adb logcat -d > "$OUT/logcat.txt"
grep -E "ZEGestion|AndroidRuntime|FATAL" "$OUT/logcat.txt" | tail -80
if [ "$ok" != 1 ]; then
  echo "::error::ZE Gestion n'a pas démarré sur le téléphone virtuel"
  adb exec-out screencap -p > "$OUT/ecran-echec.png"
  exit 1
fi
echo "Démarré en $((i * 2)) s environ"

# Port choisi par l'appli (écrit dans les journaux Node)
PORT=$(grep -o "Application prête sur http://localhost:[0-9]*" "$OUT/logcat.txt" | tail -1 | grep -o "[0-9]*$")
adb forward tcp:18080 tcp:"$PORT"
code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/login)
echo "Page de connexion via le téléphone : $code"
[ "$code" = 200 ] || exit 1

sleep 5
adb exec-out screencap -p > "$OUT/ecran.png"
adb shell uiautomator dump /sdcard/ui.xml > /dev/null && adb pull /sdcard/ui.xml "$OUT/ui.xml" > /dev/null
echo "Textes à l'écran :"
grep -o 'text="[^"]\+"' "$OUT/ui.xml" | head -30
grep -q 'ZE Gestion\|Connexion\|Créer' "$OUT/ui.xml" || { echo "::error::L'écran n'affiche pas l'appli"; exit 1; }

# Redémarrage après arrêt forcé : la base doit rouvrir
adb shell am force-stop "$PKG"
adb logcat -c
adb shell am start -n "$PKG/.MainActivity"
for i in $(seq 1 60); do
  adb logcat -d -s ZEGestionNode:* | grep -q "Application prête" && { echo "Relancé après arrêt forcé en $((i * 2)) s"; exit 0; }
  sleep 2
done
adb logcat -d | grep -E "ZEGestion" | tail -40
echo "::error::L'appli ne redémarre pas après un arrêt forcé"
exit 1

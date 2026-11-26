#!/bin/sh
# Closer · refabrique la copie locale de la bibliothèque Supabase (vendor/), au lieu de la charger depuis un site externe.
# Usage : sh outils/supabase-js.sh 2.119.2   (version exacte, jamais « latest » : on choisit quand on change)
# npm vérifie l'empreinte du paquet téléchargé ; esbuild en fait un seul fichier ES module (extension .js : servi partout avec le bon type), sans dépendance externe.
# Ensuite : mettre à jour le nom du fichier dans js/sync.js (SB_LIB), sw.js et tests/qualite.py (VENDOR), puis lancer les tests.
set -e
V="${1:?version exacte, ex. 2.119.2}"
D=$(mktemp -d)
( cd "$D" && npm init -y >/dev/null && npm install --silent --no-audit --no-fund "@supabase/supabase-js@$V" esbuild@0 )
"$D/node_modules/.bin/esbuild" "$D/node_modules/@supabase/supabase-js/dist/index.mjs" --bundle --format=esm --minify \
  --target=safari15 --legal-comments=eof --outfile="vendor/supabase-js-$V.js"
sha256sum "vendor/supabase-js-$V.js"
rm -rf "$D"

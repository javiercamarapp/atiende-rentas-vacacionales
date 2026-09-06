#!/usr/bin/env bash
# Publica el repo en GitHub (privado) con toda la autoría atribuida al usuario,
# para que cada commit cuente como contribución en su perfil.
# Uso: bash tools/publicar-github.sh "<Nombre>" "<correo vinculado a GitHub>" [nombre-repo] [--public]
set -euo pipefail
NOMBRE="${1:?Nombre del autor}"
CORREO="${2:?Correo vinculado a la cuenta de GitHub}"
REPO="${3:-atiende-rentas-vacacionales}"
VISIBILIDAD="--private"; [[ "${4:-}" == "--public" ]] && VISIBILIDAD="--public"
cd "$(dirname "$0")/.."

echo "== 1) Autor para commits futuros (config local del repo)"
git config user.name "$NOMBRE"
git config user.email "$CORREO"

echo "== 2) Reescritura de autoría de TODOS los commits existentes → $NOMBRE <$CORREO>"
echo "   (solo seguro antes del primer push; se conserva mensaje, fecha y contenido)"
git filter-branch -f --env-filter "
export GIT_AUTHOR_NAME='$NOMBRE'; export GIT_AUTHOR_EMAIL='$CORREO';
export GIT_COMMITTER_NAME='$NOMBRE'; export GIT_COMMITTER_EMAIL='$CORREO';
" -- --all >/dev/null
rm -rf .git/refs/original
echo "   autores tras reescritura:"; git log --format='%an <%ae>' | sort | uniq -c

echo "== 3) Repo en GitHub"
LOGIN="$(gh api user --jq .login)"
if gh repo view "$LOGIN/$REPO" >/dev/null 2>&1; then
  echo "   ya existe $LOGIN/$REPO"
else
  gh repo create "$LOGIN/$REPO" $VISIBILIDAD --description "Atiende Rentas Vacacionales — calendario unificado multicanal, operación y agentes con aprobación humana" --source . --remote origin
fi
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$LOGIN/$REPO.git"

echo "== 4) Push de main"
git push -u origin main --force-with-lease 2>/dev/null || git push -u origin main
echo "== Listo: https://github.com/$LOGIN/$REPO"
echo "   Si el repo es privado, activa 'Private contributions' en tu perfil para que se vean los cuadros verdes."

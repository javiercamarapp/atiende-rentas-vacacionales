import subprocess, re, collections

def sh(*args):
    return subprocess.run(args, capture_output=True, text=True, check=True).stdout

log = sh("git", "log", "--reverse", "--format=%H|%s")
commits = []
for line in log.strip().split("\n"):
    h, subj = line.split("|", 1)
    files = sh("git", "show", "--name-only", "--format=", h).strip().split("\n")
    files = [f for f in files if f]
    commits.append((h, subj, files))

SHARED = {
    "docs/PROGRESO.md", "docs/BACKLOG.md", "docs/fase2/BACKLOG.md", "docs/AGENTES.md",
    "docs/BLOQUEOS.md", "docs/logs/bucle.log", "apps/web/src/App.tsx",
    "apps/web/src/components/admin/AdminSidebar.tsx", "apps/api/src/routes/index.ts",
    "apps/api/src/app.ts", "packages/db/src/migrations/index.ts", "package.json",
    "package-lock.json", "docs/fase2/LOTES.md", "docs/fase2/DEFINICION-DE-HECHO.md",
    "docs/fase2/PLAN-CONSTRUCCION.md", "docs/ACEPTACION.md", "docs/DECISIONES.md",
    ".github/workflows/ci.yml",
}

def lote_de_subject(subj):
    m = re.search(r"\(lote ?(\d+)\)", subj, re.IGNORECASE)
    if m:
        return int(m.group(1))
    return None

owner_lote = {}   # file -> lote that created it
owner_commit = {} # file -> commit hash that created it

print("=== Revisión commit por commit (orden cronológico) ===\n")
mezclas = []
for h, subj, files in commits:
    lote = lote_de_subject(subj)
    etiqueta = f"lote {lote}" if lote is not None else "SIN LOTE (correccion/otro)"
    ajenos_este_commit = []
    for f in files:
        if f in SHARED:
            continue
        if f not in owner_lote:
            owner_lote[f] = lote
            owner_commit[f] = h
        else:
            if lote is not None and owner_lote[f] is not None and owner_lote[f] != lote:
                ajenos_este_commit.append((f, owner_lote[f], owner_commit[f]))
    if ajenos_este_commit:
        mezclas.append((h, subj, lote, ajenos_este_commit))

for h, subj, lote, ajenos in mezclas:
    print(f"{h[:8]} [{('lote '+str(lote)) if lote is not None else 'SIN LOTE'}] {subj}")
    for f, olote, ocommit in ajenos:
        print(f"    - {f}  (creado por {ocommit[:8]}, lote {olote})")
    print()

print(f"Total commits: {len(commits)}")
print(f"Commits con archivos de OTRO lote ya existente (mezcla real): {len(mezclas)}")

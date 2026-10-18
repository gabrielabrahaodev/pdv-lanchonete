#!/usr/bin/env python3
"""
Gera diagrama SVG estilo artesanal (igual ao original) via Python.
Não usa Mermaid — desenha diretamente SVG com as mesmas técnicas do original.
"""

from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

# ============ CONFIG ============
WIDTH = 1700
HEIGHT = 1390
BG = "#f8fafc"
FONT = "Segoe UI, Arial, sans-serif"

# Paleta original
COL = {
    "clientes_bg": "#2563eb",
    "clientes_box": "#eff6ff",
    "clientes_stroke": "#bfdbfe",
    "clientes_title": "#1d4ed8",
    "clientes_text": "#334155",
    "nuvem_bg": "#ea580c",
    "nuvem_box": "#fff7ed",
    "nuvem_stroke": "#fed7aa",
    "nuvem_title": "#c2410c",
    "nuvem_text": "#334155",
    "firebase_bg": "#d97706",
    "firebase_box": "#fffbeb",
    "firebase_stroke": "#fde68a",
    "firebase_title": "#b45309",
    "firebase_text": "#334155",
    "devops_bg": "#7c3aed",
    "devops_box": "#f5f3ff",
    "devops_stroke": "#ddd6fe",
    "devops_title": "#6d28d9",
    "devops_text": "#334155",
    "legend_bg1": "#eff6ff",
    "legend_bg2": "#fffbeb",
    "arrow_blue": "#2563eb",
    "arrow_green": "#16a34a",
    "arrow_red": "#dc2626",
    "arrow_dark": "#334155",
    "arrow_purple": "#7c3aed",
    "circle_bg": "#0f172a",
    "circle_text": "#fff",
    "title": "#0f172a",
    "subtitle": "#475569",
    "prod_badge_bg": "#dcfce7",
    "prod_badge_stroke": "#16a34a",
    "prod_badge_text": "#166534",
    "warning_bg": "#fef2f2",
    "warning_stroke": "#fca5a5",
    "warning_text": "#b91c1c",
    "mono": "Consolas, monospace",
}

def pretty_xml(elem):
    rough = tostring(elem, encoding="utf-8")
    return minidom.parseString(rough).toprettyxml(indent="  ")

def add_marker(defs, id, color):
    m = SubElement(defs, "marker", {
        "id": id, "markerWidth": "10", "markerHeight": "8",
        "refX": "8", "refY": "4", "orient": "auto"
    })
    SubElement(m, "path", {"d": "M0,0 L9,4 L0,8 z", "fill": color})

def add_rect(parent, x, y, w, h, rx, fill, stroke=None, **extra):
    attrs = {"x": str(x), "y": str(y), "width": str(w), "height": str(h), "rx": str(rx), "fill": fill}
    if stroke:
        attrs["stroke"] = stroke
    attrs.update(extra)
    return SubElement(parent, "rect", attrs)

def add_text(parent, x, y, text, size=13, weight="400", fill="#334155", anchor="start", font=None, **extra):
    attrs = {"x": str(x), "y": str(y), "font-size": str(size), "font-weight": weight, "fill": fill, "text-anchor": anchor}
    if font:
        attrs["font-family"] = font
    else:
        attrs["font-family"] = FONT
    attrs.update(extra)
    t = SubElement(parent, "text", attrs)
    t.text = text
    return t

def add_line(parent, x1, y1, x2, y2, stroke, width=2, dash=None, marker=None):
    attrs = {"x1": str(x1), "y1": str(y1), "x2": str(x2), "y2": str(y2), "stroke": stroke, "stroke-width": str(width)}
    if dash:
        attrs["stroke-dasharray"] = dash
    if marker:
        attrs["marker-end"] = f"url(#{marker})"
    return SubElement(parent, "line", attrs)

def add_path(parent, d, stroke, width=2, dash=None, marker=None):
    attrs = {"d": d, "fill": "none", "stroke": stroke, "stroke-width": str(width)}
    if dash:
        attrs["stroke-dasharray"] = dash
    if marker:
        attrs["marker-end"] = f"url(#{marker})"
    return SubElement(parent, "path", attrs)

def add_circle(parent, cx, cy, r, fill):
    return SubElement(parent, "circle", {"cx": str(cx), "cy": str(cy), "r": str(r), "fill": fill})

# ============ BUILD SVG ============
svg = Element("svg", {
    "xmlns": "http://www.w3.org/2000/svg",
    "width": str(WIDTH), "height": str(HEIGHT),
    "viewBox": f"0 0 {WIDTH} {HEIGHT}",
    "font-family": FONT
})

defs = SubElement(svg, "defs")
add_marker(defs, "ahBlue", COL["arrow_blue"])
add_marker(defs, "ahGreen", COL["arrow_green"])
add_marker(defs, "ahRed", COL["arrow_red"])
add_marker(defs, "ahDark", COL["arrow_dark"])
add_marker(defs, "ahPurple", COL["arrow_purple"])

# Background
add_rect(svg, 0, 0, WIDTH, HEIGHT, 0, BG)

# ===== Título =====
add_text(svg, 850, 42, "PDV Lanchonete v2 — Arquitetura de PRODUÇÃO", 26, "700", COL["title"], "middle")
add_text(svg, 850, 68, "App: pdv-lanchonete-1fa79.web.app · API: pdv-lanchonete-dwiw.onrender.com · no ar desde 23/08/2026 · R$ 0/mês", 14, "400", COL["subtitle"], "middle")
add_rect(svg, 1440, 22, 230, 30, 15, COL["prod_badge_bg"], COL["prod_badge_stroke"])
add_text(svg, 1555, 42, "✅ PRODUÇÃO ATIVA", 13, "600", COL["prod_badge_text"], "middle")

# ============ COLUNA 1: CLIENTES ============
col1_x, col1_y = 50, 100
col1_w, col1_h = 400, 380
add_rect(svg, col1_x, col1_y, col1_w, 38, 10, COL["clientes_bg"])
add_text(svg, 66, 125, "CLIENTES (loja)", 15, "700", "#fff")
add_rect(svg, col1_x, col1_y+38, col1_w, col1_h, 10, COL["clientes_box"], COL["clientes_stroke"])

# Box 1: Navegador operação
bx1_x, bx1_y = 66, 154
bx1_w, bx1_h = 368, 152
add_rect(svg, bx1_x, bx1_y, bx1_w, bx1_h, 8, "#fff", COL["clientes_stroke"])
add_text(svg, 80, 176, "💻 Navegador da operação (PWA)", 14, "700", COL["clientes_title"])
lines1 = [
    "Caixa · garçom · cozinha (KDS) — Chrome/Edge",
    "Instalado de pdv-lanchonete-1fa79.web.app",
    "lib/api.ts injeta Bearer <ID token> em /api/*",
    "react-query (polling 8–30s) + onSnapshot",
    "tema por usuário · CSV · impressão Bluetooth"
]
for i, line in enumerate(lines1):
    add_text(svg, 80, 197 + i*20, line, 12.5, "400", COL["clientes_text"])

# Box 2: Celular cliente
bx2_x, bx2_y = 66, 318
bx2_w, bx2_h = 368, 96
add_rect(svg, bx2_x, bx2_y, bx2_w, bx2_h, 8, "#fff", COL["clientes_stroke"])
add_text(svg, 80, 340, "📱 Celular do cliente — cardápio QR", 14, "700", COL["clientes_title"])
lines2 = [
    "QR da mesa → rota pública /m/{rid}/{mesa}",
    "Sem login: vê o cardápio (com fotos) e envia",
    "pedidos; mesa ocupada adiciona itens ao ativo"
]
for i, line in enumerate(lines2):
    add_text(svg, 80, 361 + i*20, line, 12.5, "400", COL["clientes_text"])

# Box 3: Impressora
bx3_x, bx3_y = 66, 426
bx3_w, bx3_h = 368, 76
add_rect(svg, bx3_x, bx3_y, bx3_w, bx3_h, 8, "#fff", COL["clientes_stroke"])
add_text(svg, 80, 448, "🖨️ Impressora térmica ESC/POS", 14, "700", COL["clientes_title"])
lines3 = [
    "Bluetooth LE pareada no dispositivo que imprime",
    "comanda no KDS · recibo ao quitar pagamento"
]
for i, line in enumerate(lines3):
    add_text(svg, 80, 469 + i*20, line, 12.5, "400", COL["clientes_text"])

# ============ COLUNA 2: NUVEM ============
col2_x, col2_y = 520, 100
col2_w, col2_h = 450, 380
add_rect(svg, col2_x, col2_y, col2_w, 38, 10, COL["nuvem_bg"])
add_text(svg, 536, 125, "NUVEM — ENTREGA + API", 15, "700", "#fff")
add_rect(svg, col2_x, col2_y+38, col2_w, col2_h, 10, COL["nuvem_box"], COL["nuvem_stroke"])

# Box 1: Firebase Hosting
bh_x, bh_y = 536, 154
bh_w, bh_h = 418, 118
add_rect(svg, bh_x, bh_y, bh_w, bh_h, 8, "#fff", COL["nuvem_stroke"])
add_text(svg, 550, 176, "Firebase Hosting (Spark)", 14, "700", COL["nuvem_title"])
lines_bh = [
    "pdv-lanchonete-1fa79.web.app — SPA estática",
    "chunks JS lazy (React.lazy) · manifest PWA · sw.js",
    "SW workbox: NetworkFirst GET /api/* (24h)",
    "SEM rewrite /api (exigiria Blaze) → URL direta"
]
for i, line in enumerate(lines_bh):
    add_text(svg, 550, 197 + i*20, line, 12.5, "400", COL["nuvem_text"])

# Box 2: Render API
br_x, br_y = 536, 288
br_w, br_h = 418, 214
add_rect(svg, br_x, br_y, br_w, br_h, 8, "#fff", COL["nuvem_stroke"])
add_text(svg, 550, 310, "Render free tier — API FastAPI", 14, "700", COL["nuvem_title"])
add_text(svg, 550, 330, "https://pdv-lanchonete-dwiw.onrender.com", 12, "400", COL["nuvem_text"], font=COL["mono"])
lines_br = [
    "uvicorn app.main:app · 18 routers em /api · GET+HEAD /health",
    "envs: FIREBASE_SERVICE_ACCOUNT_JSON · CORS_ORIGINS",
    "verify_id_token + guards por papel (admin/gerente/…)",
    "@transactional: mesa · caixa · estoque · onboarding",
    "cozinha BULK (baixa agregada) · preços do servidor",
    "público: rate limit 12/min/IP + gate cardápioDigitalAtivo"
]
for i, line in enumerate(lines_br):
    add_text(svg, 550, 351 + i*20, line, 12.5, "400", COL["nuvem_text"])
add_text(svg, 550, 478, "⚠️ free tier dorme após ~15 min — cold start 30–60s", 11.5, "600", "#b45309")

# ============ COLUNA 3: FIREBASE ============
col3_x, col3_y = 1040, 100
col3_w, col3_h = 430, 380
add_rect(svg, col3_x, col3_y, col3_w, 38, 10, COL["firebase_bg"])
add_text(svg, 1056, 125, "FIREBASE — projeto pdv-lanchonete-1fa79", 15, "700", "#fff")
add_rect(svg, col3_x, col3_y+38, col3_w, col3_h, 10, COL["firebase_box"], COL["firebase_stroke"])

# Box 1: Firebase Auth
fa_x, fa_y = 1056, 154
fa_w, fa_h = 398, 112
add_rect(svg, fa_x, fa_y, fa_w, fa_h, 8, "#fff", COL["firebase_stroke"])
add_text(svg, 1070, 176, "Firebase Auth", 14, "700", COL["firebase_title"])
lines_fa = [
    "Contas e-mail/senha · ID token ~1h com claims:",
    "{restaurantId, papel}",
    "claims só valem no PRÓXIMO token (refresh forçado)",
    "Admin: set_custom_user_claims (onboarding/usuários)"
]
for i, line in enumerate(lines_fa):
    fs = 11.5 if i == 1 else 12.5
    add_text(svg, 1070 if i != 1 else 1084, 197 + i*20, line, fs, "400", COL["firebase_text"], font=COL["mono"] if i == 1 else None)

# Box 2: Firestore
fs_x, fs_y = 1056, 280
fs_w, fs_h = 398, 148
add_rect(svg, fs_x, fs_y, fs_w, fs_h, 8, "#fff", COL["firebase_stroke"])
add_text(svg, 1070, 302, "Firestore", 14, "700", COL["firebase_title"])
lines_fs = [
    "restaurantes/{rid}/data/{colecao}/items/{id}",
    "+ doc único data/configuracoes",
    "tenant: pedidos, produtos, mesas, caixa, estoque,",
    "financeiro, usuarios, imagens/items/{produtoId}",
    "top-level: onboarding/{uid} · sistema/global.donoUids",
    "convites/{token} — provisionamento por convite"
]
for i, line in enumerate(lines_fs):
    add_text(svg, 1070 if i < 2 else 1084, 322 + i*18, line, 12.5 if i < 2 else 11.5, "400", COL["firebase_text"], font=COL["mono"] if i < 2 else None)

# Box 3: firestore.rules
fr_x, fr_y = 1056, 442
fr_w, fr_h = 398, 60
add_rect(svg, fr_x, fr_y, fr_w, fr_h, 8, COL["warning_bg"], COL["warning_stroke"])
add_text(svg, 1070, 463, "firestore.rules (publicadas)", 13, "700", COL["warning_text"])
add_text(svg, 1070, 483, "cliente acessa SÓ o próprio tenant; sistema/ e convites/ deny-all", 12, "400", "#7f1d1d")

# ============ SETAS COL1 -> COL2 ============
# Seta 1: Navegador -> Firebase Hosting
add_line(svg, 450, 195, 516, 195, COL["arrow_blue"], 2, marker="ahBlue")
add_circle(svg, 483, 181, 11, COL["circle_bg"])
add_text(svg, 483, 185, "1", 11, "700", COL["circle_text"], "middle")
add_text(svg, 456, 168, "HTTPS GET", 11, "600", COL["arrow_blue"])

# Seta 3: Navegador -> API (/api/*)
add_line(svg, 450, 352, 516, 352, COL["arrow_dark"], 2.5, marker="ahDark")
add_circle(svg, 483, 338, 11, COL["circle_bg"])
add_text(svg, 483, 342, "3", 11, "700", COL["circle_text"], "middle")
add_text(svg, 452, 326, "/api/* + Bearer", 11, "600", COL["arrow_dark"])

# Seta 4: Celular -> API (públicas)
add_line(svg, 450, 408, 516, 432, COL["arrow_dark"], 2, "6 4", "ahDark")
add_circle(svg, 483, 431, 11, COL["circle_bg"])
add_text(svg, 483, 435, "4", 11, "700", COL["circle_text"], "middle")
add_text(svg, 448, 462, "públicas, sem token", 11, "600", COL["arrow_dark"])

# ============ SETAS COL2 -> COL3 ============
# Seta 5: API -> Firebase Auth
add_line(svg, 970, 205, 1036, 205, COL["arrow_green"], 2, marker="ahGreen")
add_circle(svg, 1003, 191, 11, COL["circle_bg"])
add_text(svg, 1003, 195, "5", 11, "700", COL["circle_text"], "middle")
add_text(svg, 972, 178, "verify_id_token", 11, "600", "#15803d")

# Seta 6: API -> Firestore
add_line(svg, 970, 395, 1036, 395, COL["arrow_green"], 2.5, marker="ahGreen")
add_circle(svg, 1003, 381, 11, COL["circle_bg"])
add_text(svg, 1003, 385, "6", 11, "700", COL["circle_text"], "middle")
add_text(svg, 968, 364, "Admin SDK gRPC", 11, "600", "#15803d")

# ============ SETAS CURVAS (topo) ============
# Seta 2: Navegador -> Firebase Auth (login direto)
add_path(svg, "M 250 138 L 250 92 L 1254 92 L 1254 150", COL["arrow_red"], 2, "7 5", "ahRed")
add_circle(svg, 300, 92, 11, COL["circle_bg"])
add_text(svg, 300, 96, "2", 11, "700", COL["circle_text"], "middle")
add_text(svg, 318, 86, "login SDK direto → ID token", 11, "600", COL["arrow_red"])

# Seta 7: Navegador -> Firestore (onSnapshot)
add_path(svg, "M 330 138 L 330 78 L 1420 78 L 1420 276", COL["arrow_red"], 2, "3 4", "ahRed")
add_circle(svg, 1210, 78, 11, COL["circle_bg"])
add_text(svg, 1210, 82, "7", 11, "700", COL["circle_text"], "middle")
add_text(svg, 1228, 72, "onSnapshot sob rules (fallback: polling)", 11, "600", COL["arrow_red"])

# ============ FAIXA DEVOPS ============
dev_y = 560
add_rect(svg, 50, dev_y, 1600, 38, 10, COL["devops_bg"])
add_text(svg, 66, dev_y+25, "OPERAÇÃO — CI/CD E MONITORAMENTO", 15, "700", "#fff")
add_rect(svg, 50, dev_y+38, 1600, 158, 10, COL["devops_box"], COL["devops_stroke"])

# DevOps Box 1: GitHub
d1_x, d1_y = 66, 614
d1_w, d1_h = 496, 128
add_rect(svg, d1_x, d1_y, d1_w, d1_h, 8, "#fff", COL["devops_stroke"])
add_circle(svg, 90, 636, 11, COL["circle_bg"])
add_text(svg, 90, 640, "9", 11, "700", COL["circle_text"], "middle")
add_text(svg, 110, 640, "GitHub repo (privado)", 14, "700", COL["devops_title"])
lines_d1 = [
    "github.com/gabrielabrahaodev/pdv-lanchonete",
    "push em master → auto-deploy da Render",
    "requirements.txt com PIN EXATO do stack GCP",
    "(bug 12: drift derrubou a produção uma vez)"
]
for i, line in enumerate(lines_d1):
    add_text(svg, 82, 663 + i*20, line, 12.5, "400", COL["devops_text"], font=COL["mono"] if i == 0 else None)

# DevOps Box 2: GitHub Actions CI
d2_x, d2_y = 578, 614
d2_w, d2_h = 500, 128
add_rect(svg, d2_x, d2_y, d2_w, d2_h, 8, "#fff", COL["devops_stroke"])
add_circle(svg, 602, 636, 11, COL["circle_bg"])
add_text(svg, 602, 640, "10", 11, "700", COL["circle_text"], "middle")
add_text(svg, 622, 640, "GitHub Actions — ci.yml", 14, "700", COL["devops_title"])
lines_d2 = [
    "todo push/PR: pytest 23 + tsc + build frontend",
    "Regra de fluxo: validar LOCALHOST antes de",
    "qualquer deploy (suíte E2E 52+13 passos)"
]
for i, line in enumerate(lines_d2):
    add_text(svg, 594, 663 + i*20, line, 12.5, "400", COL["devops_text"])


# DevOps Box 3: UptimeRobot
d3_x, d3_y = 1094, 614
d3_w, d3_h = 540, 128
add_rect(svg, d3_x, d3_y, d3_w, d3_h, 8, "#fff", COL["devops_stroke"])
add_circle(svg, 1118, 636, 11, COL["circle_bg"])
add_text(svg, 1118, 640, "12", 11, "700", COL["circle_text"], "middle")
add_text(svg, 1138, 640, "UptimeRobot (grátis)", 14, "700", COL["devops_title"])
lines_d3 = [
    "HEAD /health a cada 10 min — mantém a",
    "instância da Render aquecida (mitiga o sleep).",
    "⚠️ /health é estático: smoke pós-deploy deve",
    "sondar endpoint que LEIA Firestore (cardápio)."
]
for i, line in enumerate(lines_d3):
    add_text(svg, 1110, 663 + i*20, line, 12.5, "400", COL["devops_text"])

# Stubs verticais faixa devops
add_line(svg, 314, 556, 314, 522, COL["arrow_purple"], 2, marker="ahPurple")
add_line(svg, 828, 522, 828, 556, COL["arrow_purple"], 2, "5 4", "ahPurple")
add_line(svg, 1364, 556, 1364, 522, COL["arrow_purple"], 2, marker="ahPurple")

# ============ LEGENDA ============
leg_y = 812
add_text(svg, 50, leg_y, "INTEGRAÇÕES — O QUE TRAFEGA ENTRE CADA PARTE", 17, "700", COL["title"])
add_line(svg, 430, leg_y-5, 1650, leg_y-5, "#cbd5e1", 1)

# Coluna 1 da legenda
leg1_x = 80
leg1_start = 848
legend_items_1 = [
    ("1", "Navegador → Firebase Hosting", [
        "HTTPS GET dos estáticos: index.html, chunks JS",
        "(code-splitting), CSS, ícones e manifest PWA, sw.js.",
        "Depois o Service Worker serve do cache e busca",
        "atualizações em background (autoUpdate)."
    ]),
    ("2", "Navegador ↔ Firebase Auth", [
        "signInWithEmailAndPassword → ID token JWT (~1h)",
        "com claims {restaurantId, papel}. SDK renova",
        "sozinho; após onboarding/troca de papel o app",
        "força getIdToken(true) — claims valem no próximo."
    ]),
    ("3", "Navegador → API (Render)", [
        "REST /api/* por HTTPS: Authorization: Bearer",
        "<ID token>; JSON camelCase nos dois sentidos;",
        "URL base = VITE_API_URL embutida NO BUILD +",
        "CORS whitelist na API. Fluxos críticos usam 1",
        "chamada bulk (nunca N mutações paralelas)."
    ]),
    ("5", "API → Firebase Auth (Admin)", [
        "verify_id_token em TODA requisição autenticada",
        "(extrai uid + claims); set_custom_user_claims no",
        "onboarding e no CRUD de usuários. Credencial =",
        "env FIREBASE_SERVICE_ACCOUNT_JSON (segredo)."
    ]),
    ("7", "Navegador → Firestore (leitura direta)", [
        "onSnapshot sob firestore.rules (claim restaurantId",
        "== rid): invalida caches react-query em tempo real.",
        "Offline/regra ausente = só warning; polling assume."
    ]),
]

y = leg1_start
for num, title, lines in legend_items_1:
    add_circle(svg, 61, y+4, 11, COL["circle_bg"])
    add_text(svg, 61, y+8, num, 11, "700", COL["circle_text"], "middle")
    add_text(svg, leg1_x, y, title, 13, "700", COL["title"])
    for i, line in enumerate(lines):
        add_text(svg, leg1_x, y+20 + i*18, line, 12, "400", COL["firebase_text"])
    y += 20 + len(lines)*18 + 18

# Coluna 2 da legenda
leg2_x = 630
leg2_start = 848
legend_items_2 = [
    ("4", "Celular do cliente → API (público)", [
        "SEM token: GET cardápio (categorias+produtos",
        "ativos, payload enxuto) · GET imagens/{id} (bytes",
        "JPEG/PNG, cache 1h, FORA do rate limit de propósito)",
        "· POST pedido na mesa (1–30 itens, obs ≤200 chars,",
        "preço resolvido no servidor; rate limit 12/min/IP → 429)."
    ]),
    ("6", "API → Firestore (Admin SDK gRPC)", [
        "Todo dado do tenant trafega aqui: CRUD + transações",
        "(@transactional) em mesa, caixa, estoque, onboarding",
        "e consumo de convite. Regra de ouro: leitura 100%",
        "antes de escrita 100% (ReadAfterWriteError). Baixa de",
        "ingredientes agregada numa única transação por cartão."
    ]),
    ("8", "Navegador ↔ Impressora (local)", [
        "Web Bluetooth GATT: payload ESC/POS (init, negrito,",
        "fonte grande, corte) em chunks de 180 bytes — comanda",
        "no KDS e recibo na quitação. Fallback janela print().",
        "Exige HTTPS; NÃO passa pela nuvem nem pela API."
    ]),
    ("9", "GitHub master → Render (deploy)", [
        "Push dispara build: pip install -r requirements.txt",
        "(pins exatos) + uvicorn app.main:app --port $PORT.",
        "Env vars injetadas no serviço (credencial + CORS).",
        "Rollback = redeploy do commit/tag anterior."
    ]),
]

y = leg2_start
for num, title, lines in legend_items_2:
    add_circle(svg, 611, y+4, 11, COL["circle_bg"])
    add_text(svg, 611, y+8, num, 11, "700", COL["circle_text"], "middle")
    add_text(svg, leg2_x, y, title, 13, "700", COL["title"])
    for i, line in enumerate(lines):
        add_text(svg, leg2_x, y+20 + i*18, line, 12, "400", COL["firebase_text"])
    y += 20 + len(lines)*18 + 18

# Coluna 3 da legenda
leg3_x = 1180
leg3_start = 848
legend_items_3 = [
    ("10", "GitHub Actions — CI (ci.yml)", [
        "Em todo push/PR roda pytest (23 testes de lógica",
        "pura) + tsc --noEmit + vite build. Gate de qualidade",
        "antes do merge; complementa (não substitui) a suíte",
        "E2E contra localhost antes de qualquer deploy."
    ]),
    ("12", "UptimeRobot → API", [
        "HEAD /health a cada 10 min (aceita GET e HEAD).",
        "Objetivo: manter a instância free tier desperta para o",
        "primeiro atendimento do dia não esperar cold start.",
        "Limitação: /health é estático — não prova que o",
        "Firestore responde (bugs 7 e 12 tiveram health ok)."
    ]),
]

y = leg3_start
for num, title, lines in legend_items_3:
    add_circle(svg, 1161, y+4, 11, COL["circle_bg"])
    add_text(svg, 1161, y+8, num, 11, "700", COL["circle_text"], "middle")
    add_text(svg, leg3_x, y, title, 13, "700", COL["title"])
    for i, line in enumerate(lines):
        add_text(svg, leg3_x, y+20 + i*18, line, 12, "400", COL["firebase_text"])
    y += 20 + len(lines)*18 + 18

# Box: Fluxo completo de uma venda
fy = 1090
add_rect(svg, 1161, fy, 500, 180, 8, COL["legend_bg1"], COL["clientes_stroke"])
add_text(svg, 1177, fy+24, "Fluxo completo de uma venda (ordem real):", 13, "700", COL["clientes_title"])
venda_lines = [
    "1. Caixa abre o caixa (POST /caixa/abrir → ⑥ grava sessão)",
    "2. Garçom lança itens (③ → preço resolvido no servidor)",
    "3. Cozinha avança o cartão (③ bulk → ⑥ baixa agregada)",
    "4. Cliente acompanha pelo QR (④ cria/adiciona itens)",
    "5. Pagamento quita (③ → ⑥ credita sessão + libera mesa)",
    "6. Recibo sai na impressora (⑧) · 7. Fechamento confere",
    "totais · 8. Relatório/DRE refletem a venda (⑥ leitura)"
]
for i, line in enumerate(venda_lines):
    add_text(svg, 1177, fy+46 + i*20, line, 12, "400", COL["firebase_text"])

# Box: Segurança transversal
sy = 1286
add_rect(svg, 1161, sy, 500, 88, 8, COL["firebase_box"], COL["firebase_stroke"])
add_text(svg, 1177, sy+22, "Segurança transversal", 12.5, "700", "#92400e")
sec_lines = [
    "Isolamento por claim restaurantId na API E nas rules; segredo",
    "somente em env da Render (nunca no git); convites de uso único",
    "provisionam novos restaurantes (console /plataforma do dono)."
]
for i, line in enumerate(sec_lines):
    add_text(svg, 1177, sy+42 + i*18, line, 12, "400", "#92400e")

# Footer
add_text(svg, 850, 1384, "Estado em ago/2026 · detalhes operacionais em DEPLOY.md · modelo conceitual em docs/02-modelagem/diagrama-componentes.md", 11.5, "400", "#94a3b8", "middle")

# ============ SAVE ============
output = pretty_xml(svg)
with open("docs/arquitetura-producao-replica.svg", "w", encoding="utf-8") as f:
    f.write(output)

print("SVG gerado: docs/arquitetura-producao-replica.svg")
#!/usr/bin/env python3
"""Diagrama simplificado: PDV Lanchonete v2 — Arquitetura Produção"""

from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom import minidom

W, H = 1200, 800
BG = "#f8fafc"
FONT = "Segoe UI, Arial, sans-serif"

C = {
    "client": "#2563eb", "client_bg": "#eff6ff", "client_stroke": "#bfdbfe", "client_txt": "#1d4ed8",
    "cloud": "#ea580c", "cloud_bg": "#fff7ed", "cloud_stroke": "#fed7aa", "cloud_txt": "#c2410c",
    "fb": "#d97706", "fb_bg": "#fffbeb", "fb_stroke": "#fde68a", "fb_txt": "#b45309",
    "ops": "#7c3aed", "ops_bg": "#f5f3ff", "ops_stroke": "#ddd6fe", "ops_txt": "#6d28d9",
    "arrow_c": "#2563eb", "arrow_a": "#16a34a", "arrow_r": "#dc2626", "arrow_d": "#475569",
    "circle_bg": "#0f172a", "circle_fg": "#fff",
    "title": "#0f172a", "sub": "#475569", "muted": "#64748b",
    "prod_bg": "#dcfce7", "prod_stroke": "#16a34a", "prod_txt": "#166534",
    "warn_bg": "#fef2f2", "warn_stroke": "#fca5a5", "warn_txt": "#b91c1c",
    "white": "#fff", "line": "#cbd5e1",
}

def px(elem): return minidom.parseString(tostring(elem, "utf-8")).toprettyxml(indent="  ")

def _clean(a): return {k:v for k,v in a.items() if v is not None}

def R(p, x, y, w, h, rx, fill, stroke=None, **kw):
    a = {"x":str(x),"y":str(y),"width":str(w),"height":str(h),"rx":str(rx),"fill":fill}
    if stroke: a["stroke"]=stroke
    a.update(kw); return SubElement(p,"rect",_clean(a))

def T(p, x, y, txt, sz=13, wt="400", fc="#334155", anc="start", ff=None, **kw):
    a = {"x":str(x),"y":str(y),"font-size":str(sz),"font-weight":wt,"fill":fc,"text-anchor":anc,"font-family":ff or FONT}
    a.update(kw); t=SubElement(p,"text",_clean(a)); t.text=str(txt) if txt is not None else ""; return t

def L(p, x1,y1,x2,y2, stroke, w=2, dash=None, mk=None):
    a={"x1":str(x1),"y1":str(y1),"x2":str(x2),"y2":str(y2),"stroke":stroke,"stroke-width":str(w)}
    if dash: a["stroke-dasharray"]=dash
    if mk: a["marker-end"]=f"url(#{mk})"
    return SubElement(p,"line",_clean(a))

def P(p, d, stroke, w=2, dash=None, mk=None):
    a={"d":d,"fill":"none","stroke":stroke,"stroke-width":str(w)}
    if dash: a["stroke-dasharray"]=dash
    if mk: a["marker-end"]=f"url(#{mk})"
    return SubElement(p,"path",_clean(a))

def Cc(p, cx,cy,r,fill): return SubElement(p,"circle",_clean({"cx":str(cx),"cy":str(cy),"r":str(r),"fill":fill}))

def M(d, id, color):
    m=SubElement(d,"marker",{"id":id,"markerWidth":"8","markerHeight":"6","refX":"6","refY":"3","orient":"auto"})
    SubElement(m,"path",{"d":"M0,0 L7,3 L0,6 z","fill":color})

svg=Element("svg",{"xmlns":"http://www.w3.org/2000/svg","width":str(W),"height":str(H),"viewBox":f"0 0 {W} {H}","font-family":FONT})
d=SubElement(svg,"defs")
M(d,"ab",C["arrow_c"]); M(d,"ag",C["arrow_a"]); M(d,"ar",C["arrow_r"]); M(d,"ad",C["arrow_d"]); M(d,"ap",C["ops"])
R(svg,0,0,W,H,0,BG)

# Title
T(svg,W//2,36,"PDV Lanchonete v2 — Arquitetura Produção (Simplificado)",20,"700",C["title"],"middle")
T(svg,W//2,58,"Firebase Hosting + Render Free + Firestore Spark · R$ 0/mês",12,"400",C["sub"],"middle")
R(svg,1000,16,180,28,14,C["prod_bg"],C["prod_stroke"])
T(svg,1090,35,"✅ PRODUÇÃO",12,"600",C["prod_txt"],"middle")

# ===== 3 COLUNAS =====
cols = [
    ("CLIENTES", 40, C["client"], C["client_bg"], C["client_stroke"], C["client_txt"], [
        "💻 Operação (PWA)\nTablets/PCs · Caixa·Garçom·KDS\nReact-query + onSnapshot",
        "📱 Cliente QR\n/m/{rid}/{mesa} · Sem login\nCardápio + pedido",
        "🖨️ Impressora BT\nESC/POS · Web Bluetooth 18f0\nFallback: print()"
    ]),
    ("NUVEM", 420, C["cloud"], C["cloud_bg"], C["cloud_stroke"], C["cloud_txt"], [
        "🌐 Firebase Hosting\npdv-lanchonete-1fa79.web.app\nSPA + PWA + SW Workbox",
        "⚙️ Render API\npdv-lanchonete-dwiw.onrender.com\nFastAPI · 18 routers · /health",
        "🔒 Auth + Guards\nverify_id_token · roles\nadmin/gerente/caixa/cozinha"
    ]),
    ("FIREBASE", 820, C["fb"], C["fb_bg"], C["fb_stroke"], C["fb_txt"], [
        "🔐 Firebase Auth\nEmail/senha · Claims\n{restaurantId, papel}",
        "🔥 Firestore\nrestaurantes/{rid}/data/...\n6 transações @transactional",
        "📋 Rules publicadas\nIsolamento por claim\nconvites/ sistema/ deny-all"
    ])
]

for i, (title, x, hdr_c, box_bg, box_st, txt_c, boxes) in enumerate(cols):
    R(svg,x,90,340,36,8,hdr_c)
    T(svg,x+16,114,title,14,"700","#fff")
    R(svg,x,126,340,300,8,box_bg,box_st)
    for j, txt in enumerate(boxes):
        bx, by = x+12, 142+j*96
        R(svg,bx,by,316,84,6,C["white"],box_st)
        for k, line in enumerate(txt.split("\n")):
            T(svg,bx+10,by+18+k*16,line,11,"400" if k else "600", txt_c if k else hdr_c, font="Consolas, monospace" if "{" in line else None)

# Setas entre colunas
# 1: Navegador -> Hosting
L(svg,380,130,420,130,C["arrow_c"],2,mk="ab"); Cc(svg,400,120,9,C["circle_bg"]); T(svg,400,124,"1",10,"700",C["circle_fg"],"middle")
T(svg,380,118,"HTTPS GET",9,"600",C["arrow_c"])
# 2: Navegador -> API
L(svg,380,230,420,230,C["arrow_d"],2,mk="ad"); Cc(svg,400,220,9,C["circle_bg"]); T(svg,400,224,"2",10,"700",C["circle_fg"],"middle")
T(svg,376,218,"/api/* + Bearer",9,"600",C["arrow_d"])
# 3: Celular -> API público
L(svg,380,330,420,350,C["arrow_d"],1.5,"4 3", "ad"); Cc(svg,400,355,9,C["circle_bg"]); T(svg,400,359,"3",10,"700",C["circle_fg"],"middle")
T(svg,370,368,"público, sem token",9,"600",C["arrow_d"])
# 4: API -> Auth
L(svg,760,160,820,160,C["arrow_a"],2,mk="ag"); Cc(svg,790,150,9,C["circle_bg"]); T(svg,790,154,"4",10,"700",C["circle_fg"],"middle")
T(svg,760,148,"verify_id_token",9,"600","#15803d")
# 5: API -> Firestore
L(svg,760,330,820,330,C["arrow_a"],2,mk="ag"); Cc(svg,790,320,9,C["circle_bg"]); T(svg,790,324,"5",10,"700",C["circle_fg"],"middle")
T(svg,756,318,"Admin SDK gRPC",9,"600","#15803d")
# 6: Login direto Auth (curva topo)
P(svg,"M 200 90 L 200 50 L 1010 50 L 1010 146",C["arrow_r"],1.5,"5 4","ar")
Cc(svg,600,50,9,C["circle_bg"]); T(svg,600,54,"L",10,"700",C["circle_fg"],"middle")
T(svg,615,44,"login SDK",9,"600",C["arrow_r"])
# 7: onSnapshot Firestore (curva topo)
P(svg,"M 280 90 L 280 38 L 1100 38 L 1100 270",C["arrow_r"],1.5,"3 4","ar")
Cc(svg,900,38,9,C["circle_bg"]); T(svg,900,42,"S",10,"700",C["circle_fg"],"middle")
T(svg,915,32,"onSnapshot",9,"600",C["arrow_r"])

# ===== FAIXA DEVOPS =====
dy = 460
R(svg,40,dy,W-80,32,8,C["ops"])
T(svg,56,dy+22,"OPERAÇÃO — CI/CD & MONITORAMENTO",13,"700","#fff")
R(svg,40,dy+32,W-80,120,8,C["ops_bg"],C["ops_stroke"])

ops_boxes = [
    (56, "📦 GitHub Repo (privado)\npush master → auto-deploy Render\npins exatos: firebase-admin==7.5.0"),
    (456, "⚙️ GitHub Actions ci.yml\npytest 23 + tsc + build · Push/PR\nRegra: validar LOCAL antes de deploy"),
    (856, "📊 UptimeRobot\nHEAD /health 10 min · Mitiga cold start\n⚠️ /health estático — sondar cardápio")
]
for j, (ox, txt) in enumerate(ops_boxes):
    R(svg,ox,dy+48,340 if j<3 else 240,92,6,C["white"],C["ops_stroke"])
    for k, line in enumerate(txt.split("\n")):
        T(svg,ox+10,dy+68+k*16,line,10.5,"400" if k else "600", C["ops_txt"] if k else C["ops_txt"], font="Consolas, monospace" if "==" in line else None)

# Setas verticais para DevOps
L(svg,210,456,210,432,C["arrow_r"],1.5,mk="ar")
L(svg,600,432,600,456,C["arrow_r"],1.5,"4 3","ar")
L(svg,990,456,990,432,C["arrow_r"],1.5,mk="ar")

# ===== LEGENDA SIMPLES =====
ly = 620
T(svg,40,ly,"FLUXOS PRINCIPAIS",14,"700",C["title"])
L(svg,200,ly-5,W-40,ly-5,C["line"],1)

flows = [
    ("1", "Navegador → Hosting", "HTTPS GET estáticos + PWA + SW"),
    ("2", "Navegador → API", "/api/* · Bearer token · JSON camelCase · bulk calls"),
    ("3", "Celular → API Público", "/api/publico/* · Sem auth · Rate-limit 12/min · Gate cardapioDigitalAtivo"),
    ("4", "API → Auth (Admin)", "verify_id_token() em TODA req · set_custom_user_claims onboarding"),
    ("5", "API → Firestore", "Admin SDK gRPC · 6 @transactional · Read 100% before Write 100%"),
    ("L", "Login SDK → Auth", "signInWithEmailAndPassword → ID token JWT (~1h) · claims {rid, papel}"),
    ("S", "onSnapshot → Firestore", "Realtime sob rules · fallback polling · invalida react-query"),
    ("6", "Navegador ↔ Impressora", "Web Bluetooth GATT 18f0/2af1 · ESC/POS chunks · local only"),
    ("7", "GitHub → Render", "Push master → build (pins) → deploy · Rollback = redeploy commit"),
    ("8", "GitHub → Hosting", "firebase deploy --only hosting (após build com VITE_API_URL)"),
    ("9", "CI/CD", "ci.yml: pytest+tsc+build"),
    ("10", "UptimeRobot → API", "HEAD /health 10min · mantém instância quente · /health estático não prova Firestore"),
]

# Grid 2 colunas
for i, (num, title, desc) in enumerate(flows):
    col = i % 2
    row = i // 2
    fx = 50 + col * 570
    fy = ly + 20 + row * 28
    Cc(svg, fx+12, fy+2, 9, C["circle_bg"])
    T(svg, fx+12, fy+6, num, 9, "700", C["circle_fg"], "middle")
    T(svg, fx+28, fy, title, 11, "700", C["title"])
    T(svg, fx+28, fy+16, desc, 10, "400", C["muted"])

# Fluxo venda resumido
vy = ly + 20 + 6*28 + 10
R(svg, 50, vy, W-100, 80, 6, C["client_bg"], C["client_stroke"])
T(svg, 66, vy+18, "FLUXO VENDA:", 12, "700", C["client_txt"])
venda = "Abrir caixa → Lançar itens (preço servidor) → Cozinha bulk (baixa agregada) → Pagamento quita → Recibo BT → Fechamento confere → DRE reflete"
T(svg, 66, vy+36, venda, 10.5, "400", C["client_txt"])

# Segurança
sy = vy + 88
R(svg, 50, sy, W-100, 48, 6, C["fb_bg"], C["fb_stroke"])
T(svg, 66, sy+16, "SEGURANÇA:", 11, "700", C["warn_txt"])
T(svg, 66, sy+32, "Isolamento claim restaurantId na API E nas rules · Segredo só env Render (nunca git) · Convites uso único provisionam restaurantes (/plataforma dono)", 10, "400", C["warn_txt"])

# Footer
T(svg, W//2, H-16, "docs/AGENTS.md · docs/DEPLOY.md · Estado ago/2026", 10, "400", C["muted"], "middle")

# Save
with open("docs/arquitetura-producao-simple.svg", "w", encoding="utf-8") as f:
    f.write(px(svg))
print("OK: docs/arquitetura-producao-simple.svg")
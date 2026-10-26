# Ícones PDV

Fundo `#ea580c` e talheres brancos equivalentes ao cabeçalho do menu lateral
(`UtensilsCrossed`, Lucide). O SVG é a fonte vetorial; os PNGs são rasterizações
nos tamanhos indicados, sem recorte da captura de tela.

- `pdv.svg`: favicon vetorial e fonte dos ícones comuns.
- `pdv-192.png` e `pdv-512.png`: instalação PWA.
- `pdv-maskable.svg` e `pdv-maskable-512.png`: fundo sólido até as bordas;
  os talheres ficam dentro da área segura circular de 80% do tamanho.
- `apple-touch-icon.png`: 180 × 180 para tela inicial do iOS.
- `favicon-32.png` e `../favicon.ico`: alternativas de favicon.

O manifest usa `name` e `short_name` como `PDV`. Instalações antigas podem
continuar mostrando nome/ícone anteriores até o navegador atualizar os metadados;
se necessário, remover o atalho/app antigo e instalar novamente após o deploy.

## Licença do desenho dos talheres

Lucide, ISC License: https://lucide.dev/license

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

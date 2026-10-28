# Versão de produção e atualização do PWA

O NexoComanda usa `dist/version.json` emitido automaticamente pelo build Vite,
análogo ao marcador `web/version.json` do NexoSaúde. O valor é o SHA Git do
bundle publicado, ou `VITE_APP_VERSION` se explicitamente definido em CI.

O mesmo SHA é embutido como `__APP_VERSION__` no código compilado. O cliente
consulta `/version.json` com `cache: 'no-store'` e query única a cada minuto
(quando visível), ao retomar foco e ao abrir Configurações. Não consulta o
Firestore. Firebase Hosting aplica `Cache-Control: no-store` ao marcador e
`no-cache` ao index.html. O marcador não integra o precache Workbox.

Quando versões diferem, o usuário recebe aviso **Atualizar agora** / **Depois**.
Em Configurações há versão instalada, **Verificar atualizações** e
**Forçar atualização**. Confirmação é obrigatória: pode perder edições não salvas.

A atualização tenta verificar/ativar o service worker mais recente, apaga só
caches estáticos Workbox/Wiki reconstruíveis, preserva IndexedDB, Firebase Auth,
Firestore e localStorage, e navega com parâmetro de cache bust para buscar o
novo HTML/JS. Não limpa dados nem encerra a conta. Erros de rede não causam
recarregamento automático. A instalação PWA precisa ser homologada em dispositivo real.

O registro do SW usa estratégia `prompt`, não ativação automática, para não
interromper uma venda. O deploy de produção continua condicionado a testes
e autorização, e **não** é realizado por esta funcionalidade.

Como testar: build com commit conhecido, conferir `dist/version.json` e a
versão embutida; publicar outra versão em ambiente de homologação; observar
banner e recarga manual, inclusive em PWA instalado. Testar com formulário em
edição, offline, cache antigo e troca de conta. A versão remota nunca é prova
de prontidão do backend: manter validação de API antes de publicar alterações
incompatíveis.

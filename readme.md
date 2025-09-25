# Olha Foto Authentication Backend

Esta aplicação fornece uma API de autenticação em Node.js baseada em Express, persistindo dados em PostgreSQL e pronta para ser utilizada em conjunto com Hasura.

## Requisitos

- Node.js 18+ (para execução local fora de containers)
- Banco PostgreSQL acessível (a API espera apenas a `DATABASE_URL` configurada)
- Hasura CLI (opcional, apenas se for importar a pasta `metadata/` diretamente)

## Variáveis de Ambiente

| Variável | Descrição | Valor padrão |
| --- | --- | --- |
| `DATABASE_URL` | String de conexão completa do PostgreSQL. Obrigatória. | — |
| `PORT` | Porta HTTP exposta pela API. | `3000` |
| `HOST` | Interface de rede que a API deve escutar. | `0.0.0.0` |
| `JWT_SECRET` | Segredo utilizado para assinar tokens JWT. | `changeme` |
| `JWT_EXPIRATION` | Tempo de expiração do token de acesso. | `15m` |
| `REFRESH_TOKEN_TTL_DAYS` | Validade (em dias) do token de refresh. | `7` |
| `BCRYPT_SALT_ROUNDS` | Custo da criptografia das senhas. | `10` |
| `DEFAULT_ROLE` | Nome do papel padrão atribuído a novos usuários (`user`, `photographer` ou `admin`). | `user` |
| `DB_POOL_MAX` | Número máximo de conexões no pool do PostgreSQL. | `10` |
| `DB_IDLE_TIMEOUT` | Timeout (ms) para conexões ociosas no pool. | `30000` |
| `SKIP_DB_MIGRATIONS` | Se definido como valor diferente de `0`, pula as migrações no início do container Docker. | `0` |

## Instalação e Execução Local

```bash
cp .env.example .env # copie o arquivo de exemplo e ajuste as variáveis conforme o seu ambiente
npm install
npm run migrate      # aplica as migrações no banco apontado pela DATABASE_URL
npm run dev          # inicia a API em modo desenvolvimento
```

A API expõe um endpoint de verificação em `GET /health` que pode ser usado para validar se o serviço está de pé.

## Diagnóstico de Problemas

- Execute `npm run diagnose` para validar rapidamente a configuração da aplicação. O script verifica se o `HOST`/`PORT` permitem
  acessos externos, garante que a `DATABASE_URL` esteja definida corretamente e tenta abrir uma conexão real com o PostgreSQL
  (executando `SELECT NOW()`). Erros de conexão são exibidos imediatamente com o detalhe retornado pelo driver.
- Ao iniciar, o backend informa (sem expor credenciais) qual host/banco estão configurados em `DATABASE_URL`. Procure por logs no
  formato `[database] PostgreSQL connection configured (...)` para confirmar se a aplicação está apontando para o servidor
  esperado.
- Caso a aplicação encerre por exceções não tratadas ou rejeições de Promise, o log conterá entradas `[fatal]` seguidas do stack
  trace e, na sequência, um bloco `Shutdown diagnostics snapshot` com contexto do ambiente (host, variáveis relevantes, conexões
  de banco, etc.). Esse bloco ajuda a identificar se o processo recebeu um `SIGTERM` externo ou se algum erro interno causou a
  queda.

## Execução com Docker

```bash
docker build -t olha-foto-auth .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgres://usuario:senha@host:5432/banco" \
  -e JWT_SECRET="alterar" \
  olha-foto-auth
```

> Ao iniciar, o entrypoint do container tenta aplicar automaticamente as migrações (`scripts/run-migrations.js`). Caso falhem, o log exibirá
> o erro, mas a API continuará subindo normalmente. Se preferir pular essa etapa (por exemplo, em ambientes controlados por outra ferramenta
> de migrações), defina `SKIP_DB_MIGRATIONS=1`.

## Migrações de Banco

- As migrações SQL residem em `migrations/`.
- O script `npm run migrate` aplica todas as migrações pendentes.
- Para apenas verificar o status:

```bash
npm run migrate:status
```

As migrações incluem:

- `0001_create_auth_schema.sql`: cria as tabelas `users` (com a coluna `role` baseada no tipo enumerado `user_role`), `photographers`, `admins` e `refresh_tokens`, além da função que mantém `updated_at` sincronizado.

- `0002_create_event_schema.sql`: adiciona `event_categories`, `events`, `event_tags` e `event_highlights`, além de enums e índices auxiliares. A API não implementa endpoints para este domínio; a manipulação deve ser feita diretamente pelo Hasura utilizando essas tabelas.

## Endpoints Disponíveis

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/auth/register` (`/register`) | Cria um novo usuário, atribui o papel padrão e retorna tokens de acesso/refresh. |
| `POST` | `/auth/login` | Autentica um usuário existente retornando novos tokens. |
| `POST` | `/auth/refresh` | Rotaciona o token de refresh e devolve um novo par de tokens. |
| `POST` | `/auth/logout` | Revoga um token de refresh específico. |
| `GET` | `/auth/profile` | Retorna dados do usuário autenticado (requer cabeçalho `Authorization: Bearer <token>`). |

Todos os endpoints retornam respostas JSON. Em caso de erro, o corpo conterá `{ "error": "mensagem" }` e o HTTP status apropriado.

## Integração com Hasura

A pasta `metadata/` contém a configuração esperada pelo Hasura para refletir as tabelas criadas pela migração:

- Relacionamentos `users -> refresh_tokens`, `users -> photographers/admins` (via relações 1:1) e `refresh_tokens -> users`.
- Permissões básicas para o papel `user`, permitindo que ele enxergue apenas seus próprios dados e papel associado.

Para carregar a metadata em uma instância Hasura, utilize a CLI:

```bash
hasura metadata apply --endpoint <HASURA_URL> --admin-secret <SENHA> --project metadata
```

(Substitua `<HASURA_URL>` e `<SENHA>` conforme o ambiente.)

## Fluxo de Autenticação

1. **Registro**: cria o usuário, salva senha com bcrypt e grava o papel escolhido (padrão `DEFAULT_ROLE`) diretamente na tabela `users`.
2. **Login**: verifica senha, gera um JWT (`sub`, `email`, `role`, `roles`, `defaultRole`) compatível com Hasura e grava um token de refresh com hash SHA-256.
3. **Refresh**: valida o token de refresh ativo, rotaciona para um novo par e revoga o anterior.
4. **Logout**: revoga o token de refresh informado.

Os tokens de refresh são armazenados na tabela `refresh_tokens` com metadados de IP e `user-agent` para auditoria.

## Estrutura de Pastas

```
src/
  controllers/      # Camada HTTP
  services/         # Regras de negócio e acesso ao banco
  middleware/       # Middlewares Express (ex.: autenticação JWT)
  utils/            # Funções auxiliares (hash de senha, tokens)
  db/               # Pool de conexão com PostgreSQL
scripts/
  run-migrations.js # Runner simples para as migrações SQL
migrations/         # Arquivos .sql aplicados em ordem alfabética
metadata/           # Metadata do Hasura (versão 3)
```

## Licença

Projeto distribuído sob licença ISC.


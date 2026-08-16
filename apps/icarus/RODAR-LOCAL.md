# Rodar o Icarus no Mac

Ambiente de depuração. O bot da VM precisa estar **parado** — dois processos com o mesmo
token conectam os dois no Discord e ambos respondem ao mesmo comando.

## 1. Túnel do banco (uma vez por sessão)

O Postgres vive na VM e não tem porta publicada. O túnel alcança o container diretamente
pela rede interna do Docker:

```
ssh -f -N -L 15499:172.19.0.3:5432 -o HostName=147.15.78.182 oracle-vm
```

As mensagens de "Address already in use" são das portas do túnel do `oracle-vm up` que já
está aberto — não atrapalham.

Conferir: `nc -z 127.0.0.1 15499`

## 2. Ligar

Na raiz do monorepo:

```
npm run dev -w @bots/icarus
```

Recarrega sozinho a cada alteração no código — é esse o ganho em relação a reconstruir a
imagem na VM.

Painel: <http://localhost:8790> (sem túnel; é local)

## 3. Voltar para a VM

```
ssh oracle-vm 'cd ~/projects/discord-bots && docker compose start icarus'
```

## O que está desligado localmente, e por quê

| Item | Motivo |
|---|---|
| Whisper | Com a sessão sempre aberta quem transcreve é o Gemini; o Whisper é só reserva |
| Música (yt-dlp, deno, rclone) | Exige três binários a mais e não é o que estamos depurando |
| Ducking | O DJ está na VM, inalcançável daqui |

Tudo isso é controlado por variável vazia no `.env` — **nenhuma linha de código muda**
entre local e VM.

## Cuidado

O `.env` local tem o token do bot e a chave do Gemini. Ele está no `.gitignore`, mas
confira com `git check-ignore -v apps/icarus/.env` antes de commitar qualquer coisa.

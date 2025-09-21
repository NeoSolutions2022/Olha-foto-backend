#!/bin/sh

log() {
  printf '%s [entrypoint] %s\n' "$(date -Iseconds)" "$1"
}

child_pid=""

forward_signal() {
  signal="$1"
  log "Received signal ${signal}. Forwarding to child PID ${child_pid:-N/A}."

  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    kill -"$signal" "$child_pid" 2>/dev/null || kill "$child_pid" 2>/dev/null
  fi
}

trap 'forward_signal TERM' TERM
trap 'forward_signal INT' INT
trap 'forward_signal QUIT' QUIT

if [ $# -eq 0 ]; then
  set -- npm start
fi

log "Container PID $$ starting: $*"

if [ -f /proc/1/cmdline ]; then
  init_cmd=$(tr '\0' ' ' < /proc/1/cmdline)
  log "Init process command: ${init_cmd}"
fi

if command -v node >/dev/null 2>&1; then
  log "Node version: $(node --version)"
fi

"$@" &
child_pid=$!

log "Spawned child PID ${child_pid}. Waiting for it to exit."

wait_status=0
wait "$child_pid" || wait_status=$?

log "Child process exited with status ${wait_status}."
exit "$wait_status"

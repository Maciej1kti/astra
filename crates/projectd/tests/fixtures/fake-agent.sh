#!/bin/sh
# Test double for the Claude Code and Codex command lines that projectd starts.
# The first argument selects the role: "exec" is Codex, anything else is Claude.
# It reads all of stdin, then prints what the real provider prints for a run.
# A marker anywhere in the message selects the behaviour:
#   [[sleep N]] [[fail]] [[crash]] [[silent]] [[big]] [[env]] [[cli]]
#   [[markdown]] [[nested-error]] [[orphan]] [[escape]] [[stubborn]]
# One line per invocation is appended to ./.fake-agent.log; the stdin of the
# latest invocation is kept byte for byte in ./.fake-agent-stdin.

role=claude
if [ "${1:-}" = "exec" ]; then
    role=codex
fi

mode=new
session=
if [ "$role" = claude ]; then
    previous=
    for argument in "$@"; do
        if [ "$previous" = "--resume" ]; then
            mode=resumed
            session=$argument
        fi
        previous=$argument
    done
elif [ "${2:-}" = "resume" ]; then
    # exec resume <flags> <thread id> -
    mode=resumed
    before=
    last=
    for argument in "$@"; do
        before=$last
        last=$argument
    done
    session=$before
fi
if [ -z "$session" ]; then
    session=$(uuidgen | tr 'A-Z' 'a-z')
fi

cat >"$PWD/.fake-agent-stdin"
input=$(cat "$PWD/.fake-agent-stdin")
printf '%s %s pid=%s session=%s args=%s\n' "$role" "$mode" "$$" "$session" "$*" >>"$PWD/.fake-agent.log"

message=$input
case $input in
*'</astra-context>'*)
    message=$(printf '%s\n' "$input" | sed '1,/^<\/astra-context>$/d')
    ;;
esac

# Escape one line of text for the inside of a JSON string.
json_text() {
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' |
        awk '{ printf "%s%s", (NR > 1 ? "\\n" : ""), $0 }'
}

# Print the lines of a successful run: $1 is a JSON string body.
succeed() {
    if [ "$role" = claude ]; then
        printf '{"type":"system","subtype":"init","session_id":"%s","cwd":"%s","tools":[]}\n' "$session" "$(json_text "$PWD")"
        printf '{"type":"system","subtype":"hook_started","hook_name":"SessionStart"}\n'
        printf '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"working"}]}}\n'
        printf '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ok"}]}}\n'
        printf '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}\n'
        printf '{"type":"result","subtype":"success","is_error":false,"result":"%s","session_id":"%s"}\n' "$1" "$session"
        printf '{"type":"system","subtype":"hook_response","hook_name":"Stop"}\n'
    else
        printf '{"type":"thread.started","thread_id":"%s"}\n' "$session"
        printf '{"type":"turn.started"}\n'
        printf '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}\n'
        printf '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"%s"}}\n' "$1"
        printf '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}\n'
    fi
}

# Print the session line only: the provider started but never answered.
begin() {
    if [ "$role" = claude ]; then
        printf '{"type":"system","subtype":"init","session_id":"%s"}\n' "$session"
    else
        printf '{"type":"thread.started","thread_id":"%s"}\n' "$session"
    fi
}

case $message in
*'[[sleep '*)
    seconds=$(printf '%s\n' "$message" | sed -n 's/.*\[\[sleep \([0-9][0-9]*\)\]\].*/\1/p' | head -n 1)
    sleep "${seconds:-1}"
    succeed 'slept'
    ;;
*'[[nested-error]]'*)
    begin
    if [ "$role" = codex ]; then
        printf '{"type":"turn.failed","error":{"message":"{\\"type\\":\\"error\\",\\"status\\":400,\\"error\\":{\\"type\\":\\"invalid_request_error\\",\\"message\\":\\"The model is not supported\\"}}"}}\n'
    else
        printf '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"fake failure"}\n'
    fi
    exit 1
    ;;
*'[[fail]]'*)
    begin
    if [ "$role" = codex ]; then
        printf '{"type":"turn.failed","error":{"message":"fake failure"}}\n'
    else
        printf '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"fake failure"}\n'
    fi
    exit 1
    ;;
*'[[crash]]'*)
    echo 'not json'
    echo 'fake crash' >&2
    exit 3
    ;;
*'[[silent]]'*)
    begin
    exit 0
    ;;
*'[[big]]'*)
    succeed "$(head -c 70000 /dev/zero | tr '\0' 'a')"
    ;;
*'[[env]]'*)
    if command -v projectctl >/dev/null 2>&1; then
        found=yes
    else
        found=no
    fi
    if [ -n "${ASTRA_SOCKET:-}" ]; then
        socket=set
    else
        socket=unset
    fi
    succeed "$(json_text "cwd=$PWD user=${ASTRA_USER:-unset} socket=$socket projectctl=$found args=$*")"
    ;;
*'[[cli]]'*)
    projectctl projects >/dev/null 2>&1
    code=$?
    succeed "projects exit $code"
    ;;
*'[[stubborn]]'*)
    # Ignores SIGTERM, so only SIGKILL ends it.
    trap '' TERM
    while :; do
        sleep 1
    done
    ;;
*'[[orphan]]'*)
    # A descendant in the agent's own process group that outlives it and keeps
    # the output pipes open; its pid is left in ./.fake-agent-orphan.
    sleep 60 &
    echo $! >"$PWD/.fake-agent-orphan"
    succeed 'orphaned'
    ;;
*'[[escape]]'*)
    # The same, but in a process group of its own, out of reach of the daemon's
    # group signals; its pid is left in ./.fake-agent-escaped.
    (
        set -m
        sleep 60 &
        echo $! >"$PWD/.fake-agent-escaped"
    )
    succeed 'escaped'
    ;;
*'[[markdown]]'*)
    succeed '**bold** and a list:\n\n- one\n- two\n\n[link](https://example.com) ![img](https://example.com/x.png) <script>alert(1)</script>'
    ;;
*)
    last=$(printf '%s\n' "$message" | sed '/^[[:space:]]*$/d' | tail -n 1 | tr -cd 'A-Za-z0-9 .-')
    succeed "fake $role $mode: $last"
    ;;
esac

#!/bin/sh
# A stand-in for the GitHub CLI. It is copied into a test's own directory and
# keeps its state beside itself: remotes/<owner>/<name>.git are the account's
# repositories, `offline` and `signed-out` are switches, `log` records calls.
state=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
echo "$*" >> "$state/log"
if [ "$1 $2" = "auth git-credential" ]; then
    exit 0
fi
if [ -e "$state/offline" ]; then
    echo "error connecting to api.github.com" >&2
    exit 1
fi
if [ -e "$state/signed-out" ]; then
    echo "To get started with GitHub CLI, please run:  gh auth login" >&2
    exit 4
fi
case "$1 $2" in
"api user")
    echo octo
    ;;
"api repos/"*)
    if [ -d "$state/remotes/${2#repos/}.git" ]; then
        echo 1
    else
        echo "gh: Not Found (HTTP 404)" >&2
        exit 1
    fi
    ;;
"repo create")
    if [ "$4" != "--private" ] || [ $# -ne 4 ]; then
        echo "unexpected arguments: $*" >&2
        exit 2
    fi
    if [ -d "$state/remotes/$3.git" ]; then
        echo "GraphQL: Name already exists on this account (createRepository)" >&2
        exit 1
    fi
    git init --bare -q "$state/remotes/$3.git" || exit 1
    echo "https://github.com/$3"
    ;;
*)
    echo "unexpected command: $*" >&2
    exit 2
    ;;
esac

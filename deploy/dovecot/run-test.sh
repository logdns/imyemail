#!/bin/bash
set -euo pipefail

source_dir="$(cat /dovecot-source-dir)"
# Upstream's top-level check-local removes .test before running executables.
# Create the link here, after cleanup. -T prevents a concurrent invocation
# from creating a link inside an existing directory; only an identical link
# is accepted if another test won the creation race.
if ! ln -sT /test-work "$source_dir/.test" 2>/dev/null; then
  test -L "$source_dir/.test"
  test "$(readlink "$source_dir/.test")" = /test-work
fi
test "$(stat -f -c %T "$source_dir/.test/")" = tmpfs

test_command=("$@")
if [[ ${1##*/} == test-cpu-limit ]]; then
  # Only the accounting stress test needs fixed CPU scheduling. Network
  # concurrency fixtures must retain the runner's normal processor access.
  test_cpu="$(awk '/^Cpus_allowed_list:/ { split($2, cpus, /[-,]/); print cpus[1] }' /proc/self/status)"
  test -n "$test_cpu"
  test_command=(taskset -c "$test_cpu" "$@")
  # This fixture measures CPU time, not elapsed time. Capture kernel counters
  # to distinguish a slow system-time workload from a stuck resource limit.
  # It has no child fixtures, so foreground mode can reap it after SIGKILL
  # without killing the timeout supervisor and losing CPU usage accounting.
  # Native shared-runner evidence shows continued progress through 7/9 cases
  # at 300s, with delayed RLIMIT_CPU delivery despite increasing rusage.
  # Allow this stress fixture 15 minutes; all original assertions still run.
  timeout --foreground --kill-after=10s 900s stdbuf -oL -eL "${test_command[@]}" &
  timeout_pid=$!
  (
    while kill -0 "$timeout_pid" 2>/dev/null; do
      for test_pid in $(cat "/proc/$timeout_pid/task/$timeout_pid/children" 2>/dev/null); do
        if [[ -r /proc/$test_pid/stat ]]; then
          awk '{ sub(/^.*\) /, ""); printf "cpu-limit sample: state=%s user_ticks=%s system_ticks=%s\n", $1, $12, $13 }' "/proc/$test_pid/stat"
          awk '/Max cpu time/ { print }' "/proc/$test_pid/limits"
        fi
      done
      sleep 30
    done
  ) &
  monitor_pid=$!
  test_status=0
  time wait "$timeout_pid" || test_status=$?
  kill "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true
  exit "$test_status"
fi

# Any failed or timed-out executable remains a failed Automake test.
time timeout --kill-after=10s 300s stdbuf -oL -eL "${test_command[@]}"

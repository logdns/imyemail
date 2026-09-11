#!/bin/bash
set -euo pipefail

test_command=("$@")
if [[ ${1##*/} == test-cpu-limit ]]; then
  # Only the accounting stress test needs fixed CPU scheduling. Network
  # concurrency fixtures must retain the runner's normal processor access.
  test_cpu="$(awk '/^Cpus_allowed_list:/ { split($2, cpus, /[-,]/); print cpus[1] }' /proc/self/status)"
  test -n "$test_cpu"
  test_command=(taskset -c "$test_cpu" "$@")
fi

# Keep timing and timeout diagnostics outside the timeout's process group.
# Any failed or timed-out executable remains a failed Automake test.
time timeout --kill-after=10s 300s stdbuf -oL -eL "${test_command[@]}"

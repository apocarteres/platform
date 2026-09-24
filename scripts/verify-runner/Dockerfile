# CORE-OPS-088: версии инструментов ядра приходят из mise.toml командой
# mise install внутри контейнера; образ несёт только mise и системное.
FROM debian:bookworm-slim

ARG MISE_VERSION=2026.6.14
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        gnupg \
        curl \
        git \
        pkg-config \
        tar \
        unzip \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN host_arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
    && case "$host_arch" in \
        amd64) mise_arch=x64 ;; \
        arm64) mise_arch=arm64 ;; \
        *) echo "verify runner does not support host architecture $host_arch" >&2; exit 2 ;; \
       esac \
    && curl --retry 5 --retry-delay 5 --retry-all-errors --connect-timeout 20 --max-time 300 -fsSL \
        "https://github.com/jdx/mise/releases/download/v${MISE_VERSION}/mise-v${MISE_VERSION}-linux-${mise_arch}.tar.gz" \
        -o /tmp/mise.tgz \
    && tar -C /usr/local/bin --strip-components=2 -xzf /tmp/mise.tgz mise/bin/mise \
    && rm -f /tmp/mise.tgz \
    && mise --version

WORKDIR /work/src

CMD ["sleep", "infinity"]

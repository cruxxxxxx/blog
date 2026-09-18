#!/usr/bin/env bash
#
# Compress a video with ffmpeg, upload it and a poster frame to R2, print the
# public URL.
#
# Called by the Obsidian "Attachment Uploader" plugin: %s becomes the local file
# path, and the plugin takes the FIRST https:// line of stdout as the new link.
# Everything else must therefore go to stderr.
#
# Credentials are read at runtime from the Image Upload Toolkit config, so the
# two plugins stay on one bucket and no secret lives in this file.

set -euo pipefail

# Obsidian is launched from Finder, so the plugin's child_process.exec inherits
# a bare PATH without Homebrew. ffmpeg, aws and python3 all live there.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

VAULT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
R2_CONFIG="$VAULT_ROOT/.obsidian/plugins/image-upload-toolkit/data.json"

MAX_WIDTH=1280
CRF=26
AUDIO_BITRATE=128k

die() {
    echo "r2-media: $1" >&2
    exit 1
}

require_tools() {
    for tool in ffmpeg aws python3; do
        command -v "$tool" >/dev/null || die "$tool not found in PATH"
    done
}

load_r2_config() {
    [ -f "$R2_CONFIG" ] || die "no R2 config at $R2_CONFIG"
    eval "$(python3 - "$R2_CONFIG" <<'PY'
import json, shlex, sys

setting = json.load(open(sys.argv[1]))["r2Setting"]
fields = {
    "R2_KEY": setting["accessKeyId"],
    "R2_SECRET": setting["secretAccessKey"],
    "R2_ENDPOINT": setting["endpoint"],
    "R2_BUCKET": setting["bucketName"],
    "R2_PUBLIC": setting["customDomainName"].rstrip("/"),
}
for name, value in fields.items():
    if not value:
        raise SystemExit(f"r2Setting.{name} is empty")
    print(f"{name}={shlex.quote(value)}")
PY
)"
}

slugify() {
    local stem
    stem="$(basename "$1")"
    stem="${stem%.*}"
    stem="$(printf '%s' "$stem" | tr '[:upper:]' '[:lower:]' | tr ' _' '--' | tr -cd 'a-z0-9-')"
    stem="$(printf '%s' "$stem" | sed -E 's/-+/-/g; s/^-//; s/-$//')"
    printf '%s' "${stem:-clip}"
}

compress_video() {
    local source="$1" target="$2"
    ffmpeg -nostdin -hide_banner -loglevel error -y -i "$source" \
        -vf "scale='min($MAX_WIDTH,iw)':-2" \
        -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p \
        -c:a aac -b:a "$AUDIO_BITRATE" \
        -movflags +faststart -map_metadata -1 \
        "$target" >&2
}

extract_poster() {
    local source="$1" target="$2"
    ffmpeg -nostdin -hide_banner -loglevel error -y -ss 0.5 -i "$source" \
        -frames:v 1 -c:v libwebp -quality 72 "$target" >&2
}

upload() {
    local file="$1" key="$2" content_type="$3"
    AWS_ACCESS_KEY_ID="$R2_KEY" \
    AWS_SECRET_ACCESS_KEY="$R2_SECRET" \
    AWS_DEFAULT_REGION=auto \
    AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
        aws s3 cp "$file" "s3://$R2_BUCKET/$key" \
            --endpoint-url "$R2_ENDPOINT" \
            --content-type "$content_type" \
            --only-show-errors >&2
}

report_savings() {
    echo "r2-media: $(du -h "$1" | cut -f1) -> $(du -h "$2" | cut -f1)" >&2
}

main() {
    [ $# -eq 1 ] || die "usage: r2-media.sh <file>"
    local source="$1"
    [ -f "$source" ] || die "no such file: $source"

    require_tools
    load_r2_config

    local slug video poster digest prefix key poster_key
    # Global, and expanded when the trap is set: main() has returned by the
    # time EXIT fires, so a local would be out of scope under `set -u`.
    WORK_DIR="$(mktemp -d)"
    trap "rm -rf '$WORK_DIR'" EXIT

    slug="$(slugify "$source")"
    video="$WORK_DIR/$slug.mp4"
    poster="$WORK_DIR/$slug-poster.webp"

    compress_video "$source" "$video"
    extract_poster "$video" "$poster"
    report_savings "$source" "$video"

    # Content hash in the name: re-running on the same clip overwrites one key
    # instead of piling up copies, and two clips named IMG_1234 cannot collide.
    digest="$(shasum -a 256 "$video" | cut -c1-8)"
    prefix="blog/$(date +%Y)/$(date +%m)"
    key="$prefix/$slug-$digest.mp4"
    poster_key="$prefix/$slug-$digest-poster.webp"

    upload "$video" "$key" video/mp4
    upload "$poster" "$poster_key" image/webp

    echo "$R2_PUBLIC/$key"
}

main "$@"

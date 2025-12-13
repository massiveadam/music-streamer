#!/bin/bash
# Batch fix cover art for albums with release_mbid but no cover art
# Run from server directory

cd /home/adam/Documents/music-streamer/server
ART_DIR="./storage/art"

echo "=== Batch Cover Art Fix ==="
echo "Fetching cover art for albums with release_mbid but missing art..."

# Get all unique release_mbids that have tracks with has_art=0
sqlite3 library.db "
SELECT DISTINCT release_mbid 
FROM tracks 
WHERE has_art = 0 
  AND release_mbid IS NOT NULL 
  AND release_mbid != ''
" | while read -r mbid; do
    if [ -z "$mbid" ]; then continue; fi
    
    echo "Processing: $mbid"
    
    # Check if we already have the art
    if [ -f "$ART_DIR/${mbid}_front.jpg" ]; then
        echo "  -> Already have art, updating has_art flag"
        sqlite3 library.db "UPDATE tracks SET has_art = 1 WHERE release_mbid = '$mbid'"
        continue
    fi
    
    # Get release-group ID from MusicBrainz
    RGID=$(curl -s "https://musicbrainz.org/ws/2/release/$mbid?fmt=json&inc=release-groups" | jq -r '.["release-group"].id' 2>/dev/null)
    
    if [ -z "$RGID" ] || [ "$RGID" == "null" ]; then
        echo "  -> No release-group found, trying release art directly"
        # Try direct release art
        curl -sL "https://coverartarchive.org/release/$mbid/front" -o "$ART_DIR/${mbid}_front.jpg" 2>/dev/null
    else
        echo "  -> Found release-group: $RGID"
        # Try release-group art
        curl -sL "https://coverartarchive.org/release-group/$RGID/front" -o "$ART_DIR/${mbid}_front.jpg" 2>/dev/null
    fi
    
    # Verify download
    if [ -f "$ART_DIR/${mbid}_front.jpg" ] && [ -s "$ART_DIR/${mbid}_front.jpg" ]; then
        echo "  -> Downloaded cover art!"
        sqlite3 library.db "UPDATE tracks SET has_art = 1 WHERE release_mbid = '$mbid'"
        sqlite3 library.db "INSERT OR IGNORE INTO album_images (release_mbid, type, path, source) VALUES ('$mbid', 'front', '$(realpath $ART_DIR)/${mbid}_front.jpg', 'coverartarchive')"
    else
        echo "  -> No cover art available"
        rm -f "$ART_DIR/${mbid}_front.jpg" 2>/dev/null
    fi
    
    # Rate limit - 1 request per second for MusicBrainz
    sleep 1.5
done

echo ""
echo "=== Batch Fix Complete ==="
echo "Remaining albums without art:"
sqlite3 library.db "SELECT COUNT(DISTINCT release_mbid) FROM tracks WHERE has_art = 0 AND release_mbid IS NOT NULL AND release_mbid != ''"

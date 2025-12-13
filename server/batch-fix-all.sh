#!/bin/bash
# Comprehensive batch fix: cover art, descriptions (Wikipedia + Last.fm), and track art files

cd /home/adam/Documents/music-streamer/server
ART_DIR="./storage/art"

LASTFM_API_KEY=$(sqlite3 library.db "SELECT value FROM system_settings WHERE key = 'lastfm_api_key'" 2>/dev/null)

echo "=== Comprehensive Library Fix ==="
echo "Last.fm API: ${LASTFM_API_KEY:0:8}..."
echo ""

# Part 1: Fix cover art
echo "=== PART 1: Cover Art ==="
sqlite3 library.db "
SELECT DISTINCT release_mbid 
FROM tracks 
WHERE has_art = 0 
  AND release_mbid IS NOT NULL 
  AND release_mbid != ''
" | while read -r mbid; do
    if [ -z "$mbid" ]; then continue; fi
    
    if [ -f "$ART_DIR/${mbid}_front.jpg" ]; then
        sqlite3 library.db "UPDATE tracks SET has_art = 1 WHERE release_mbid = '$mbid'"
        echo "  [ART] $mbid - Updated has_art flag"
        continue
    fi
    
    # Get release-group
    RGID=$(curl -s "https://musicbrainz.org/ws/2/release/$mbid?fmt=json&inc=release-groups" | jq -r '.["release-group"].id' 2>/dev/null)
    
    if [ -n "$RGID" ] && [ "$RGID" != "null" ]; then
        curl -sL "https://coverartarchive.org/release-group/$RGID/front" -o "$ART_DIR/${mbid}_front.jpg" 2>/dev/null
    else
        curl -sL "https://coverartarchive.org/release/$mbid/front" -o "$ART_DIR/${mbid}_front.jpg" 2>/dev/null
    fi
    
    if [ -f "$ART_DIR/${mbid}_front.jpg" ] && [ -s "$ART_DIR/${mbid}_front.jpg" ]; then
        sqlite3 library.db "UPDATE tracks SET has_art = 1 WHERE release_mbid = '$mbid'"
        echo "  [ART] $mbid - Downloaded!"
    else
        rm -f "$ART_DIR/${mbid}_front.jpg" 2>/dev/null
    fi
    sleep 1
done

# Part 2: Create track art files from release art
echo ""
echo "=== PART 2: Track Art Files ==="
sqlite3 library.db "
SELECT t.id, t.release_mbid 
FROM tracks t 
WHERE t.has_art = 1 
  AND t.release_mbid IS NOT NULL 
  AND t.release_mbid != ''
" | while IFS='|' read -r track_id release_mbid; do
    if [ ! -f "$ART_DIR/${track_id}.jpg" ] && [ -f "$ART_DIR/${release_mbid}_front.jpg" ]; then
        cp "$ART_DIR/${release_mbid}_front.jpg" "$ART_DIR/${track_id}.jpg"
        echo "  [TRACK] Created ${track_id}.jpg"
    fi
done

# Part 3: Descriptions (Wikipedia + Last.fm fallback)
echo ""
echo "=== PART 3: Descriptions ==="
desc_count=0

sqlite3 library.db "
SELECT r.mbid, r.title, 
       (SELECT artist FROM tracks t WHERE t.release_mbid = r.mbid LIMIT 1)
FROM releases r
WHERE (r.description IS NULL OR r.description = '')
LIMIT 300
" | while IFS='|' read -r mbid title artist; do
    if [ -z "$mbid" ] || [ -z "$title" ] || [ -z "$artist" ]; then continue; fi
    
    ((desc_count++))
    
    # Try Wikipedia first
    clean_album=$(echo "$title" | sed 's/[^a-zA-Z0-9 ]//g' | tr ' ' '_')
    primary_artist=$(echo "$artist" | sed -E 's/ (Trio|Quartet|Quintet|Band|Orchestra|Ensemble|Group)$//' | tr ' ' '_')
    
    desc=""
    for pattern in "${clean_album}_(${primary_artist}_album)" "${clean_album}_(album)" "${clean_album}"; do
        response=$(curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/$pattern" 2>/dev/null)
        extract=$(echo "$response" | jq -r '.extract // empty' 2>/dev/null)
        type=$(echo "$response" | jq -r '.type // empty' 2>/dev/null)
        
        if [ -n "$extract" ] && [ "$type" != "disambiguation" ]; then
            desc="$extract"
            break
        fi
    done
    
    # Fallback to Last.fm
    if [ -z "$desc" ] && [ -n "$LASTFM_API_KEY" ]; then
        artist_enc=$(echo "$artist" | sed 's/ /%20/g')
        album_enc=$(echo "$title" | sed 's/ /%20/g')
        lfm_response=$(curl -s "http://ws.audioscrobbler.com/2.0/?method=album.getinfo&api_key=${LASTFM_API_KEY}&artist=${artist_enc}&album=${album_enc}&format=json" 2>/dev/null)
        desc=$(echo "$lfm_response" | jq -r '.album.wiki.summary // empty' 2>/dev/null | sed 's/<[^>]*>//g' | head -c 1000)
    fi
    
    if [ -n "$desc" ]; then
        escaped_desc=$(echo "$desc" | sed "s/'/''/g" | head -c 2000)
        sqlite3 library.db "UPDATE releases SET description = '$escaped_desc' WHERE mbid = '$mbid'"
        echo "  [DESC] $title - Found!"
    fi
    
    sleep 0.3
done

echo ""
echo "=== COMPLETE ==="
sqlite3 library.db "
SELECT 
    'Albums with art: ' || SUM(CASE WHEN has_art = 1 THEN 1 ELSE 0 END),
    'Albums without art: ' || SUM(CASE WHEN has_art = 0 THEN 1 ELSE 0 END)
FROM (SELECT DISTINCT album, artist, MAX(has_art) as has_art FROM tracks GROUP BY album, artist);
"
sqlite3 library.db "
SELECT 
    'Releases with description: ' || SUM(CASE WHEN description IS NOT NULL AND description != '' THEN 1 ELSE 0 END),
    'Releases without description: ' || SUM(CASE WHEN description IS NULL OR description = '' THEN 1 ELSE 0 END)
FROM releases;
"

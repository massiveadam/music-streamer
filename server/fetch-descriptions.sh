#!/bin/bash
# Targeted description enrichment for albums with release_mbid but no description
# Uses Wikipedia API with improved matching patterns

cd /home/adam/Documents/music-streamer/server

echo "=== Targeted Description Enrichment ==="
echo "Fetching Wikipedia descriptions for albums missing them..."

# Function to try Wikipedia patterns
fetch_wikipedia_desc() {
    local album="$1"
    local artist="$2"
    local mbid="$3"
    
    # Clean album name (remove special chars for Wikipedia URL)
    local clean_album=$(echo "$album" | sed 's/[^a-zA-Z0-9 ]//g' | sed 's/  */ /g' | sed 's/^ *//' | sed 's/ *$//')
    
    # Extract primary artist (remove Trio, Quartet, etc.)
    local primary_artist=$(echo "$artist" | sed -E 's/ (Trio|Quartet|Quintet|Sextet|Band|Orchestra|Ensemble|Group)$//')
    
    # Try patterns in order
    local patterns=(
        "${clean_album}_(${primary_artist// /_}_album)"
        "${clean_album}_(album)"
        "${clean_album}_(${artist// /_}_album)"
        "${clean_album// /_}"
    )
    
    for pattern in "${patterns[@]}"; do
        local encoded=$(echo "$pattern" | sed 's/ /_/g')
        local response=$(curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}" 2>/dev/null)
        local extract=$(echo "$response" | jq -r '.extract // empty' 2>/dev/null)
        local type=$(echo "$response" | jq -r '.type // empty' 2>/dev/null)
        
        if [ -n "$extract" ] && [ "$type" != "disambiguation" ]; then
            echo "$extract"
            return 0
        fi
    done
    
    return 1
}

count=0
success=0

sqlite3 library.db "
SELECT r.mbid, r.title, 
       (SELECT artist FROM tracks t WHERE t.release_mbid = r.mbid LIMIT 1)
FROM releases r
WHERE (r.description IS NULL OR r.description = '')
LIMIT 200
" | while IFS='|' read -r mbid title artist; do
    if [ -z "$mbid" ]; then continue; fi
    
    ((count++))
    echo "[$count] $title - $artist"
    
    desc=$(fetch_wikipedia_desc "$title" "$artist" "$mbid")
    
    if [ -n "$desc" ]; then
        # Escape single quotes for SQL
        escaped_desc=$(echo "$desc" | sed "s/'/''/g")
        sqlite3 library.db "UPDATE releases SET description = '$escaped_desc' WHERE mbid = '$mbid'"
        echo "  -> Found description!"
        ((success++))
    else
        echo "  -> No Wikipedia page found"
    fi
    
    # Rate limit
    sleep 0.5
done

echo ""
echo "=== Complete ==="
echo "Processed: $count albums"
echo "Found descriptions: $success"

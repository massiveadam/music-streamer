import axios from 'axios';

export interface WikipediaResult {
    bio: string;
    url: string;
}

/**
 * Fetch artist bio from Wikipedia
 */
export async function getArtistBio(artistName: string): Promise<WikipediaResult | null> {
    if (!artistName) return null;

    try {
        // First try direct page lookup for common artist page patterns
        const directTitles = [
            artistName,
            artistName + ' (musician)',
            artistName + ' (band)',
            artistName + ' (artist)',
            artistName + ' (singer)'
        ];

        for (const title of directTitles) {
            try {
                const contentRes = await axios.get('https://en.wikipedia.org/w/api.php', {
                    params: {
                        action: 'query',
                        titles: title,
                        prop: 'extracts',
                        exintro: false,
                        explaintext: true,
                        exsectionformat: 'plain',
                        format: 'json'
                    }
                });

                const pages = contentRes.data?.query?.pages;
                if (pages) {
                    const pageId = Object.keys(pages)[0];
                    if (pageId !== '-1' && pages[pageId].extract) {
                        let bio = pages[pageId].extract as string;
                        
                        // Filter out disambiguation pages and non-relevant content
                        if (bio.toLowerCase().includes('disambiguation') ||
                            bio.toLowerCase().includes('may refer to:')) {
                            continue; // Skip disambiguation pages
                        }
                        
                        // Limit to reasonable size and ensure it's substantive
                        if (bio.length > 200) {
                            if (bio.length > 2500) {
                                bio = bio.substring(0, 2500) + '...';
                            }
                            const wikiUrl = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
                            return { bio, url: wikiUrl };
                        }
                    }
                }
            } catch (e) {
                // Continue to next title if this one fails
                continue;
            }
        }

        // If direct lookup fails, try search with better terms
        const searchTerms = [
            `"${artistName}" musician`,
            `"${artistName}" band`,
            artistName
        ];

        for (const searchTerm of searchTerms) {
            try {
                const searchRes = await axios.get('https://en.wikipedia.org/w/api.php', {
                    params: {
                        action: 'query',
                        list: 'search',
                        srsearch: searchTerm,
                        srlimit: 5,
                        format: 'json',
                        utf8: 1
                    }
                });

                const searchData = searchRes.data?.query?.search;
                if (searchData && searchData.length > 0) {
                    // Look for the best match
                    for (const result of searchData) {
                        const title = result.title;
                        
                        // Skip disambiguation pages
                        if (title.toLowerCase().includes('disambiguation')) {
                            continue;
                        }

                        // Get content for this result
                        const contentRes = await axios.get('https://en.wikipedia.org/w/api.php', {
                            params: {
                                action: 'query',
                                titles: title,
                                prop: 'extracts',
                                exintro: false,
                                explaintext: true,
                                exsectionformat: 'plain',
                                format: 'json'
                            }
                        });

                        const pages = contentRes.data?.query?.pages;
                        if (pages) {
                            const pageId = Object.keys(pages)[0];
                            if (pageId !== '-1' && pages[pageId].extract) {
                                let bio = pages[pageId].extract as string;
                                
                                // Ensure it's a substantial bio about a person/band
                                if (bio.length > 200 &&
                                    (bio.toLowerCase().includes('musician') ||
                                     bio.toLowerCase().includes('singer') ||
                                     bio.toLowerCase().includes('band') ||
                                     bio.toLowerCase().includes('artist') ||
                                     bio.toLowerCase().includes('composer'))) {
                                    
                                    if (bio.length > 2500) {
                                        bio = bio.substring(0, 2500) + '...';
                                    }
                                    const wikiUrl = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(title.replace(/ /g, '_'));
                                    return { bio, url: wikiUrl };
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                // Continue to next search term
                continue;
            }
        }

    } catch (e) {
        console.error('Wikipedia fetch failed for ' + artistName + ':', (e as Error).message);
    }
    return null;
}

export default { getArtistBio };

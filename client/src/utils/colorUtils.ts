import ColorThief from 'colorthief';

export const extractColorFromImage = async (imageUrl: string): Promise<string | null> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        // Add cache busting to prevent CORS issues with cached images
        img.src = imageUrl + '?t=' + new Date().getTime();

        img.onload = () => {
            try {
                const colorThief = new ColorThief();
                const color = colorThief.getColor(img);
                // Convert [r, g, b] to hex
                const hex = '#' + color.map(x => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('');
                console.log(`[ColorThief] Extracted color: ${hex} from ${imageUrl}`);
                resolve(hex);
            } catch (error) {
                console.error('[ColorThief] Error extracting color:', error);
                resolve(null);
            }
        };

        img.onerror = (error) => {
            console.error('[ColorThief] Error loading image for color extraction:', error);
            resolve(null);
        };
    });
};

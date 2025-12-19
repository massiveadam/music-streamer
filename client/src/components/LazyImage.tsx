import React, { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
    src: string;
    alt: string;
    className?: string;
    placeholderColor?: string;
}

/**
 * LazyImage component with blur-up placeholder effect
 * 
 * Shows a colored blur placeholder while the image loads,
 * then fades in the actual image for a smooth transition.
 */
export const LazyImage: React.FC<LazyImageProps> = ({
    src,
    alt,
    className = '',
    placeholderColor = '#1a1a2e' // Default dark purple
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    // Reset state when src changes
    useEffect(() => {
        setIsLoaded(false);
        setHasError(false);
    }, [src]);

    // Check if image is already cached
    useEffect(() => {
        if (imgRef.current?.complete && imgRef.current?.naturalHeight > 0) {
            setIsLoaded(true);
        }
    }, []);

    return (
        <div
            className={`relative overflow-hidden ${className}`}
            style={{
                backgroundColor: placeholderColor,
            }}
        >
            {/* Blur placeholder */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 ${isLoaded ? 'opacity-0' : 'opacity-100'}`}
                style={{
                    backgroundColor: placeholderColor,
                    filter: 'blur(20px)',
                    transform: 'scale(1.1)', // Prevent blur edges from showing
                }}
            />

            {/* Shimmer animation while loading */}
            {!isLoaded && !hasError && (
                <div className="absolute inset-0 overflow-hidden">
                    <div
                        className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
                        style={{
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                        }}
                    />
                </div>
            )}

            {/* Actual image */}
            <img
                ref={imgRef}
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setIsLoaded(true)}
                onError={() => {
                    setHasError(true);
                    setIsLoaded(true);
                }}
            />

            {/* Error fallback */}
            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-app-surface">
                    <svg
                        className="w-8 h-8 text-app-text-muted"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                </div>
            )}
        </div>
    );
};

export default LazyImage;

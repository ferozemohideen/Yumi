'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  MapPin,
  Star,
  Clock,
  Phone,
  Globe,
  Navigation,
  X,
  Sparkles,
  Heart,
  Share2,
  ExternalLink,
  Loader2,
  ImageIcon,
  ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { loadGoogleMaps } from '@/lib/google-maps-loader';

declare global {
  interface Window {
    google: typeof google;
  }
}

type PlaceResult = {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: { location: google.maps.LatLng };
  rating?: number;
  price_level?: number;
  photos?: google.maps.places.PlacePhoto[];
  types?: string[];
  opening_hours?: google.maps.places.PlaceOpeningHours;
};

type PlaceDetails = PlaceResult & {
  formatted_phone_number?: string;
  website?: string;
  reviews?: google.maps.places.PlaceReview[];
  url?: string;
};

interface RestaurantMapProps {
  className?: string;
}

interface PreloadedRestaurant {
  place_id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  match_score?: number;
}

export function RestaurantMapClean({ className }: RestaurantMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [placesService, setPlacesService] = useState<google.maps.places.PlacesService | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [mapType, setMapType] = useState<'3d' | 'roadmap' | 'satellite'>('roadmap');
  const [visibleResults, setVisibleResults] = useState<PlaceResult[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showHours, setShowHours] = useState(false);
  const markersRef = useRef<any[]>([]);
  const [preloadedRestaurants, setPreloadedRestaurants] = useState<PreloadedRestaurant[]>([]);
  const [averageDistances, setAverageDistances] = useState<{ walking: string; driving: string } | null>(null);

  // Load preloaded restaurants from sessionStorage (if redirected from overview)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'results') {
      const restaurantsData = sessionStorage.getItem('selectedRestaurants');
      const userLocationData = sessionStorage.getItem('userLocation');
      
      if (restaurantsData) {
        try {
          const restaurants = JSON.parse(restaurantsData);
          console.log('📍 Loaded preselected restaurants:', restaurants);
          setPreloadedRestaurants(restaurants);
          
          // Clear sessionStorage after loading
          sessionStorage.removeItem('selectedRestaurants');
        } catch (error) {
          console.error('Error parsing restaurant data:', error);
        }
      }
      
      if (userLocationData) {
        try {
          const location = JSON.parse(userLocationData);
          setUserLocation(location);
          sessionStorage.removeItem('userLocation');
        } catch (error) {
          console.error('Error parsing user location:', error);
        }
      }
    }
  }, []);

  // Load Google Maps API using singleton loader
  useEffect(() => {
    if (window.google?.maps) {
      setApiLoaded(true);
      return;
    }

    loadGoogleMaps()
      .then(() => {
        console.log('✅ Google Maps loaded in RestaurantMap');
        setApiLoaded(true);
      })
      .catch((error) => {
        console.error('❌ Error loading Google Maps in RestaurantMap:', error);
      });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!apiLoaded || !mapRef.current || map) return;

    const newMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: 42.3601, lng: -71.0589 }, // Boston, MA
      zoom: 15,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      zoomControl: true,
      rotateControl: true,
      gestureHandling: 'greedy',
    });

    setMap(newMap);
    setPlacesService(new window.google.maps.places.PlacesService(newMap));

    // Get user location and add flashing blue dot
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(userPos);
          
          // Create flashing blue dot for user location
          const userMarker = new window.google.maps.Marker({
            position: userPos,
            map: newMap,
            icon: {
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 3,
            },
            title: 'Your Location',
            zIndex: 1000,
          });

          // Add pulsing circle animation
          const pulseCircle = new window.google.maps.Circle({
            strokeColor: '#4285F4',
            strokeOpacity: 0.6,
            strokeWeight: 1,
            fillColor: '#4285F4',
            fillOpacity: 0.2,
            map: newMap,
            center: userPos,
            radius: 50,
          });

          // Animate pulse
          let radius = 50;
          let growing = true;
          setInterval(() => {
            if (growing) {
              radius += 3;
              if (radius >= 100) growing = false;
            } else {
              radius -= 3;
              if (radius <= 50) growing = true;
            }
            pulseCircle.setRadius(radius);
          }, 50);
        },
        () => {
          setUserLocation({ lat: 42.3601, lng: -71.0589 }); // Default to Boston
        }
      );
    } else {
      setUserLocation({ lat: 42.3601, lng: -71.0589 }); // Default to Boston
    }

  }, [apiLoaded, map]);

  // Calculate distances from user location to all restaurants
  const calculateAverageDistances = useCallback((restaurants: PreloadedRestaurant[], userLoc: { lat: number; lng: number }) => {
    if (!window.google || restaurants.length === 0) return;

    const distanceService = new window.google.maps.DistanceMatrixService();
    const destinations = restaurants
      .filter(r => r.latitude && r.longitude)
      .map(r => new window.google.maps.LatLng(r.latitude!, r.longitude!));

    if (destinations.length === 0) return;

    // Calculate walking distances
    distanceService.getDistanceMatrix(
      {
        origins: [new window.google.maps.LatLng(userLoc.lat, userLoc.lng)],
        destinations,
        travelMode: window.google.maps.TravelMode.WALKING,
        unitSystem: window.google.maps.UnitSystem.IMPERIAL,
      },
      (response, status) => {
        if (status === 'OK' && response) {
          const walkingDistances = response.rows[0].elements
            .filter(e => e.status === 'OK')
            .map(e => e.distance.value); // meters

          const avgWalkingMeters = walkingDistances.reduce((a, b) => a + b, 0) / walkingDistances.length;
          const avgWalkingMiles = (avgWalkingMeters * 0.000621371).toFixed(1);

          // Calculate driving distances
          distanceService.getDistanceMatrix(
            {
              origins: [new window.google.maps.LatLng(userLoc.lat, userLoc.lng)],
              destinations,
              travelMode: window.google.maps.TravelMode.DRIVING,
              unitSystem: window.google.maps.UnitSystem.IMPERIAL,
            },
            (response2, status2) => {
              if (status2 === 'OK' && response2) {
                const drivingDistances = response2.rows[0].elements
                  .filter(e => e.status === 'OK')
                  .map(e => e.distance.value);

                const avgDrivingMeters = drivingDistances.reduce((a, b) => a + b, 0) / drivingDistances.length;
                const avgDrivingMiles = (avgDrivingMeters * 0.000621371).toFixed(1);

                setAverageDistances({
                  walking: `${avgWalkingMiles} mi`,
                  driving: `${avgDrivingMiles} mi`
                });
              }
            }
          );
        }
      }
    );
  }, []);

  // Display preloaded restaurants on map
  useEffect(() => {
    if (!map || !placesService || preloadedRestaurants.length === 0) return;

    console.log('🗺️ Displaying preloaded restaurants on map');

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const bounds = new window.google.maps.LatLngBounds();
    const displayedRestaurants: PlaceResult[] = [];

    // Add user location to bounds if available
    if (userLocation) {
      bounds.extend(userLocation);
      
      // Calculate average distances
      calculateAverageDistances(preloadedRestaurants, userLocation);
    }

    // Fetch details and add markers for each preloaded restaurant
    preloadedRestaurants.forEach((restaurant, index) => {
      // If we have coordinates, use them directly
      if (restaurant.latitude && restaurant.longitude) {
        const position = { lat: restaurant.latitude, lng: restaurant.longitude };
        
        // Create numbered marker
        const marker = new window.google.maps.Marker({
          position,
          map,
          label: {
            text: `${index + 1}`,
            color: 'white',
            fontSize: '14px',
            fontWeight: 'bold',
          },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 18,
            fillColor: '#7C3AED', // Purple
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
          title: restaurant.name,
          animation: window.google.maps.Animation.DROP,
        });

        markersRef.current.push(marker);
        bounds.extend(position);

        // Create a PlaceResult object for display
        const placeResult: PlaceResult = {
          place_id: restaurant.place_id,
          name: restaurant.name,
          formatted_address: restaurant.address || '',
          geometry: {
            location: new window.google.maps.LatLng(position.lat, position.lng)
          },
          rating: restaurant.rating,
        };
        displayedRestaurants.push(placeResult);

        // Add click listener
        marker.addListener('click', () => {
          handleSelectPlace(placeResult);
        });
      } else {
        // Fetch place details using place_id
        placesService.getDetails(
          { placeId: restaurant.place_id, fields: ['name', 'formatted_address', 'geometry', 'rating', 'photos', 'types', 'opening_hours'] },
          (place, status) => {
            if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
              const position = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
              };

              // Create numbered marker
              const marker = new window.google.maps.Marker({
                position,
                map,
                label: {
                  text: `${index + 1}`,
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 'bold',
                },
                icon: {
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 18,
                  fillColor: '#7C3AED', // Purple
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 3,
                },
                title: place.name,
                animation: window.google.maps.Animation.DROP,
              });

              markersRef.current.push(marker);
              bounds.extend(position);

              const placeResult: PlaceResult = {
                place_id: restaurant.place_id,
                name: place.name || restaurant.name,
                formatted_address: place.formatted_address || '',
                geometry: { location: place.geometry.location },
                rating: place.rating || restaurant.rating,
                photos: place.photos,
                types: place.types,
                opening_hours: place.opening_hours,
              };
              displayedRestaurants.push(placeResult);

              // Add click listener
              marker.addListener('click', () => {
                handleSelectPlace(placeResult);
              });
            }
          }
        );
      }
    });

    // Fit map to show all markers
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 50);
    }

    // Update visible results
    setSearchResults(displayedRestaurants);
    setVisibleResults(displayedRestaurants);
  }, [map, placesService, preloadedRestaurants, userLocation, calculateAverageDistances]);

  // Get place details - Define BEFORE updateVisibleResults uses it
  const handleSelectPlace = useCallback((place: PlaceResult) => {
    if (!placesService) return;

    const request: google.maps.places.PlaceDetailsRequest = {
      placeId: place.place_id,
      fields: [
        'name', 
        'formatted_address', 
        'formatted_phone_number', 
        'website', 
        'rating', 
        'photos', 
        'url',
        'opening_hours',
        'price_level',
        'reviews',
        'types',
        'user_ratings_total',
        'vicinity',
        'geometry',
        'editorial_summary',
        'serves_breakfast',
        'serves_lunch',
        'serves_dinner',
        'serves_brunch',
        'serves_vegetarian_food',
      ],
    };

    placesService.getDetails(request, (result, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && result) {
        setSelectedPlace(result as PlaceDetails);
      }
    });
  }, [placesService]);

  // Update visible results when map moves or search results change
  const updateVisibleResults = useCallback(() => {
    if (!map || searchResults.length === 0) return;
    
    const bounds = map.getBounds();
    if (!bounds) return;
    
    const resultsInView = searchResults.filter(place => 
      place.geometry?.location && bounds.contains(place.geometry.location)
    );
    
    console.log('Updating visible results:', resultsInView.length, 'of', searchResults.length);
    setVisibleResults(resultsInView);
    
    // Clear all existing markers
    markersRef.current.forEach(item => {
      if (item.infoWindow) item.infoWindow.close();
      if (item.marker) item.marker.setMap(null);
    });
    markersRef.current = [];
    
    // Add markers ONLY for visible results
    resultsInView.forEach((place) => {
      if (place.geometry?.location) {
        const marker = new window.google.maps.Marker({
          position: place.geometry.location,
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: place.rating && place.rating >= 4.5 ? '#9B87F5' : '#60A5FA',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        const textContent = `
          <div style="background: transparent; border: none; padding: 0; margin: 0;">
            <div style="background: white; color: black; font-size: 11px; font-weight: 600; padding: 3px 6px; border-radius: 6px; text-align: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); border: 1px solid rgba(155, 135, 245, 0.3);">
              ${place.name.length > 15 ? place.name.substring(0, 15) + '...' : place.name}
            </div>
          </div>
        `;

        const infoWindow = new window.google.maps.InfoWindow({
          content: textContent,
          disableAutoPan: true,
          pixelOffset: new window.google.maps.Size(0, -5),
          headerDisabled: true,
        });

        infoWindow.open(map, marker);
        
        marker.addListener('click', () => {
          handleSelectPlace(place as PlaceResult);
        });

        markersRef.current.push({ marker, infoWindow });
      }
    });
  }, [map, searchResults, handleSelectPlace]);

  // Listen for map bounds changes
  useEffect(() => {
    if (!map) return;
    
    const listener = map.addListener('idle', () => {
      updateVisibleResults();
    });
    
    return () => {
      window.google.maps.event.removeListener(listener);
    };
  }, [map, updateVisibleResults]);

  // Update visible results when search results change
  useEffect(() => {
    if (searchResults.length > 0) {
      updateVisibleResults();
    }
  }, [searchResults, updateVisibleResults]);

  // Search restaurants
  const searchRestaurants = useCallback(async () => {
    if (!placesService || !searchQuery.trim()) return;

    setIsLoading(true);

    // AI location detection
    let searchLocation = new window.google.maps.LatLng(42.3601, -71.0589); // Boston
    if (searchQuery.toLowerCase().includes('near') || searchQuery.toLowerCase().includes('on')) {
      const locationMatch = searchQuery.match(/(?:near|on)\s+(.+)/i);
      if (locationMatch) {
        const geocoder = new window.google.maps.Geocoder();
        await new Promise<void>((resolve) => {
          geocoder.geocode({ address: `${locationMatch[1]}, Boston, MA` }, (results, status) => {
            if (status === 'OK' && results?.[0] && map) {
              searchLocation = results[0].geometry.location;
              map.panTo(searchLocation);
              map.setZoom(16);
            }
            resolve();
          });
        });
      }
    }

    const request: google.maps.places.TextSearchRequest = {
      query: searchQuery,
      location: searchLocation,
      radius: 5000,
    };

    placesService.textSearch(request, (results, status) => {
      setIsLoading(false);
      
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
        setSearchResults(results as PlaceResult[]);
        
        const bounds = map?.getBounds();
        const resultsInView = bounds ? results.filter(place => 
          place.geometry?.location && bounds.contains(place.geometry.location)
        ) : results;
        setVisibleResults(resultsInView as PlaceResult[]);
        
        // Clear existing markers
        markersRef.current.forEach((item) => {
          if (item.infoWindow) item.infoWindow.close();
          if (item.marker) item.marker.setMap(null);
        });
        markersRef.current = [];

        // Create markers
        results.forEach((place) => {
          if (place.geometry?.location && map) {
            const marker = new window.google.maps.Marker({
              position: place.geometry.location,
              map: map,
              icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: place.rating && place.rating >= 4.5 ? '#9B87F5' : '#60A5FA',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              },
            });

            if (place.photos?.[0]) {
              const placeName = place.name || 'Restaurant';
              const textContent = `
                <div style="background: transparent; border: none; padding: 0; margin: 0;">
                  <div style="background: white; color: black; font-size: 11px; font-weight: 600; padding: 3px 6px; border-radius: 6px; text-align: center; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); border: 1px solid rgba(155, 135, 245, 0.3);">
                    ${placeName.length > 15 ? placeName.substring(0, 15) + '...' : placeName}
                  </div>
                </div>
              `;

              const infoWindow = new window.google.maps.InfoWindow({
                content: textContent,
                disableAutoPan: true,
                pixelOffset: new window.google.maps.Size(0, -5),
                headerDisabled: true,
              });

              infoWindow.open(map, marker);
              markersRef.current.push({ marker, infoWindow });
            }

            marker.addListener('click', () => {
              handleSelectPlace(place as PlaceResult);
            });
          }
        });
      }
    });
  }, [placesService, map, searchQuery]);

  // Change map type
  const changeMapType = useCallback((type: '3d' | 'roadmap' | 'satellite') => {
    if (!map) return;
    
    setMapType(type);
    localStorage.setItem('preferredMapType', type);
    
    if (type === '3d') {
      map.setMapTypeId('satellite');
      map.setTilt(67.5);
      map.setZoom(Math.max(map.getZoom() || 15, 16));
    } else if (type === 'roadmap') {
      map.setMapTypeId('roadmap');
      map.setTilt(0);
    } else {
      map.setMapTypeId('satellite');
      map.setTilt(0);
    }
  }, [map]);

  // Helper functions
  const getPriceLevel = (level?: number) => level ? '$'.repeat(level) : '';
  
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const estimateTravelTime = (distanceMiles: number): string => {
    if (distanceMiles < 0.5) return `${Math.round((distanceMiles / 3) * 60)} min walk`;
    return `${Math.round((distanceMiles / 20) * 60)} min drive`;
  };

  const getCuisineType = (types?: string[]): string => {
    if (!types) return 'Restaurant';
    const cuisineMap: Record<string, string> = {
      'italian_restaurant': 'Italian', 'japanese_restaurant': 'Japanese', 'chinese_restaurant': 'Chinese',
      'mexican_restaurant': 'Mexican', 'indian_restaurant': 'Indian', 'thai_restaurant': 'Thai',
      'french_restaurant': 'French', 'american_restaurant': 'American', 'korean_restaurant': 'Korean',
      'cafe': 'Café', 'bakery': 'Bakery', 'bar': 'Bar', 'pizza_restaurant': 'Pizza'
    };
    
    for (const type of types) {
      if (cuisineMap[type]) return cuisineMap[type];
    }
    return 'Restaurant';
  };

  if (!apiLoaded) {
    return (
      <div className={className}>
        <div className="h-[calc(100vh-80px)] flex items-center justify-center bg-white">
          <div className="text-center">
            <motion.div 
              className="w-12 h-12 rounded-full bg-purple-600 mx-auto mb-4"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Loading Google Maps...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="relative h-[calc(100vh-80px)] overflow-hidden">
        {/* Map Container */}
        <div className="absolute inset-0">
          <div ref={mapRef} className="absolute inset-0" />
        </div>

        {/* Average Distance Info - Top Left */}
        <AnimatePresence>
          {averageDistances && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-4 z-20 w-48"
            >
              <div className="bg-white rounded-2xl shadow-lg p-4 relative overflow-hidden border border-gray-200">
                <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent pointer-events-none rounded-t-2xl" />
                <div className="relative">
                  <h3 className="text-xs font-bold text-gray-900 mb-3">Avg Distance to All</h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🚶</span>
                        <span className="text-xs text-gray-600">Walk</span>
                      </div>
                      <span className="text-sm font-semibold text-purple-600">{averageDistances.walking}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🚗</span>
                        <span className="text-xs text-gray-600">Drive</span>
                      </div>
                      <span className="text-sm font-semibold text-purple-600">{averageDistances.driving}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Search - Top Left (below distance info) */}
        <div className={`absolute ${averageDistances ? 'top-32' : 'top-4'} left-4 z-20 w-32 transition-all duration-300`}>
          <div className="bg-white rounded-2xl shadow-lg p-3 relative overflow-hidden border border-gray-200">
            {/* Specular highlight */}
            <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent pointer-events-none rounded-t-2xl" />
            <div className="relative">
              <div className="space-y-2">
                <motion.button
                  onClick={() => { 
                    setSearchQuery('restaurants'); 
                    setTimeout(() => searchRestaurants(), 100); 
                  }}
                  disabled={isLoading}
                  className="w-full h-8 text-xs bg-gray-50 rounded-xl shadow-sm font-semibold text-[hsl(var(--foreground))] relative overflow-hidden disabled:opacity-50 border border-gray-200"
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-xl pointer-events-none" />
                  <span className="relative z-10">🍽️ Restaurants</span>
                </motion.button>
                <motion.button
                  onClick={() => { 
                    setSearchQuery('cafes'); 
                    setTimeout(() => searchRestaurants(), 100); 
                  }}
                  disabled={isLoading}
                  className="w-full h-8 text-xs bg-gray-50 rounded-xl shadow-sm font-semibold text-[hsl(var(--foreground))] relative overflow-hidden disabled:opacity-50 border border-gray-200"
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-xl pointer-events-none" />
                  <span className="relative z-10">☕ Cafés</span>
                </motion.button>
                <motion.button
                  onClick={() => { 
                    setSearchQuery('bars'); 
                    setTimeout(() => searchRestaurants(), 100); 
                  }}
                  disabled={isLoading}
                  className="w-full h-8 text-xs bg-gray-50 rounded-xl shadow-sm font-semibold text-[hsl(var(--foreground))] relative overflow-hidden disabled:opacity-50 border border-gray-200"
                  whileHover={{ scale: 1.02, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-xl pointer-events-none" />
                  <span className="relative z-10">🍺 Bars</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Map Type Toggle - Top Right */}
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-white rounded-2xl shadow-lg p-3 relative overflow-hidden border border-gray-200">
            {/* Specular highlight */}
            <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent pointer-events-none rounded-t-2xl" />
            <div className="relative">
              <div className="flex gap-2">
                <motion.button
                  onClick={() => changeMapType('3d')}
                  className={mapType === '3d' 
                    ? 'text-xs bg-gray-100 px-3 h-8 rounded-xl shadow-sm font-semibold text-[hsl(var(--foreground))] relative overflow-hidden border border-gray-300' 
                    : 'text-xs px-3 h-8 rounded-xl hover:bg-gray-50 font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {mapType === '3d' && (
                    <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-xl pointer-events-none" />
                  )}
                  <span className="relative z-10">3D</span>
                </motion.button>
                <motion.button
                  onClick={() => changeMapType('roadmap')}
                  className={mapType === 'roadmap' 
                    ? 'text-xs bg-gray-100 px-3 h-8 rounded-xl shadow-sm font-semibold text-[hsl(var(--foreground))] relative overflow-hidden border border-gray-300' 
                    : 'text-xs px-3 h-8 rounded-xl hover:bg-gray-50 font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {mapType === 'roadmap' && (
                    <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-xl pointer-events-none" />
                  )}
                  <span className="relative z-10">Map</span>
                </motion.button>
                <motion.button
                  onClick={() => changeMapType('satellite')}
                  className={mapType === 'satellite' 
                    ? 'text-xs bg-gray-100 px-3 h-8 rounded-xl shadow-sm font-semibold text-[hsl(var(--foreground))] relative overflow-hidden border border-gray-300' 
                    : 'text-xs px-3 h-8 rounded-xl hover:bg-gray-50 font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {mapType === 'satellite' && (
                    <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent rounded-t-xl pointer-events-none" />
                  )}
                  <span className="relative z-10">Satellite</span>
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Sidebar */}
        {searchResults.length > 0 && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="absolute top-20 right-4 w-64 h-[calc(100vh-200px)] z-20"
          >
            <div className="bg-white rounded-2xl shadow-lg p-4 h-full flex flex-col relative overflow-hidden border border-gray-200">
              {/* Specular highlight */}
              <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent pointer-events-none rounded-t-2xl" />
              <div className="relative h-full flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    {visibleResults.length} in view
                  </h3>
                  <button
                    onClick={() => {
                      setSearchResults([]);
                      setVisibleResults([]);
                      markersRef.current.forEach(item => {
                        if (item.infoWindow) item.infoWindow.close();
                        if (item.marker) item.marker.setMap(null);
                      });
                      markersRef.current = [];
                    }}
                    className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                  {visibleResults.map((place) => (
                    <button
                      key={place.place_id}
                      onClick={() => {
                        handleSelectPlace(place);
                        setCurrentPhotoIndex(0);
                      }}
                      className="w-full p-3 rounded-xl transition-all text-left relative overflow-hidden"
                      style={{
                        background: '#ffffff',
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                      }}
                    >
                      <div className="flex gap-3">
                        {place.photos && place.photos.length > 0 && place.photos[0] ? (
                          <img
                            src={place.photos[0].getUrl({ maxWidth: 120, maxHeight: 120 })}
                            alt={place.name}
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                            loading="eager"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg ${place.photos?.[0] ? 'hidden' : ''}`}>
                          🍽️
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-1 truncate">
                            {place.name}
                          </h4>
                          <div className="flex items-center justify-between">
                            {place.rating && (
                              <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                <span className="text-xs font-medium">{place.rating.toFixed(1)}</span>
                              </div>
                            )}
                            {userLocation && place.geometry?.location && (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                {estimateTravelTime(
                                  calculateDistance(
                                    userLocation.lat,
                                    userLocation.lng,
                                    place.geometry.location.lat(),
                                    place.geometry.location.lng()
                                  )
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Bottom Search Bar - Compact */}
        <div className="absolute bottom-0 left-0 right-0 p-3 pointer-events-none z-15">
          <div className="max-w-2xl mx-auto pointer-events-auto">
            <div className="bg-white rounded-full shadow-strong px-4 py-2 relative overflow-hidden">
              <div className="relative">
                <form onSubmit={(e) => { 
                  e.preventDefault(); 
                  if (searchQuery.trim()) searchRestaurants();
                }}>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search restaurants, cuisines, or dishes..."
                      className="w-full pr-10 py-2 bg-transparent border-0 outline-none focus:outline-none 
                                text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                      disabled={isLoading}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSearchResults([]);
                          setVisibleResults([]);
                          markersRef.current.forEach(item => {
                            if (item.infoWindow) item.infoWindow.close();
                            if (item.marker) item.marker.setMap(null);
                          });
                          markersRef.current = [];
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    {isLoading && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                      </div>
                    )}
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Restaurant Detail Drawer - Fixed Height */}
        <AnimatePresence>
          {selectedPlace && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute top-20 right-[280px] w-96 h-[calc(100vh-200px)] z-25"
            >
              <div className="bg-white rounded-[32px] overflow-hidden h-full flex flex-col relative shadow-xl border border-gray-200">
                {/* Specular highlight */}
                <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-t-[32px]" />
                
                <button
                  onClick={() => setSelectedPlace(null)}
                  className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-all shadow-md border border-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Photo Gallery */}
                <div className="relative h-48 flex-shrink-0">
                  {selectedPlace.photos && selectedPlace.photos.length > 0 ? (
                    <>
                      <img
                        src={selectedPlace.photos[currentPhotoIndex].getUrl({ maxWidth: 600, maxHeight: 400 })}
                        alt={selectedPlace.name}
                        className="w-full h-full object-cover"
                      />
                      {selectedPlace.photos.length > 1 && (
                        <>
                          <button
                            onClick={() => setCurrentPhotoIndex((prev) => 
                              prev > 0 ? prev - 1 : selectedPlace.photos!.length - 1
                            )}
                            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
                          >
                            ←
                          </button>
                          <button
                            onClick={() => setCurrentPhotoIndex((prev) => 
                              prev < selectedPlace.photos!.length - 1 ? prev + 1 : 0
                            )}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
                          >
                            →
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                      <ImageIcon className="w-16 h-16 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-2">
                      {selectedPlace.name}
                    </h2>
                    {selectedPlace.rating && (
                      <div className="flex items-center gap-1 mb-2">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-semibold">{selectedPlace.rating.toFixed(1)}</span>
                        {(selectedPlace as any).user_ratings_total && (
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            ({(selectedPlace as any).user_ratings_total} reviews)
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {selectedPlace.formatted_address}
                    </p>
                  </div>

                  {/* Contact Info */}
                  <div className="space-y-2">
                    {selectedPlace.formatted_phone_number && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-purple-400" />
                        <a
                          href={`tel:${selectedPlace.formatted_phone_number}`}
                          className="text-sm text-purple-500 hover:underline"
                        >
                          {selectedPlace.formatted_phone_number}
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {selectedPlace.website && (
                        <>
                          <Globe className="w-4 h-4 text-purple-400" />
                          <a
                            href={selectedPlace.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-500 hover:underline"
                          >
                            Visit Website
                          </a>
                        </>
                      )}
                      {(selectedPlace as any).opening_hours?.weekday_text && (
                        <div className="relative ml-auto">
                          <button
                            onClick={() => setShowHours(!showHours)}
                            className="flex items-center gap-1 text-sm text-purple-500 hover:underline"
                          >
                            <Clock className="w-4 h-4" />
                            Hours
                            <ChevronDown className={`w-3 h-3 transition-transform ${showHours ? 'rotate-180' : ''}`} />
                          </button>
                          {showHours && (
                            <div className="absolute top-full right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-purple-100 p-3 z-10">
                              <div className="space-y-1">
                                {(selectedPlace as any).opening_hours.weekday_text.map((hours: string, idx: number) => (
                                  <div key={idx} className="text-xs text-[hsl(var(--foreground))] py-1">
                                    {hours}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Menu Section - Scrollable */}
                  <div className="pt-3 border-t border-purple-100">
                    <h3 className="text-sm font-semibold text-[hsl(var(--foreground))] mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      Menu
                    </h3>
                    
                    {/* Menu items */}
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                      {(() => {
                        const cuisineType = getCuisineType(selectedPlace.types);
                        const priceRange = selectedPlace.price_level || 2;
                        const basePrice = priceRange * 10;
                        
                        // Generate cuisine-appropriate menu items
                        const menuItems = cuisineType === 'Italian' ? [
                          { name: 'Margherita Pizza', price: basePrice + 2 },
                          { name: 'Pasta Carbonara', price: basePrice + 6 },
                          { name: 'Osso Buco', price: basePrice + 12 },
                          { name: 'Tiramisu', price: basePrice - 2 },
                        ] : cuisineType === 'Japanese' || cuisineType === 'Sushi' ? [
                          { name: 'Sushi Platter', price: basePrice + 8 },
                          { name: 'Ramen Bowl', price: basePrice },
                          { name: 'Tempura', price: basePrice + 4 },
                          { name: 'Mochi Ice Cream', price: basePrice - 4 },
                        ] : cuisineType === 'Mexican' ? [
                          { name: 'Tacos (3)', price: basePrice },
                          { name: 'Burrito', price: basePrice + 2 },
                          { name: 'Enchiladas', price: basePrice + 4 },
                          { name: 'Churros', price: basePrice - 4 },
                        ] : [
                          { name: 'Appetizer', price: basePrice },
                          { name: 'Main Course', price: basePrice + 8 },
                          { name: 'Side Dish', price: basePrice - 2 },
                          { name: 'Dessert', price: basePrice - 4 },
                        ];

                        return menuItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                            <span className="text-sm font-medium text-[hsl(var(--foreground))]">
                              {item.name}
                            </span>
                            <span className="text-sm font-semibold text-purple-600">
                              ${item.price}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-3">
                    <Button
                      className="flex-1 bg-purple-600 text-white hover:bg-purple-700"
                      onClick={() => {
                        if (selectedPlace.url) {
                          window.open(selectedPlace.url, '_blank');
                        } else {
                          const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedPlace.formatted_address || '')}`;
                          window.open(mapsUrl, '_blank');
                        }
                      }}
                    >
                      <Navigation className="w-4 h-4 mr-2" />
                      Directions
                    </Button>
                    <Button variant="outline" className="border-purple-200">
                      <Heart className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

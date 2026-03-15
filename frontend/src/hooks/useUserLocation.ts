import { useState } from "react";

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export const useUserLocation = () => {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "granted" | "denied">("idle");
  const [error, setError] = useState<string | null>(null);

  const requestLocation = (): Promise<UserLocation | null> => {
    if (!navigator.geolocation) {
      setStatus("denied");
      setError("Geolocation is not supported by this browser.");
      return Promise.resolve(null);
    }

    setStatus("loading");

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const nextLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          setLocation(nextLocation);
          setStatus("granted");
          setError(null);
          resolve(nextLocation);
        },
        (geoError) => {
          setStatus("denied");
          setError(geoError.message);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 5 * 60_000
        }
      );
    });
  };

  return {
    location,
    status,
    error,
    requestLocation
  };
};

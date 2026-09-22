import { useState, useRef, useCallback } from 'react';

const LOW_PASS_ALPHA = 0.15;

/**
 * 나침반 센서 커스텀 훅
 *
 * @returns {{
 *   heading: number,
 *   requestPermission: () => Promise<void>
 * }}
 */
export function useCompass() {
  const [heading, setHeading] = useState(0);
  const smoothHeadingRef      = useRef(null);
  const handlerRef            = useRef(null);

  const handleOrientation = useCallback((event) => {
    let rawHeading = null;

    if (event.webkitCompassHeading !== undefined) {
      rawHeading = event.webkitCompassHeading;
    } else if (event.absolute && event.alpha !== null) {
      rawHeading = (360 - event.alpha) % 360;
    } else {
      return;
    }

    if (smoothHeadingRef.current === null) {
      smoothHeadingRef.current = rawHeading;
    } else {
      let diff = rawHeading - smoothHeadingRef.current;
      if (diff >  180) diff -= 360;
      if (diff < -180) diff += 360;
      smoothHeadingRef.current =
        (smoothHeadingRef.current + LOW_PASS_ALPHA * diff + 360) % 360;
    }

    setHeading(Math.round(smoothHeadingRef.current));
  }, []);

  const requestPermission = useCallback(async () => {
    handlerRef.current = handleOrientation;

    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          window.addEventListener('deviceorientationabsolute', handlerRef.current, true);
          window.addEventListener('deviceorientation',         handlerRef.current, true);
        }
      } catch (err) {
        console.warn('나침반 권한 거부:', err);
      }
    } else {
      window.addEventListener('deviceorientationabsolute', handlerRef.current, true);
      window.addEventListener('deviceorientation',         handlerRef.current, true);
    }
  }, [handleOrientation]);

  const removeListener = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('deviceorientationabsolute', handlerRef.current, true);
      window.removeEventListener('deviceorientation',         handlerRef.current, true);
    }
  }, []);

  return { heading, requestPermission, removeListener };
}
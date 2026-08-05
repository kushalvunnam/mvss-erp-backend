const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const normalizedApiBaseUrl = configuredApiBaseUrl
  ? configuredApiBaseUrl.replace(/\/$/, '')
  : '';

export const API_BASE_URL = normalizedApiBaseUrl
  ? (normalizedApiBaseUrl.endsWith('/api') ? normalizedApiBaseUrl : `${normalizedApiBaseUrl}/api`)
  : (import.meta.env.DEV ? '/api' : 'https://mvssautomobilesfiles-rkp4.onrender.com/api');

export const OWNER_SUPPORT_NUMBER = import.meta.env.VITE_OWNER_SUPPORT_NUMBER || '+91 99494 79765';

/**
 * Centralized Branch Configuration with Latitude, Longitude, and Google Maps Navigation URLs
 */
export const BRANCHES = [
  {
    id: 'branch-1',
    name: 'Branch 1 - Petbasheerabad',
    code: 'B1',
    area: 'Petbasheerabad',
    address: 'Survey No. 25/1, Opp. Cine Planet, Beside PSR Convention, Petbasheerabad, Hyderabad - 500067',
    phone: '+91 99494 79765',
    email: 'accounts@auto4m.in',
    coordinates: {
      latitude: 17.5278,
      longitude: 78.4852
    },
    googleMapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=17.5278,78.4852'
  },
  {
    id: 'branch-2',
    name: 'Branch 2 - Gundlapochampally',
    code: 'B2',
    area: 'Gundlapochampally',
    address: 'Survey No. 48/5, Near Anthem Villas, Gundlapochampally Village & Municipality, NH-44, Medchal-Malkajgiri - 500014',
    phone: '+91 99494 79765',
    email: 'accounts@auto4m.in',
    coordinates: {
      latitude: 17.5764,
      longitude: 78.4812
    },
    googleMapsUrl: 'https://maps.app.goo.gl/67ighFJZMzyM2yi19?g_st=iw'
  }
];

/**
 * Helper to generate standard Google Maps directions URL for a given branch
 */
export function getBranchDirectionsUrl(branch) {
  if (branch && branch.googleMapsUrl) {
    return branch.googleMapsUrl;
  }
  if (branch && branch.coordinates && branch.coordinates.latitude && branch.coordinates.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${branch.coordinates.latitude},${branch.coordinates.longitude}`;
  }
  return 'https://www.google.com/maps';
}

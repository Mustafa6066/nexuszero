export const size = { width: 32, height: 32 };
export const contentType = 'image/svg+xml';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
  <defs>
    <linearGradient id="nexuszero-icon-gradient" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0F766E"/>
      <stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#nexuszero-icon-gradient)"/>
  <path d="M10 22V10H12.75L19.5 18.1V10H22V22H19.55L12.5 13.55V22H10Z" fill="white"/>
</svg>`;

export default function Icon() {
  return new Response(svg, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

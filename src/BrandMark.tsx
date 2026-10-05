// Trinetra mark: an eye with a radar-sweep iris and a saffron third-eye mark, matching the favicon.
export default function BrandMark({ size = 30 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
    <rect x="1" y="1" width="38" height="38" rx="9" fill="#13294B" stroke="#E8711A" strokeWidth="2"/>
    <path d="M20 6.5 22 12.5 20 15.5 18 12.5Z" fill="#E8711A"/>
    <path d="M6 24.5C11.5 15.5 28.5 15.5 34 24.5 28.5 33.5 11.5 33.5 6 24.5Z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="20" cy="24.5" r="6.2" fill="none" stroke="#8FB3D9" strokeWidth="1.5"/>
    <path d="M20 24.5V18.3A6.2 6.2 0 0 1 25.4 21.4Z" fill="#E8711A"/>
    <circle cx="20" cy="24.5" r="2" fill="#fff"/>
  </svg>;
}

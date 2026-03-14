'use client';

interface NexusIconProps {
  size?: number;
  active?: boolean;
  thinking?: boolean;
  className?: string;
}

/**
 * Custom animated NexusAI icon — a neural-network-inspired sigil.
 * Three interconnected nodes with animated connection paths.
 */
export function NexusIcon({ size = 20, active = false, thinking = false, className = '' }: NexusIconProps) {
  return (
    <div className={`nexus-icon ${active ? 'active' : ''} ${className}`} style={{ width: size, height: size }}>
      {/* Outer animated gradient ring */}
      <div className="nexus-icon-ring" style={{ borderRadius: '50%' }} />
      <div className="nexus-icon-core" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Connection lines between nodes — soft glow */}
          <g opacity="0.5">
            <line x1="12" y1="4.5" x2="6" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              {thinking && <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />}
            </line>
            <line x1="12" y1="4.5" x2="18" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              {thinking && <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" begin="0.4s" repeatCount="indefinite" />}
            </line>
            <line x1="6" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              {thinking && <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" begin="0.8s" repeatCount="indefinite" />}
            </line>
            {/* Center connections */}
            <line x1="12" y1="4.5" x2="12" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
            <line x1="6" y1="15" x2="12" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
            <line x1="18" y1="15" x2="12" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
          </g>

          {/* Center node — main brain */}
          <circle cx="12" cy="11" r="2.8" fill="currentColor" opacity="0.15" />
          <circle cx="12" cy="11" r="1.6" fill="currentColor">
            {thinking && <animate attributeName="r" values="1.6;2;1.6" dur="1.5s" repeatCount="indefinite" />}
          </circle>

          {/* Top node */}
          <circle cx="12" cy="4.5" r="2" fill="currentColor" opacity="0.15" />
          <circle cx="12" cy="4.5" r="1.2" fill="currentColor">
            {thinking && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" begin="0.2s" repeatCount="indefinite" />}
          </circle>

          {/* Bottom-left node */}
          <circle cx="6" cy="15" r="2" fill="currentColor" opacity="0.15" />
          <circle cx="6" cy="15" r="1.2" fill="currentColor">
            {thinking && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" begin="0.6s" repeatCount="indefinite" />}
          </circle>

          {/* Bottom-right node */}
          <circle cx="18" cy="15" r="2" fill="currentColor" opacity="0.15" />
          <circle cx="18" cy="15" r="1.2" fill="currentColor">
            {thinking && <animate attributeName="opacity" values="0.6;1;0.6" dur="1.8s" begin="1s" repeatCount="indefinite" />}
          </circle>

          {/* Small orbiting signal dots (visible when active/thinking) */}
          {(active || thinking) && (
            <g>
              <circle r="0.7" fill="currentColor" opacity="0.7">
                <animateMotion dur="3s" repeatCount="indefinite" path="M12,4.5 L18,15 L6,15 Z" />
              </circle>
              <circle r="0.5" fill="currentColor" opacity="0.5">
                <animateMotion dur="3s" begin="1s" repeatCount="indefinite" path="M12,4.5 L6,15 L18,15 Z" />
              </circle>
            </g>
          )}

          {/* Outer subtle ring */}
          <circle cx="12" cy="10.5" r="10" fill="none" stroke="currentColor" strokeWidth="0.3" opacity="0.15" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Compact inline version for nav button and small UI elements
 */
export function NexusIconInline({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="12" y1="4.5" x2="6" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="12" y1="4.5" x2="18" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="6" y1="15" x2="18" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="12" y1="4.5" x2="12" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
      <line x1="6" y1="15" x2="12" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
      <line x1="18" y1="15" x2="12" y2="11" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35" />
      <circle cx="12" cy="11" r="1.8" fill="currentColor" />
      <circle cx="12" cy="4.5" r="1.3" fill="currentColor" />
      <circle cx="6" cy="15" r="1.3" fill="currentColor" />
      <circle cx="18" cy="15" r="1.3" fill="currentColor" />
    </svg>
  );
}

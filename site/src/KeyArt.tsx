export default function KeyArt() {
  return <svg className="keypress-art" viewBox="220 0 610 430" role="img" aria-labelledby="keypress-title keypress-description">
            <title id="keypress-title">The delete key never makes contact</title>
            <desc id="keypress-description">A visual metaphor for a blocked tool call. The Delete key stops above its contact plate. Your example rule blocks the attempted deletion before execution and TENET reports a finding. This demo never deletes data.</desc>
            <path d="M 350 261 L 574 207 L 718 302 L 491 360 Z" fill="#f5f5f5" stroke="#d0d0d0" />
            <path d="M 350 261 L 350 266 L 491 365 L 718 307 L 718 302" fill="none" stroke="#d0d0d0" />
            <path data-key-shadow d="M 383 270 L 567 226 L 683 301 L 493 346 Z" fill="#c9c9c9" opacity=".45" />
            <g data-key transform="translate(0 42.00)">
              {/* Side faces follow the cap's radius-17 outline, extruded 49px downward. */}
              <path d="M 356.96 127.50 C 356.96 129.77 358.72 132.19 361.94 134.35
                L 476.74 211.35 C 484.44 216.51 498.29 218.87 507.68 216.62
                L 697.68 171.02 C 702.77 169.80 705.72 167.38 705.72 164.44
                L 705.72 213.44 C 705.72 216.38 702.77 218.80 697.68 220.02
                L 507.68 265.62 C 498.29 267.87 484.44 265.51 476.74 260.35
                L 361.94 183.35 C 358.72 181.19 356.96 178.77 356.96 176.50 Z"
                fill="#d9d9d9" stroke="#949494" />
              <path d="M 356.96 127.50 C 356.96 129.77 358.72 132.19 361.94 134.35
                L 476.74 211.35 C 480.44 213.83 485.77 215.78 491.58 216.77
                L 491.58 265.77 C 485.77 264.78 480.44 262.83 476.74 260.35
                L 361.94 183.35 C 358.72 181.19 356.96 178.77 356.96 176.50 Z"
                fill="#ededed" stroke="#949494" />
              <g transform="matrix(1 -.24 .82 .55 348 125)">
                <rect width="224" height="174" rx="17" fill="#fafafa" stroke="#949494" strokeWidth="1.3" />
                <rect x="11" y="11" width="202" height="151" rx="12" fill="none" stroke="#e5e5e5" />
                <text x="25" y="53" fill="#626262" fontFamily="monospace" fontSize="11" letterSpacing="2">TOOL CALL</text>
                <text x="25" y="124" fill="#171717" fontFamily="-apple-system, BlinkMacSystemFont, Arial, sans-serif" fontSize="41" letterSpacing="-1">delete</text>
              </g>
            </g>
            <g data-blocked>
              <path d="M 650 278 H 684" fill="none" stroke="#171717" strokeWidth="3" />
              <rect x="680" y="254" width="144" height="48" rx="24" fill="#171717" stroke="#ffffff" strokeWidth="3" />
              <text x="752" y="285" textAnchor="middle" fill="#ffffff" fontFamily="Geist, Arial, sans-serif" fontSize="23" fontWeight="600">Blocked</text>
            </g>
            <text x="490" y="405" textAnchor="middle" fill="#626262" fontFamily="monospace" fontSize="10" letterSpacing="2">PRODUCTION</text>
          </svg>;
}

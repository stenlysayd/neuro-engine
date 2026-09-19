/** @type {import("tailwindcss").Config} */
export default {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "surface-bright": "#353942",
        "on-surface": "#dfe2ee",
        "on-error": "#690005",
        "surface-container-lowest": "#0a0e16",
        "on-primary": "#003824",
        "primary-container": "#10b981",
        "surface-tint": "#4edea3",
        "surface-container-low": "#181c24",
        "on-primary-container": "#00422b",
        "inverse-on-surface": "#2c3039",
        "tertiary": "#ffb95f",
        "on-tertiary-fixed-variant": "#653e00",
        "background": "#0f131c",
        "secondary-container": "#03b5d3",
        "on-secondary": "#003640",
        "on-secondary-container": "#00424e",
        "surface": "#0f131c",
        "on-tertiary": "#472a00",
        "on-secondary-fixed-variant": "#004e5c",
        "primary-fixed-dim": "#4edea3",
        "error-container": "#93000a",
        "inverse-primary": "#006c49",
        "surface-container-highest": "#31353e",
        "surface-container-high": "#262a33",
        "secondary": "#4cd7f6",
        "on-tertiary-container": "#523200",
        "tertiary-fixed-dim": "#ffb95f",
        "secondary-fixed-dim": "#4cd7f6",
        "inverse-surface": "#dfe2ee",
        "on-background": "#dfe2ee",
        "on-primary-fixed-variant": "#005236",
        "error": "#ffb4ab",
        "on-error-container": "#ffdad6",
        "secondary-fixed": "#acedff",
        "on-tertiary-fixed": "#2a1700",
        "tertiary-container": "#e29100",
        "primary": "#4edea3",
        "tertiary-fixed": "#ffddb8",
        "outline-variant": "#3c4a42",
        "on-surface-variant": "#bbcabf",
        "outline": "#86948a",
        "surface-container": "#1c2028",
        "surface-variant": "#31353e",
        "on-secondary-fixed": "#001f26",
        "surface-dim": "#0f131c",
        "primary-fixed": "#6ffbbe",
        "on-primary-fixed": "#002113"
      },
      "borderRadius": {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      "spacing": {
        "space-xl": "2rem",
        "margin-mobile": "1rem",
        "space-md": "0.75rem",
        "gutter-dense": "0.5rem",
        "space-sm": "0.5rem",
        "gutter": "1rem",
        "margin": "1.5rem",
        "space-xs": "0.25rem",
        "space-lg": "1.25rem"
      },
      "fontFamily": {
        "headline-lg": [
          "Plus Jakarta Sans"
        ],
        "code-dense": [
          "JetBrains Mono"
        ],
        "label-mono-lg": [
          "JetBrains Mono"
        ],
        "headline-lg-mobile": [
          "Plus Jakarta Sans"
        ],
        "label-mono-md": [
          "JetBrains Mono"
        ],
        "body-sm": [
          "Inter"
        ],
        "body-lg": [
          "Inter"
        ],
        "headline-sm": [
          "Plus Jakarta Sans"
        ],
        "body-md": [
          "Inter"
        ],
        "headline-md": [
          "Plus Jakarta Sans"
        ],
        "label-mono-sm": [
          "JetBrains Mono"
        ]
      },
      "fontSize": {
        "headline-lg": [
          "30px",
          {
            "lineHeight": "38px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "code-dense": [
          "10px",
          {
            "lineHeight": "12px",
            "letterSpacing": "0.04em",
            "fontWeight": "600"
          }
        ],
        "label-mono-lg": [
          "13px",
          {
            "lineHeight": "18px",
            "letterSpacing": "-0.01em",
            "fontWeight": "500"
          }
        ],
        "headline-lg-mobile": [
          "24px",
          {
            "lineHeight": "32px",
            "letterSpacing": "-0.015em",
            "fontWeight": "700"
          }
        ],
        "label-mono-md": [
          "12px",
          {
            "lineHeight": "16px",
            "letterSpacing": "0em",
            "fontWeight": "500"
          }
        ],
        "body-sm": [
          "12px",
          {
            "lineHeight": "16px",
            "fontWeight": "400"
          }
        ],
        "body-lg": [
          "15px",
          {
            "lineHeight": "22px",
            "fontWeight": "400"
          }
        ],
        "headline-sm": [
          "18px",
          {
            "lineHeight": "24px",
            "letterSpacing": "-0.005em",
            "fontWeight": "600"
          }
        ],
        "body-md": [
          "13px",
          {
            "lineHeight": "18px",
            "fontWeight": "400"
          }
        ],
        "headline-md": [
          "22px",
          {
            "lineHeight": "28px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "label-mono-sm": [
          "11px",
          {
            "lineHeight": "14px",
            "letterSpacing": "0.02em",
            "fontWeight": "500"
          }
        ]
      }
    }
  },
  "content": [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ]
};

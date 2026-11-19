import fs from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('public/lottie-templates');

// Helper to convert hex to Lottie [r, g, b, 1] (0-1 range)
function hexToLottieColor(hex) {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  return [parseFloat(r.toFixed(3)), parseFloat(g.toFixed(3)), parseFloat(b.toFixed(3)), 1];
}

// 1. Bouncing Arrow
function makeBouncingArrow() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 200,
    h: 200,
    nm: 'Bouncing Arrow',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Arrow Layer',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 45 },
          p: {
            a: 1,
            k: [
              { t: 0, s: [100, 70, 0], e: [100, 110, 0], i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 } },
              { t: 25, s: [100, 110, 0], e: [100, 70, 0], i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 } },
              { t: 50, s: [100, 70, 0], e: [100, 110, 0], i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 } },
              { t: 75, s: [100, 110, 0], e: [100, 70, 0], i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 } },
              { t: 90, s: [100, 70, 0], e: [100, 70, 0] }
            ]
          },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [80, 80, 100], e: [110, 110, 100] },
              { t: 25, s: [110, 110, 100], e: [80, 80, 100] },
              { t: 50, s: [80, 80, 100], e: [110, 110, 100] },
              { t: 75, s: [110, 110, 100], e: [80, 80, 100] },
              { t: 90, s: [80, 80, 100], e: [80, 80, 100] }
            ]
          }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Arrow Shape',
            it: [
              {
                ty: 'sh',
                nm: 'Path',
                ks: {
                  a: 0,
                  k: {
                    c: true,
                    v: [[0, -40], [25, 5], [10, 5], [10, 40], [-10, 40], [-10, 5], [-25, 5]],
                    i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                    o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]
                  }
                }
              },
              {
                ty: 'fl',
                nm: 'Fill',
                c: { a: 0, k: hexToLottieColor('#FFB800') },
                o: { a: 0, k: 100 },
                r: 1
              },
              {
                ty: 'st',
                nm: 'Stroke',
                c: { a: 0, k: [1, 1, 1, 1] },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 4 },
                lc: 2,
                lj: 2
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

// 2. Target Reticle
function makeTargetReticle() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 240,
    h: 240,
    nm: 'Target Reticle',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Reticle Ring',
        sr: 1,
        ks: {
          o: {
            a: 1,
            k: [
              { t: 0, s: [0], e: [100] },
              { t: 15, s: [100], e: [100] },
              { t: 80, s: [100], e: [0] },
              { t: 90, s: [0], e: [0] }
            ]
          },
          r: {
            a: 1,
            k: [
              { t: 0, s: [0], e: [360] },
              { t: 90, s: [360], e: [360] }
            ]
          },
          p: { a: 0, k: [120, 120, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [40, 40, 100], e: [100, 100, 100] },
              { t: 20, s: [100, 100, 100], e: [95, 95, 100] },
              { t: 45, s: [95, 95, 100], e: [105, 105, 100] },
              { t: 70, s: [105, 105, 100], e: [100, 100, 100] }
            ]
          }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Circle',
            it: [
              {
                ty: 'el',
                nm: 'Outer Ellipse',
                p: { a: 0, k: [0, 0] },
                s: { a: 0, k: [140, 140] }
              },
              {
                ty: 'st',
                nm: 'Stroke',
                c: { a: 0, k: hexToLottieColor('#00E5FF') },
                o: { a: 0, k: 90 },
                w: { a: 0, k: 3 },
                d: [
                  { n: 'd', v: { a: 0, k: 18 } },
                  { n: 'g', v: { a: 0, k: 8 } }
                ]
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          },
          {
            ty: 'gr',
            nm: 'Crosshairs',
            it: [
              {
                ty: 'sh',
                nm: 'Cross',
                ks: {
                  a: 0,
                  k: {
                    c: false,
                    v: [[-80, 0], [-20, 0], [20, 0], [80, 0]],
                    i: [[0, 0], [0, 0], [0, 0], [0, 0]],
                    o: [[0, 0], [0, 0], [0, 0], [0, 0]]
                  }
                }
              },
              {
                ty: 'st',
                nm: 'Crosshair Stroke',
                c: { a: 0, k: hexToLottieColor('#00E5FF') },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 2 }
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

// 3. Circle Highlight (Hand drawn attention ring)
function makeCircleHighlight() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 260,
    h: 260,
    nm: 'Circle Highlight',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Highlight Shape',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: -12 },
          p: { a: 0, k: [130, 130, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [70, 70, 100], e: [100, 100, 100], i: { x: 0.1, y: 1 }, o: { x: 0.7, y: 0 } },
              { t: 18, s: [100, 100, 100], e: [100, 100, 100] }
            ]
          }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Ellipse Group',
            it: [
              {
                ty: 'el',
                nm: 'Path',
                p: { a: 0, k: [0, 0] },
                s: { a: 0, k: [180, 130] }
              },
              {
                ty: 'tm',
                nm: 'Trim Path',
                s: { a: 0, k: 0 },
                e: {
                  a: 1,
                  k: [
                    { t: 0, s: [0], e: [100], i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 } },
                    { t: 25, s: [100], e: [100] }
                  ]
                },
                o: { a: 0, k: 0 }
              },
              {
                ty: 'st',
                nm: 'Stroke',
                c: { a: 0, k: hexToLottieColor('#FF3366') },
                o: { a: 0, k: 95 },
                w: { a: 0, k: 5 },
                lc: 2,
                lj: 2
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

// 4. Cinematic Underline
function makeCinematicUnderline() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 400,
    h: 50,
    nm: 'Cinematic Underline',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Underline Rule',
        sr: 1,
        ks: {
          o: {
            a: 1,
            k: [
              { t: 0, s: [0], e: [100] },
              { t: 10, s: [100], e: [100] },
              { t: 80, s: [100], e: [0] },
              { t: 90, s: [0], e: [0] }
            ]
          },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [200, 25, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Line',
            it: [
              {
                ty: 'sh',
                nm: 'Path',
                ks: {
                  a: 0,
                  k: {
                    c: false,
                    v: [[-160, 0], [160, 0]],
                    i: [[0, 0], [0, 0]],
                    o: [[0, 0], [0, 0]]
                  }
                }
              },
              {
                ty: 'tm',
                nm: 'Trim Path',
                s: {
                  a: 1,
                  k: [
                    { t: 0, s: [50], e: [0], i: { x: 0.1, y: 1 }, o: { x: 0.8, y: 0 } },
                    { t: 20, s: [0], e: [0] }
                  ]
                },
                e: {
                  a: 1,
                  k: [
                    { t: 0, s: [50], e: [100], i: { x: 0.1, y: 1 }, o: { x: 0.8, y: 0 } },
                    { t: 20, s: [100], e: [100] }
                  ]
                },
                o: { a: 0, k: 0 }
              },
              {
                ty: 'st',
                nm: 'Stroke',
                c: { a: 0, k: hexToLottieColor('#C59B52') },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 4 },
                lc: 2
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

// 5. Verified Badge
function makeVerifiedBadge() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 160,
    h: 160,
    nm: 'Verified Badge',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Badge Layer',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: {
            a: 1,
            k: [
              { t: 0, s: [-30], e: [0], i: { x: 0.175, y: 0.885 }, o: { x: 0.32, y: 1.275 } },
              { t: 20, s: [0], e: [0] }
            ]
          },
          p: { a: 0, k: [80, 80, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [0, 0, 100], e: [100, 100, 100], i: { x: 0.175, y: 0.885 }, o: { x: 0.32, y: 1.275 } },
              { t: 20, s: [100, 100, 100], e: [100, 100, 100] }
            ]
          }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Circle Bg',
            it: [
              {
                ty: 'el',
                nm: 'Circle',
                p: { a: 0, k: [0, 0] },
                s: { a: 0, k: [110, 110] }
              },
              {
                ty: 'fl',
                nm: 'Fill',
                c: { a: 0, k: hexToLottieColor('#10B981') },
                o: { a: 0, k: 100 }
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          },
          {
            ty: 'gr',
            nm: 'Checkmark',
            it: [
              {
                ty: 'sh',
                nm: 'Check Path',
                ks: {
                  a: 0,
                  k: {
                    c: false,
                    v: [[-22, 0], [-6, 16], [24, -14]],
                    i: [[0, 0], [0, 0], [0, 0]],
                    o: [[0, 0], [0, 0], [0, 0]]
                  }
                }
              },
              {
                ty: 'tm',
                nm: 'Trim Check',
                s: { a: 0, k: 0 },
                e: {
                  a: 1,
                  k: [
                    { t: 12, s: [0], e: [100], i: { x: 0.2, y: 1 }, o: { x: 0.8, y: 0 } },
                    { t: 28, s: [100], e: [100] }
                  ]
                },
                o: { a: 0, k: 0 }
              },
              {
                ty: 'st',
                nm: 'Stroke',
                c: { a: 0, k: [1, 1, 1, 1] },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 7 },
                lc: 2,
                lj: 2
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

// 6. Metric Counter / Radial Gauge
function makeMetricGauge() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 200,
    h: 200,
    nm: 'Metric Radial Gauge',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Gauge Arc',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: -90 },
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Track',
            it: [
              {
                ty: 'el',
                nm: 'Ellipse',
                p: { a: 0, k: [0, 0] },
                s: { a: 0, k: [140, 140] }
              },
              {
                ty: 'st',
                nm: 'Track Stroke',
                c: { a: 0, k: [1, 1, 1, 0.15] },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 8 }
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          },
          {
            ty: 'gr',
            nm: 'Active Arc',
            it: [
              {
                ty: 'el',
                nm: 'Ellipse',
                p: { a: 0, k: [0, 0] },
                s: { a: 0, k: [140, 140] }
              },
              {
                ty: 'tm',
                nm: 'Trim',
                s: { a: 0, k: 0 },
                e: {
                  a: 1,
                  k: [
                    { t: 0, s: [0], e: [78], i: { x: 0.16, y: 1 }, o: { x: 0.3, y: 1 } },
                    { t: 40, s: [78], e: [78] }
                  ]
                },
                o: { a: 0, k: 0 }
              },
              {
                ty: 'st',
                nm: 'Active Stroke',
                c: { a: 0, k: hexToLottieColor('#3B82F6') },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 8 },
                lc: 2
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

// 7. Alert Exclamation
function makeAlertExclamation() {
  return {
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 90,
    w: 180,
    h: 180,
    nm: 'Alert Exclamation',
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Warning Shape',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [90, 90, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [0, 0, 100], e: [110, 110, 100], i: { x: 0.15, y: 1 }, o: { x: 0.3, y: 1 } },
              { t: 15, s: [110, 110, 100], e: [100, 100, 100] },
              { t: 30, s: [100, 100, 100], e: [105, 105, 100] },
              { t: 45, s: [105, 105, 100], e: [100, 100, 100] }
            ]
          }
        },
        ao: 0,
        shapes: [
          {
            ty: 'gr',
            nm: 'Triangle',
            it: [
              {
                ty: 'sh',
                nm: 'Path',
                ks: {
                  a: 0,
                  k: {
                    c: true,
                    v: [[0, -50], [55, 45], [-55, 45]],
                    i: [[0, 0], [0, 0], [0, 0]],
                    o: [[0, 0], [0, 0], [0, 0]]
                  }
                }
              },
              {
                ty: 'fl',
                nm: 'Fill',
                c: { a: 0, k: hexToLottieColor('#F59E0B') },
                o: { a: 0, k: 100 }
              },
              {
                ty: 'st',
                nm: 'Stroke',
                c: { a: 0, k: [1, 1, 1, 1] },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 3 },
                lj: 2
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          },
          {
            ty: 'gr',
            nm: 'Mark',
            it: [
              {
                ty: 'sh',
                nm: 'Bar',
                ks: {
                  a: 0,
                  k: {
                    c: false,
                    v: [[0, -18], [0, 10]],
                    i: [[0, 0], [0, 0]],
                    o: [[0, 0], [0, 0]]
                  }
                }
              },
              {
                ty: 'st',
                nm: 'Mark Stroke',
                c: { a: 0, k: [0.1, 0.1, 0.1, 1] },
                o: { a: 0, k: 100 },
                w: { a: 0, k: 6 },
                lc: 2
              },
              {
                ty: 'el',
                nm: 'Dot',
                p: { a: 0, k: [0, 24] },
                s: { a: 0, k: [6, 6] }
              },
              {
                ty: 'fl',
                nm: 'Dot Fill',
                c: { a: 0, k: [0.1, 0.1, 0.1, 1] },
                o: { a: 0, k: 100 }
              },
              {
                ty: 'tr',
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ]
          }
        ],
        ip: 0,
        op: 90,
        st: 0,
        bm: 0
      }
    ]
  };
}

const templates = [
  { file: 'callouts/bouncing_arrow.json', gen: makeBouncingArrow },
  { file: 'callouts/target_reticle.json', gen: makeTargetReticle },
  { file: 'callouts/circle_highlight.json', gen: makeCircleHighlight },
  { file: 'titles/cinematic_underline.json', gen: makeCinematicUnderline },
  { file: 'titles/verified_badge.json', gen: makeVerifiedBadge },
  { file: 'data/metric_counter.json', gen: makeMetricGauge },
  { file: 'reactions/alert_exclamation.json', gen: makeAlertExclamation },
];

for (const t of templates) {
  const target = path.join(outDir, t.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(t.gen(), null, 2));
  console.log(`Generated: ${t.file} (${fs.statSync(target).size} bytes)`);
}

console.log('All open-source Lottie templates successfully built!');

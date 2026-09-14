import type { TemplateDefinition } from './types'

const image = (x: number, y: number, width: number, height: number, zIndex: number): TemplateDefinition['layers'][number] => ({
  type: 'image',
  x,
  y,
  width,
  height,
  rotation: 0,
  zIndex,
  style: { fit: 'cover', radius: 0 }
})

const title = (x: number, y: number, width: number, text = '{{album}}'): TemplateDefinition['layers'][number] => ({
  type: 'text',
  x,
  y,
  width,
  height: 0.12,
  rotation: 0,
  zIndex: 20,
  text,
  style: {
    fontSize: 64,
    color: '#ffffff',
    fontFamily: 'Microsoft YaHei',
    fontWeight: 'bold',
    align: 'left',
    letterSpacing: 0,
    lineHeight: 1.2
  }
})

export const BUILT_IN_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'single',
    name: '单图全幅',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#ffffff',
    layers: [image(0, 0, 1, 1, 1)]
  },
  {
    id: 'two-horizontal',
    name: '两张横排',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#f4f1ea',
    layers: [image(0.03, 0.04, 0.455, 0.92, 1), image(0.515, 0.04, 0.455, 0.92, 2)]
  },
  {
    id: 'two-vertical',
    name: '两张竖排',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#f4f1ea',
    layers: [image(0.05, 0.035, 0.9, 0.44, 1), image(0.05, 0.525, 0.9, 0.44, 2)]
  },
  {
    id: 'hero-two',
    name: '主图加两副图',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#f4f1ea',
    layers: [image(0.05, 0.04, 0.9, 0.58, 1), image(0.05, 0.65, 0.435, 0.31, 2), image(0.515, 0.65, 0.435, 0.31, 3)]
  },
  {
    id: 'grid-four',
    name: '四宫格',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#f4f1ea',
    layers: [
      image(0.04, 0.04, 0.445, 0.445, 1), image(0.515, 0.04, 0.445, 0.445, 2),
      image(0.04, 0.515, 0.445, 0.445, 3), image(0.515, 0.515, 0.445, 0.445, 4)
    ]
  },
  {
    id: 'grid-six',
    name: '六宫格',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#f4f1ea',
    layers: [
      image(0.04, 0.04, 0.445, 0.29, 1), image(0.515, 0.04, 0.445, 0.29, 2),
      image(0.04, 0.355, 0.445, 0.29, 3), image(0.515, 0.355, 0.445, 0.29, 4),
      image(0.04, 0.67, 0.445, 0.29, 5), image(0.515, 0.67, 0.445, 0.29, 6)
    ]
  },
  {
    id: 'cover-title',
    name: '封面加标题',
    category: 'pages',
    canvasWidth: 1080,
    canvasHeight: 1440,
    background: '#111111',
    layers: [image(0, 0, 1, 1, 1), title(0.07, 0.79, 0.86)]
  },
  {
    id: 'strip-four',
    name: '四图长条',
    category: 'long_image',
    canvasWidth: 1080,
    canvasHeight: 4320,
    background: '#f4f1ea',
    layers: [
      image(0.04, 0.012, 0.92, 0.235, 1), image(0.04, 0.257, 0.92, 0.235, 2),
      image(0.04, 0.502, 0.92, 0.235, 3), image(0.04, 0.747, 0.92, 0.235, 4)
    ]
  }
]
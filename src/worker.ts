import {Core, Vao, Program, Renderer, State, Loop, plane2D, RGBA32F} from 'glaku'
export default {}

// type ImageData = {width: number, height: number, data: Array<number>}
// const imageState = new State<ImageData | null>(null)
const mouseState = new State({x: 0, y: 0})
const resizeState = new State({width: 0, height: 0})

class PingPong {
  read
  write
  constructor(core: Core, options: any) {
    this.read = new Renderer(core, {...options, frameBuffer: [RGBA32F]})
    this.write = new Renderer(core, {...options, frameBuffer: [RGBA32F]})
  }
  swap() {
    [this.read, this.write] = [this.write, this.read]
  }
}

const main = async(canvas: HTMLCanvasElement) => {

  // const image = await new Promise<ImageData>((resolve) => {
  //   const off = imageState.on((img) => {
  //     if (img) {
  //       resolve(img)
  //       off()
  //     }
  //   })
  // })

  // const w = image.width
  // const h = image.height
  // const array = image.data

  // const ar = calcAspectRatioVec(w, h)
  // const pixels: { r: number; g: number; b: number; a: number; brightness: number, index: number }[] = []

  // for (let i = 0; i < array.length; i += 4) {
  //   const r = array[i]
  //   const g = array[i + 1]
  //   const b = array[i + 2]
  //   const a = array[i + 3]
  //   const brightness = 0.299 * r + 0.587 * g + 0.114 * b
  //   const index = (i + 4) / 4
  //   pixels.push({r, g, b, a, brightness, index})
  // }

  const core = new Core({
    canvas,
    options       : ['BLEND'],
    resizeListener: (fn) => resizeState.on(fn)
  })
  core.gl.blendFunc(core.gl.ONE, core.gl.ONE)

  const texW = 300
  const texH = 300

  const updateRenderers = new PingPong(core, {width: texW, height: texH, screenFit: false, backgroundColor: [0, 0, 0, 0]})
  const vectorRenderer = new Renderer(core, {frameBuffer: [RGBA32F], pixelRatio: 0.125})
  const renderer = new Renderer(core)

  const dataTexture = core.createTexture({
    array: new Float32Array([...Array(texW * texH)].flatMap((_, i) => {
      const r = i / (texW * texH)
      const t = r * 400
      return [r * Math.cos(t), r * Math.sin(t), 0, 0]
    })),
    width : texW,
    height: texH
  })

  const planeVao = new Vao(core, plane2D())

  const particleVao = new Vao(core, {
    ...circle(),
    instancedAttributes: ['a_instanced_uv'],
    maxInstance        : texW * texH
  })

  const vectorProgram = new Program(core, {
    id            : 'vector',
    attributeTypes: {
      a_position    : 'vec2',
      a_instanced_uv: 'vec2'
    },
    uniformTypes: {u_resolution: 'vec2'},
    texture     : {t_data: dataTexture},
    vert        : /* glsl */ `
      out vec2 loc_pos;
      void main() {
        vec2 aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        vec2 pos = texture(t_data, a_instanced_uv).xy  / aspectRatio;
        loc_pos = a_position / aspectRatio;
        gl_Position = vec4(0.15 * loc_pos.xy + 1.0 * pos, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec2 loc_pos;
      out vec4 o_color;
      void main() {
        float power = min(1.0/length(loc_pos), 0.1);
        vec2 power_vec = power * normalize(loc_pos);
        o_color = vec4(power_vec, 0.0, 1.0);
        // o_color = vec4(power);
      }`
  })

  const updateProgram = new Program(core, {
    id            : 'update',
    attributeTypes: {
      a_position    : 'vec2',
      a_textureCoord: 'vec2'
    },
    texture: {
      t_data  : dataTexture,
      t_vector: vectorRenderer.renderTexture[0]
    },
    vert: /* glsl */ `
      out vec2 v_uv;
      void main() {
        v_uv = a_textureCoord;
        gl_Position = vec4(a_position, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        vec4 data = texture(t_data, v_uv);
        vec2 pos = data.rg;
        vec2 vel = data.ba;
        vec2 uv = 0.5 * (pos + 1.0);
        vec4 vector = texture(t_vector, uv);
        vec2 newVel = 0.999 * ((-vector.rg * 0.00005) + vel);
        vec2 newPos = pos + newVel;
        vec4 result = vec4(newPos, newVel);
        o_color = vec4(result);
      }`
  })

  const debugProgram = new Program(core, {
    id            : 'debug',
    attributeTypes: {
      a_position    : 'vec2',
      a_textureCoord: 'vec2'
    },
    texture: {
      t_data  : dataTexture,
      t_vector: vectorRenderer.renderTexture[0]
    },
    vert: /* glsl */ `
      out vec2 v_uv;
      void main() {
        v_uv = a_textureCoord;
        gl_Position = vec4(a_position, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        vec4 vec = texture(t_vector, v_uv);
        vec4 data = texture(t_data, v_uv);
        vec2 pos = data.xy;
        vec2 vel = data.zw;
        o_color = vec4(vec);
      }`
  })


  const renderProgram = new Program(core, {
    id            : 'render',
    attributeTypes: {
      a_position    : 'vec2',
      a_instanced_uv: 'vec2'
    },
    uniformTypes: {u_resolution: 'vec2'},
    texture     : {t_data: dataTexture},
    vert        : /* glsl */ `
      out vec2 loc_pos;
      void main() {
        vec2 aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        vec2 pos = texture(t_data, a_instanced_uv).xy / aspectRatio;
        loc_pos = a_position / aspectRatio;
        gl_Position = vec4(0.005 * loc_pos.xy + pos, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      out vec4 o_color;
      void main() {
        o_color = vec4(0.1);
      }`
  })

  const offsetX = 0.5 * (1.0 / texW)
  const offsetY = 0.5 * (1.0 / texH)
  particleVao.setInstancedValues({a_instanced_uv: [...Array(texW * texH)].flatMap((_, i) => {
    const x = (i % texW) / texW + offsetX
    const y = Math.floor(i / texW) / texH + offsetY
    return [x, y]
  })})

  resizeState.on(({width, height}) => {
    if (!width || !height) return
    vectorProgram.setUniform({u_resolution: [width, height]})
    renderProgram.setUniform({u_resolution: [width, height]})
  })

  const init = true
  const animation = new Loop({callback: () => {


    updateRenderers.write.clear()
    vectorRenderer.clear()

    // renderer.clear()
    // vectorProgram.setTexture({t_data: updateRenderers.read.renderTexture[0]})
    // renderProgram.setTexture({t_data: updateRenderers.read.renderTexture[0]})
    // debugProgram.setTexture({t_data: updateRenderers.read.renderTexture[0]})
    vectorRenderer.render(particleVao, vectorProgram)
    renderer.render(particleVao, renderProgram)
    renderer.render(planeVao, debugProgram)

    updateRenderers.write.render(planeVao, updateProgram)
    updateRenderers.swap()
    updateProgram.setTexture({t_data: updateRenderers.read.renderTexture[0]})

  }})
  animation.start()


}

onmessage = async({data}) => {
  const {canvas, mouse, resize} = data
  if (mouse) mouseState.set(mouse)
  // if (image) imageState.set(image)
  if (resize) resizeState.set(resize)
  if (canvas) main(canvas)
}


function circle(segments = 30, radius = 0.5) {
  const vertices = []
  vertices.push(0, 0)
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    vertices.push(x, y)
  }
  const index = []
  for (let i = 1; i <= segments; i++) {
    index.push(0, i, i + 1)
  }
  return {
    attributes: {
      a_position: vertices
    },
    index
  }
}
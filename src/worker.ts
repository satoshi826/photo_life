import {Core, Vao, Program, Renderer, State, Loop, plane2D, RGBA32F, TextureWithInfo, RGBA16F} from 'glaku'
export default {}

// type ImageData = {width: number, height: number, data: Array<number>}
// const imageState = new State<ImageData | null>(null)
const cameraState = new State({x: 0, y: 0, z: 1})
const mouseState = new State({x: 0, y: 0})
const resizeState = new State({width: 1, height: 1})

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

  const texW = 100
  const texH = 100
  const vectorPixelRatio = 1.0 / 8

  const updateRenderers = new PingPong(core, {width: texW, height: texH, screenFit: false, backgroundColor: [0, 0, 0, 0]})
  const vectorRenderer = new Renderer(core, {frameBuffer: [RGBA16F, RGBA16F, RGBA16F], pixelRatio: vectorPixelRatio})

  const renderer = new Renderer(core)

  const vectorTexture = core.createTexture({
    array: new Float32Array([...Array(texW * texH)].flatMap((_, i) => {
      const r = i / (texW * texH)
      const t = r * 800
      return [r * Math.cos(t), r * Math.sin(t), 0, 0]
    })),
    width : texW,
    height: texH
  })
  const colorTexture = core.createTexture({
    array : new Float32Array([...Array(texW * texH)].flatMap((_, i) => [...hsvToRgb((i / 10) + 0, 1, 0.5), 1.0])),
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
    uniformTypes: {
      u_resolution: 'vec2',
      u_size      : 'float'
    },
    texture: {
      t_data : vectorTexture,
      t_color: colorTexture
    },
    vert: /* glsl */ `
      out vec2 v_pos;
      out vec3 v_color;
      void main() {
        vec2 aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        vec2 pos = texture(t_data, a_instanced_uv).xy / aspectRatio;
        v_color = texture(t_color, a_instanced_uv).rgb;
        v_pos = a_position / aspectRatio;
        gl_Position = vec4(u_size * v_pos.xy + pos, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec2 v_pos;
      in vec3 v_color;
      layout (location = 0) out vec4 o_r;
      layout (location = 1) out vec4 o_g;
      layout (location = 2) out vec4 o_b;
      void main() {
        float d = length(v_pos);
        float power = min(1.0/(d), 1.0);
        power = d < 0.0 ? -power : power;
        vec2 power_vec = power * normalize(v_pos);
        o_r = vec4(v_color.r * power_vec, 0.0, 1.0);
        o_g = vec4(v_color.g * power_vec, 0.0, 1.0);
        o_b = vec4(v_color.b * power_vec, 0.0, 1.0);
      }`
  })
  vectorProgram.setUniform({u_size: 0.25})

  const updateProgram = new Program(core, {
    id            : 'update',
    attributeTypes: {
      a_position    : 'vec2',
      a_textureCoord: 'vec2'
    },
    uniformTypes: {
      u_resolution: 'vec2',
      u_delta     : 'float'
    },
    texture: {
      t_data : vectorTexture,
      t_color: colorTexture,
      t_r    : vectorRenderer.renderTexture[0],
      t_g    : vectorRenderer.renderTexture[1],
      t_b    : vectorRenderer.renderTexture[2]
    },
    vert: /* glsl */ `
      out vec2 v_aspectRatio;
      out vec2 v_uv;
      void main() {
        v_uv = a_textureCoord;
        v_aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        gl_Position = vec4(a_position, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec2 v_aspectRatio;
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        vec4 data = texture(t_data, v_uv);
        vec4 color = texture(t_color, v_uv);
        vec2 pos = data.rg;
        vec2 vel = data.ba;
        vec2 uv = 0.5 * (pos / v_aspectRatio + 1.0);

        vec4 r = texture(t_r, uv);
        vec4 g = texture(t_g, uv);
        vec4 b = texture(t_b, uv);
        // vec2 acc = 4.0 * r.xy * (color.g - color.b) + 0.5 * b.xy * color.r + -1.0 * (color.b - g.xy) * (color.b - color.r);
        vec2 acc = -(r.xy + g.xy + b.xy);
        acc *= 0.000002 * u_delta;
        // float velPower = max(2000.0*length(vel), 1.0);
        // float velPower = length(vel);
        vec2 newVel =  (acc);
        vec2 newPos = mod(newVel + pos + v_aspectRatio, 2.0 * v_aspectRatio) - v_aspectRatio;
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
      t_data  : vectorTexture,
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
        o_color = vec4(0.05*vec);
      }`
  })


  const renderProgram = new Program(core, {
    id            : 'render',
    attributeTypes: {
      a_position    : 'vec2',
      a_instanced_uv: 'vec2'
    },
    uniformTypes: {
      u_resolution: 'vec2',
      u_camera    : 'vec3'
    },
    texture: {
      t_data : vectorTexture,
      t_color: colorTexture
    },
    vert: /* glsl */ `
      out vec2 loc_pos;
      out vec3 color;
      vec3 hsl2rgb( in vec3 c ){
        vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
        return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
      }
      void main() {
        color = texture(t_color, a_instanced_uv).rgb;
        vec2 aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        vec2 pos = texture(t_data, a_instanced_uv).xy / aspectRatio;
        loc_pos = a_position / aspectRatio;
        gl_Position = vec4(0.01 * loc_pos.xy + u_camera.z * pos - u_camera.xy, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec3 color;
      out vec4 o_color;
      void main() {
        o_color = vec4(color, 1.0);
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
    updateProgram.setUniform({u_resolution: [width, height]})
    renderProgram.setUniform({u_resolution: [width, height]})
  })

  cameraState.on((camera) => {
    renderProgram.setUniform({u_camera: [camera.x, camera.y, camera.z]})
  })

  const animation = new Loop({callback: ({delta}) => {
    renderer.clear()
    updateRenderers.write.clear()
    vectorRenderer.clear()
    vectorRenderer.render(particleVao, vectorProgram)
    renderer.render(particleVao, renderProgram)
    // renderer.render(planeVao, debugProgram)

    updateProgram.setUniform({u_delta: delta})
    updateRenderers.write.render(planeVao, updateProgram)
    updateRenderers.swap()
    updateProgram.setTexture({t_data: updateRenderers.read.renderTexture[0]})
  }})
  animation.start()


}

onmessage = async({data}) => {
  const {canvas, mouse, resize, camera} = data
  if (mouse) mouseState.set(mouse)
  if (camera) cameraState.set(camera)
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

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c

  const [r, g, b] =
      h < 60 ? [c, x, 0] :
        h < 120 ? [x, c, 0] :
          h < 180 ? [0, c, x] :
            h < 240 ? [0, x, c] :
              h < 300 ? [x, 0, c] :
                [c, 0, x]

  return [r + m, g + m, b + m]
}
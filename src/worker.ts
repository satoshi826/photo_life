import {Core, Vao, Program, Renderer, State, Loop, plane2D, RGBA32F, TextureWithInfo, RGBA16F} from 'glaku'
export default {}

// type ImageData = {width: number, height: number, data: Array<number>}
// const imageState = new State<ImageData | null>(null)
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

  const texW = 500
  const texH = 400
  const vectorPixelRatio = 1.0 / 16

  const updateRenderers = new PingPong(core, {width: texW, height: texH, screenFit: false, backgroundColor: [0, 0, 0, 0]})
  const vectorRenderer = new Renderer(core, {frameBuffer: [RGBA32F], pixelRatio: vectorPixelRatio})
  const microVectorRenderer = new Renderer(core, {frameBuffer: [RGBA32F], pixelRatio: 4 * vectorPixelRatio})

  const renderer = new Renderer(core)

  const vectorTexture = core.createTexture({
    array: new Float32Array([...Array(texW * texH)].flatMap((_, i) => {
      const r = i / (texW * texH)
      const t = r * 2000
      return [r * Math.cos(t), r * Math.sin(t), 0.000 * Math.cos(t), 0.000 * Math.sin(t)]
    })),
    width : texW,
    height: texH
  })

  const colorTexture = core.createTexture({
    array: new Float32Array([...Array(texW * texH)].flatMap((_, i) => {
      // const r = i / (texW * texH)
      // const t = r * 1000000
      return [1, 1, 1, 0.0]
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
    uniformTypes: {
      u_resolution: 'vec2',
      u_size      : 'float'
    },
    texture: {t_data: vectorTexture},
    vert   : /* glsl */ `
      out vec2 loc_pos;
      void main() {
        vec2 aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        vec2 pos = texture(t_data, a_instanced_uv).xy / aspectRatio;
        loc_pos = a_position / aspectRatio;
        gl_Position = vec4(u_size * loc_pos.xy + pos, 1.0, 1.0);
    }`,
    frag: /* glsl */`
      in vec2 loc_pos;
      out vec4 o_color;
      void main() {
        float d = length(loc_pos);
        float power = min(1.0/(d), 1.0);
        power = d < 0.001 / u_size ? -2.0*power : power;
        vec2 power_vec = power * normalize(loc_pos);
        o_color = vec4(power_vec, 0.0, 1.0);
      }`
  })

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
      t_data       : vectorTexture,
      t_vector     : vectorRenderer.renderTexture[0],
      t_microVector: microVectorRenderer.renderTexture[0]
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
        vec2 pos = data.rg;
        vec2 vel = data.ba;
        vec2 uv = 0.5 * (pos / v_aspectRatio + 1.0);

        vec4 vector = texture(t_vector, uv);
        vec4 microVector = texture(t_microVector, uv);
        vec4 sumVector = vector + 0.05 * microVector;

        vec2 acc = -sumVector.rg * 0.000000005 * u_delta;
        float velPower = max(1000.0*length(vel), 1.0);
        vec2 newVel =  (acc / velPower) + 0.999 * vel;
        vec2 newPos = mod(newVel * v_aspectRatio + pos + v_aspectRatio, 2.0 * v_aspectRatio) - v_aspectRatio;
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
    uniformTypes: {u_resolution: 'vec2'},
    texture     : {t_data: vectorTexture},
    vert        : /* glsl */ `
      out vec2 loc_pos;
      out vec3 color;
      vec3 hsl2rgb( in vec3 c ){
        vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
        return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
      }
      void main() {
        color = hsl2rgb(vec3(float(gl_InstanceID+20000) * 0.00002, 1.0, 0.1));
        vec2 aspectRatio = u_resolution / min(u_resolution.x, u_resolution.y);
        vec2 pos = texture(t_data, a_instanced_uv).xy / aspectRatio;
        loc_pos = a_position / aspectRatio;
        gl_Position = vec4(0.004 * loc_pos.xy + pos, 1.0, 1.0);
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

  const animation = new Loop({callback: ({delta}) => {
    renderer.clear()
    updateRenderers.write.clear()
    vectorRenderer.clear()
    vectorProgram.setUniform({u_size: 0.25})
    vectorRenderer.render(particleVao, vectorProgram)
    vectorProgram.setUniform({u_size: 0.05})
    microVectorRenderer.render(particleVao, vectorProgram)
    renderer.render(particleVao, renderProgram)
    // renderer.render(planeVao, debugProgram)

    updateProgram.setUniform({u_delta: delta * 1.0})
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

const getBlurPass = (core: Core, targetTex : TextureWithInfo, pixelRatio = 1) => {

  const basePixelRatio = core.pixelRatio * pixelRatio
  const pixelRatios = [1, 0.5, 0.25, 0.125, 0.03125]

  const renderers = pixelRatios.map(pixelRatio => [
    new Renderer(core, {frameBuffer: [RGBA16F], pixelRatio, backgroundColor: [0, 0, 0, 0]}),
    new Renderer(core, {frameBuffer: [RGBA16F], pixelRatio, backgroundColor: [0, 0, 0, 0]})
  ])

  const blurProgram = blurEffect(core, targetTex)
  const planeVao = new Vao(core, {
    id: 'blurPlane',
    ...plane2D()
  })

  return {
    render: () => {
      renderers.forEach((renderer, index) => {
        renderer[0].clear()
        renderer[1].clear()
        const preRenderer = index === 0 ? null : renderers[index - 1]
        const baseTex = preRenderer?.[1].renderTexture[0] ?? targetTex
        const invPixelRatio = (preRenderer?.[0].pixelRatio ?? basePixelRatio) / renderer[0].pixelRatio
        blurProgram.setUniform({u_invPixelRatio: invPixelRatio})
        blurProgram.setUniform({u_isHorizontal: 1})
        blurProgram.setTexture({t_preBlurTexture: baseTex})
        renderer[0].render(planeVao, blurProgram)
        blurProgram.setUniform({u_invPixelRatio: 1})
        blurProgram.setUniform({u_isHorizontal: 0})
        blurProgram.setTexture({t_preBlurTexture: renderer[0].renderTexture[0]})
        renderer[1].render(planeVao, blurProgram)
      })
    },
    results: renderers.map(renderer => renderer[1].renderTexture[0])
  }
}

const blurEffect = (core: Core, texture: TextureWithInfo) => new Program(core, {
  id            : 'blurEffect',
  attributeTypes: {
    a_position    : 'vec2',
    a_textureCoord: 'vec2'
  },
  uniformTypes: {
    u_isHorizontal : 'bool',
    u_invPixelRatio: 'float'
  },
  texture: {
    t_preBlurTexture: texture
  },
  vert: /* glsl */ `
        out vec2 v_uv;
        void main() {
          v_uv  = a_textureCoord;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }`,
  frag: /* glsl */`
        in vec2 v_uv;
        out vec4 o_color;

        const float[5] weights = float[](0.2270270, 0.1945945, 0.1216216, 0.0540540, 0.0162162);

        ivec2 clampCoord(ivec2 coord, ivec2 size) {
          return max(min(coord, size - 1), 0);
        }

        void main() {
          int sampleStep = int(2.0 * u_invPixelRatio);

          ivec2 coord =   ivec2(u_invPixelRatio * gl_FragCoord.xy);
          ivec2 size = textureSize(t_preBlurTexture, 0);
          vec3 sum = weights[0] * texelFetch(t_preBlurTexture, coord, 0).rgb;

          ivec2 offsetUnit = u_isHorizontal ? ivec2(1, 0) : ivec2(0, 1);
          ivec2 offset;

          offset = offsetUnit * sampleStep * 1;

          sum += weights[1] * texelFetch(t_preBlurTexture, clampCoord(coord + offset, size), 0).rgb;
          sum += weights[1] * texelFetch(t_preBlurTexture, clampCoord(coord - offset, size), 0).rgb;

          offset = offsetUnit * sampleStep * 2;
          sum += weights[2] * texelFetch(t_preBlurTexture, clampCoord(coord + offset, size), 0).rgb;
          sum += weights[2] * texelFetch(t_preBlurTexture, clampCoord(coord - offset, size), 0).rgb;

          offset = offsetUnit * sampleStep * 3;
          sum += weights[3] * texelFetch(t_preBlurTexture, clampCoord(coord + offset, size), 0).rgb;
          sum += weights[3] * texelFetch(t_preBlurTexture, clampCoord(coord - offset, size), 0).rgb;

          offset = offsetUnit * sampleStep * 4;
          sum += weights[4] * texelFetch(t_preBlurTexture, clampCoord(coord + offset, size), 0).rgb;
          sum += weights[4] * texelFetch(t_preBlurTexture, clampCoord(coord - offset, size), 0).rgb;

          o_color = vec4(sum, 1.0);
        }`
})


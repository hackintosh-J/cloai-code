/// <reference types="vite/client" />

declare const __APP_VERSION__: string

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.svg?raw' {
  const raw: string
  export default raw
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}

declare module '*.ico' {
  const src: string
  export default src
}

declare module '*.lottie' {
  const src: string
  export default src
}

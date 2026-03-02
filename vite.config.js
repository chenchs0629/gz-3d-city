import { defineConfig } from 'vite'

export default defineConfig({
  // 基础路径配置
  // 如果部署到域名根目录，使用 '/'
  // 如果部署到子目录（如 https://yoursite.com/gz-3d-city/），使用 '/gz-3d-city/'
  base: './',
  
  // 构建配置
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 生成源码映射，便于调试（生产环境可设为 false）
    sourcemap: false,
    // 资源文件大小警告阈值（kb）
    chunkSizeWarningLimit: 2000
  },
  
  // 开发服务器配置
  server: {
    port: 5173,
    open: true
  }
})

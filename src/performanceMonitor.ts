export class PerformanceMonitor {
  private container: HTMLDivElement;
  private fpsElement: HTMLDivElement;
  private cpuElement: HTMLDivElement;
  private memoryElement: HTMLDivElement;
  private renderElement: HTMLDivElement;
  private gpuElement: HTMLDivElement;
  private toggleButton: HTMLButtonElement;
  
  private visible: boolean = false;
  private frameCount: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 0;
  private frameBuffer: number[] = [];
  private maxFrames: number = 60;
  
  private renderer: THREE.WebGLRenderer | null = null;
  private gpuPanel: any = null;
  
  // CPU monitoring
  private cpuUsage: number = 0;
  private frameTimes: number[] = [];
  private maxFrameTimes: number = 60;
  private performanceObserver: PerformanceObserver | null = null;
  private lastCPUTime: number = 0;
  private lastSystemTime: number = 0;

  constructor() {
    this.createUI();
    this.setupEventListeners();
    this.setupCPUMonitoring();
  }

  private createUI(): void {
    // Create toggle button
    this.toggleButton = document.createElement('button');
    this.toggleButton.textContent = 'Show Stats';
    this.toggleButton.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 10000;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      border: 1px solid #444;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      cursor: pointer;
    `;
    document.body.appendChild(this.toggleButton);

    // Create stats container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 50px;
      right: 10px;
      width: 220px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      border-radius: 4px;
      z-index: 9999;
      display: none;
      border: 1px solid #444;
    `;

    // FPS display
    this.fpsElement = document.createElement('div');
    this.fpsElement.style.cssText = `
      margin-bottom: 8px;
      padding: 4px;
      background: rgba(0, 100, 0, 0.3);
      border-radius: 2px;
    `;

    // CPU display
    this.cpuElement = document.createElement('div');
    this.cpuElement.style.cssText = `
      margin-bottom: 8px;
      padding: 4px;
      background: rgba(255, 100, 0, 0.3);
      border-radius: 2px;
    `;

    // Memory display
    this.memoryElement = document.createElement('div');
    this.memoryElement.style.cssText = `
      margin-bottom: 8px;
      padding: 4px;
      background: rgba(0, 0, 100, 0.3);
      border-radius: 2px;
    `;

    // Render info display
    this.renderElement = document.createElement('div');
    this.renderElement.style.cssText = `
      margin-bottom: 8px;
      padding: 4px;
      background: rgba(100, 100, 0, 0.3);
      border-radius: 2px;
    `;

    // GPU display
    this.gpuElement = document.createElement('div');
    this.gpuElement.style.cssText = `
      padding: 4px;
      background: rgba(100, 0, 100, 0.3);
      border-radius: 2px;
    `;

    this.container.appendChild(this.fpsElement);
    this.container.appendChild(this.cpuElement);
    this.container.appendChild(this.memoryElement);
    this.container.appendChild(this.renderElement);
    this.container.appendChild(this.gpuElement);
    document.body.appendChild(this.container);
  }

  private setupEventListeners(): void {
    this.toggleButton.addEventListener('click', () => {
      this.toggle();
    });

    // Keyboard shortcut (P key) to toggle
    document.addEventListener('keydown', (event) => {
      if (event.key === 'p' || event.key === 'P') {
        this.toggle();
      }
    });
  }

  private setupCPUMonitoring(): void {
    // Try to set up Performance Observer for more detailed timing
    if ('PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            if (entry.entryType === 'measure' || entry.entryType === 'navigation') {
              this.frameTimes.push(entry.duration);
              if (this.frameTimes.length > this.maxFrameTimes) {
                this.frameTimes.shift();
              }
            }
          }
        });
        
        this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
      } catch (e) {
        console.log('PerformanceObserver not fully supported');
      }
    }

    // Fallback CPU monitoring using timing
    this.lastCPUTime = performance.now();
    this.lastSystemTime = Date.now();
  }

  public setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    
    // Try to get GPU timing extension
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') || 
                  gl.getExtension('EXT_disjoint_timer_query');
      if (ext) {
        this.gpuPanel = { ext, queries: [] };
      }
    } catch (e) {
      console.log('GPU timing not available');
    }
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
    this.toggleButton.textContent = this.visible ? 'Hide Stats' : 'Show Stats';
  }

  public update(): void {
    if (!this.visible) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    
    this.frameCount++;
    this.frameBuffer.push(1000 / deltaTime);
    
    if (this.frameBuffer.length > this.maxFrames) {
      this.frameBuffer.shift();
    }

    // Update every 100ms
    if (deltaTime > 100) {
      this.fps = this.frameBuffer.reduce((a, b) => a + b, 0) / this.frameBuffer.length;
      this.lastTime = currentTime;
      
      this.updateFPS();
      this.updateCPU();
      this.updateMemory();
      this.updateRenderInfo();
      this.updateGPU();
    }
  }

  private updateFPS(): void {
    const minFps = Math.min(...this.frameBuffer);
    const maxFps = Math.max(...this.frameBuffer);
    
    this.fpsElement.innerHTML = `
      <strong>FPS</strong><br>
      Current: ${this.fps.toFixed(1)}<br>
      Min: ${minFps.toFixed(1)}<br>
      Max: ${maxFps.toFixed(1)}
    `;
  }

  private updateCPU(): void {
    const currentTime = performance.now();
    const currentSystemTime = Date.now();
    
    // Calculate frame time
    const frameTime = currentTime - this.lastCPUTime;
    const systemTimeDelta = currentSystemTime - this.lastSystemTime;
    
    // Estimate CPU usage based on frame timing
    // This is an approximation - real CPU usage requires native APIs
    const targetFrameTime = 1000 / 60; // 60 FPS target
    const cpuLoad = Math.min(100, (frameTime / targetFrameTime) * 100);
    
    // Smooth the CPU usage calculation
    this.cpuUsage = this.cpuUsage * 0.9 + cpuLoad * 0.1;
    
    // Calculate average frame time
    const avgFrameTime = this.frameTimes.length > 0 
      ? this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length 
      : frameTime;
    
    this.cpuElement.innerHTML = `
      <strong>CPU Usage</strong><br>
      Estimated: ${this.cpuUsage.toFixed(1)}%<br>
      Frame Time: ${frameTime.toFixed(2)}ms<br>
      Avg Frame: ${avgFrameTime.toFixed(2)}ms<br>
      Target: ${targetFrameTime.toFixed(1)}ms
    `;
    
    this.lastCPUTime = currentTime;
    this.lastSystemTime = currentSystemTime;
  }

  private updateMemory(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      const used = (memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
      const total = (memory.totalJSHeapSize / 1024 / 1024).toFixed(2);
      const limit = (memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
      
      this.memoryElement.innerHTML = `
        <strong>Memory (MB)</strong><br>
        Used: ${used}<br>
        Total: ${total}<br>
        Limit: ${limit}
      `;
    } else {
      this.memoryElement.innerHTML = `
        <strong>Memory</strong><br>
        Not available in this browser
      `;
    }
  }

  private updateRenderInfo(): void {
    if (this.renderer) {
      const info = this.renderer.info;
      
      this.renderElement.innerHTML = `
        <strong>Render Info</strong><br>
        Calls: ${info.render.calls}<br>
        Triangles: ${info.render.triangles}<br>
        Points: ${info.render.points}<br>
        Lines: ${info.render.lines}<br>
        Textures: ${info.memory.textures}<br>
        Geometries: ${info.memory.geometries}
      `;
    } else {
      this.renderElement.innerHTML = `
        <strong>Render Info</strong><br>
        Renderer not set
      `;
    }
  }

  private updateGPU(): void {
    if (this.gpuPanel) {
      this.gpuElement.innerHTML = `
        <strong>GPU</strong><br>
        Timing: Available<br>
        Queries: ${this.gpuPanel.queries.length}
      `;
    } else {
      this.gpuElement.innerHTML = `
        <strong>GPU</strong><br>
        Timing: Not available<br>
        WebGL Extensions limited
      `;
    }
  }

  public destroy(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.toggleButton.parentNode) {
      this.toggleButton.parentNode.removeChild(this.toggleButton);
    }
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
  }
}

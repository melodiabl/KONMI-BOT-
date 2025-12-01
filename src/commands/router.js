// Handle button selections (numbered options)
    for (let i = 1; i <= 9; i++) {
      lazy.set(`/button_${i}`, async (ctx) => {
        // This will be handled by storing the selection in context for the next command
        ctx.buttonSelection = i
        return { success: true, message: `✅ Opción ${i} seleccionada. Ahora puedes usar comandos que requieran selección.` }
      })
    }
    // Handle button selections - redirect to actual commands
    lazy.set('/help', async (ctx) => {
      const { help } = await import('./menu.js')
      return help(ctx)
    })
    lazy.set('/mybots', async (ctx) => {
      return { success: true, text: '🤖 Función de sub-bots próximamente...' }
    })
    lazy.set('/video', async (ctx) => {
      return { success: true, text: '📥 Función de descarga próximamente...' }
    })
    lazy.set('/poll', async (ctx) => {
      return { success: true, text: '🎯 Función de encuestas próximamente...' }
    })
    lazy.set('/status', async (ctx) => {
      return { success: true, text: '🛠️ Estado del sistema: OK' }
    })
    lazy.set('/copy', async (ctx) => {
      return { success: true, text: '📱 Función de copiar código próximamente...' }
    })
    lazy.set('/admin', async (ctx) => {
      if (!ctx.isOwner) return { success: false, text: '❌ Solo para administradores' }
      return { success: true, text: '👑 Panel de administración próximamente...' }
    })

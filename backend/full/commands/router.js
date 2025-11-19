// commands/router.js — wrapper estable que delega al router fijo
import { dispatch as dispatchFixed } from './router.fixed.js'

export async function dispatch(ctx = {}) {
  return dispatchFixed(ctx)
}

export default { dispatch }


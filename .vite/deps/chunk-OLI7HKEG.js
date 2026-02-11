import {
  require_react
} from "./chunk-IGR7ZU6C.js";
import {
  __toESM
} from "./chunk-PLDDJCW6.js";

// node_modules/@radix-ui/primitive/dist/index.mjs
function composeEventHandlers(originalEventHandler, ourEventHandler, { checkForDefaultPrevented = true } = {}) {
  return function handleEvent(event) {
    originalEventHandler?.(event);
    if (checkForDefaultPrevented === false || !event.defaultPrevented) {
      return ourEventHandler?.(event);
    }
  };
}

// node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
var React = __toESM(require_react(), 1);
var useLayoutEffect2 = globalThis?.document ? React.useLayoutEffect : () => {
};

export {
  composeEventHandlers,
  useLayoutEffect2
};
//# sourceMappingURL=chunk-OLI7HKEG.js.map

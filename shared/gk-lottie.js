import { setWasmUrl } from "./vendor/dotlottie/dotlottie-wc.js?v=1";

setWasmUrl(new URL("./vendor/dotlottie/dotlottie-player.wasm", import.meta.url).href);


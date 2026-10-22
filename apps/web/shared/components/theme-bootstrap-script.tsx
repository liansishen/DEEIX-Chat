import {
  THEME_PRESET_STORAGE_KEY,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
  THEMES,
} from "@/shared/model/theme";
import { CUSTOM_THEME_STORAGE_KEY } from "@/shared/model/custom-theme";
import { THEME_COLOR_TOKENS } from "@/shared/model/theme-presets";

const BOOTSTRAP_ALPHA_META = Object.fromEntries(
  Object.entries(THEME_COLOR_TOKENS).map(([k, meta]) => [k, meta.allowAlpha]),
);

// Runs before first paint so a stored dark theme never flashes light while
// ThemeProvider waits for hydration. Built at module scope from the shared
// constants, so storage keys and preset names cannot drift from applyTheme().
// `next/script` cannot run this early in static export, hence the raw <script>.
const THEME_BOOTSTRAP_SCRIPT = [
  "(function(){try{",
  "var d=document.documentElement,s=window.localStorage;",
  `var t=s.getItem(${JSON.stringify(THEME_STORAGE_KEY)}),p=s.getItem(${JSON.stringify(THEME_PRESET_STORAGE_KEY)});`,
  `if(${JSON.stringify(THEMES)}.indexOf(t)<0)t="system";`,
  `if(${JSON.stringify(THEME_PRESETS)}.indexOf(p)<0)p="default";`,
  'var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;',
  'd.classList.remove("light","dark");d.classList.add(r);d.dataset.theme=p;d.style.colorScheme=r;',
  `var c=s.getItem(${JSON.stringify(CUSTOM_THEME_STORAGE_KEY)});`,
  'if(c){try{var j=JSON.parse(c);if(j&&j.version===1&&typeof j==="object"){var o=r==="dark"?j.dark:j.light;if(o&&typeof o==="object"){var m=' +
  JSON.stringify(BOOTSTRAP_ALPHA_META) +
  ',h6=/^#[0-9a-fA-F]{6}$/,h8=/^#[0-9a-fA-F]{8}$/;for(var k in o){if(Object.prototype.hasOwnProperty.call(m,k)){var v=o[k];if(typeof v==="string"&&(h6.test(v)||(m[k]&&h8.test(v))))d.style.setProperty("--"+k,v);}}}}}catch(_){}}',
  "}catch(e){}})();",
].join("");

export function ThemeBootstrapScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: build-time constant with no user input; must be an inline <script> to run before paint.
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />;
}
